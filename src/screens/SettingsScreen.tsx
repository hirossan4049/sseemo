import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Alert,
  ScrollView,
  TextInput,
  Share,
  Platform,
  StyleSheet,
} from 'react-native';
import RNFS from 'react-native-fs';
import QuickCrypto from 'react-native-quick-crypto';
import { clearMnemonic, loadMnemonic } from '@/crypto/keychain';
import {
  lock,
  setAutoLockSeconds,
  setPassphrase,
  isPassphraseEnabled,
} from '@/state/keyStore';
import {
  listBucketIds,
  getActiveBucketId,
  getActiveBucket,
  setActiveBucketId,
} from '@/state/bucketStore';
import { subscribe, fetchProducts } from '@/iap';
import { refreshSubscriptionStatus } from '@/iap/verify';
import {
  computeUsage,
  UsageStatus,
  checkAndNotify,
  reportUsage,
  getReportEndpoint,
  setReportEndpoint,
  setReportToken,
  hasReportToken,
} from '@/state/usage';
import { deleteAccount } from '@/auth/accountDelete';
import { generate12WordMnemonic } from '@/crypto/mnemonic';
import { saveMnemonic } from '@/crypto/keychain';
import { addBucket } from '@/state/bucketStore';
import { headBucket } from '@/s3/client';
import { useTheme, radii, type } from '@/theme';
import {
  Screen,
  NavBar,
  Card,
  CardRow,
  Chip,
  Button,
  SectionLabel,
  UsageBar,
  Wordmark,
  BrandMark,
} from '@/components/ui';

export default function SettingsScreen() {
  const t = useTheme();
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [bucketIds, setBucketIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hasPp, setHasPp] = useState(false);
  const [reportUrl, setReportUrl] = useState<string>('');
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const bucket = await getActiveBucket();
    const mode = bucket?.mode ?? 'managed';
    await refreshSubscriptionStatus();
    const u = await computeUsage(mode);
    setUsage(u);
    reportUsage(u, mode).catch(() => {});
    setBucketIds(await listBucketIds());
    setActiveId(await getActiveBucketId());
    setHasPp(await isPassphraseEnabled());
    setReportUrl((await getReportEndpoint()) ?? '');
    setHasToken(await hasReportToken());
    await checkAndNotify(u, level =>
      Alert.alert(
        level === 95 ? 'もうすぐいっぱいです' : '残りが少なくなってきました',
        level === 95
          ? 'お支払いに進むか、いらないものを片付けてみてください。'
          : 'あと少しで上限です。いっぱいになると、新しいファイルは置けなくなります。',
      ),
    );
  }

  async function exportMnemonic() {
    const m = await loadMnemonic();
    if (!m) return;
    Alert.alert('リカバリーフレーズ', m);
  }

  async function exportMnemonicToFile() {
    const m = await loadMnemonic();
    if (!m) {
      Alert.alert('エラー', 'リカバリーフレーズが見つかりません');
      return;
    }
    const opaqueDir = `${RNFS.CachesDirectoryPath}/ssf-share`;
    await RNFS.mkdir(opaqueDir).catch(() => {});
    const opaqueId = Buffer.from(QuickCrypto.randomBytes(12) as any).toString('hex');
    const out = `${opaqueDir}/sseemo-recovery-${opaqueId}.txt`;
    const body =
      'sseemo リカバリーフレーズ (BIP-39 12 words)\n' +
      '取扱注意: このフレーズを知る者はあなたのすべてのファイルを復号できます。\n\n' +
      m +
      '\n';
    await RNFS.writeFile(out, body, 'utf8');
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { url: `file://${out}` }
          : { url: `file://${out}`, message: body, title: 'sseemo Recovery Phrase' },
      );
    } finally {
      const ttlMs = Platform.OS === 'android' ? 5000 : 0;
      setTimeout(() => {
        RNFS.unlink(out).catch(() => {});
      }, ttlMs);
    }
  }

  async function regenerate() {
    Alert.alert('鍵の再生成', '既存データは復号不可になります。本当に再生成しますか?', [
      { text: 'キャンセル' },
      {
        text: '再生成',
        style: 'destructive',
        onPress: async () => {
          const m = generate12WordMnemonic();
          await saveMnemonic(m);
          lock();
          Alert.alert('新しいフレーズ', m);
        },
      },
    ]);
  }

  async function importMnemonic() {
    Alert.prompt?.('インポート', '12語をスペース区切りで入力', async (text: string) => {
      if (!text) return;
      await saveMnemonic(text.trim().toLowerCase());
      lock();
      Alert.alert('完了', '再起動してください');
    });
  }

  async function addManagedBucket() {
    const id = `b-${Date.now()}`;
    await addBucket({
      id,
      mode: 'managed',
      endpoint: 'https://managed.secstorage.app',
      region: 'auto',
      bucket: 'managed',
      accessKeyId: 'managed',
      secretAccessKey: 'managed',
      label: 'マネージド',
    });
    refresh();
  }

  async function addByoBucket() {
    Alert.prompt?.(
      '互換S3バケット',
      'endpoint|region|bucket|accessKey|secretKey をパイプ区切りで',
      async (text: string) => {
        if (!text) return;
        const [endpoint, region, bucket, ak, sk] = text.split('|');
        if (!endpoint || !bucket || !ak || !sk) {
          Alert.alert('入力不足');
          return;
        }
        const id = `b-${Date.now()}`;
        const creds = {
          id,
          mode: 'byo' as const,
          endpoint,
          region: region || 'auto',
          bucket,
          accessKeyId: ak,
          secretAccessKey: sk,
        };
        try {
          const ok = await headBucket(creds);
          if (!ok) throw new Error('接続失敗');
          await addBucket(creds);
          refresh();
        } catch (e: any) {
          Alert.alert('追加失敗', e.message);
        }
      },
    );
  }

  async function buy() {
    try {
      await fetchProducts();
      await subscribe();
      await refresh();
    } catch (e: any) {
      Alert.alert('IAP', e.message);
    }
  }

  async function setAutoLock(secs: number) {
    await setAutoLockSeconds(secs);
    Alert.alert('OK', `${secs}秒で自動ロック`);
  }

  async function enablePp() {
    Alert.prompt?.('パスフレーズ設定', '8文字以上推奨', async (pp: string) => {
      if (!pp) return;
      await setPassphrase(pp);
      setHasPp(true);
    });
  }

  async function purge() {
    Alert.alert('すべて消しますか?', 'お預かりしていたものは戻せません。', [
      { text: 'やめておく' },
      {
        text: '消す',
        style: 'destructive',
        onPress: async () => {
          await deleteAccount();
          Alert.alert(
            '消しました',
            'お支払いは App Store > サブスクリプション から止めてください。',
          );
        },
      },
    ]);
  }

  if (!usage)
    return (
      <Screen testID="settings-screen">
        <View />
      </Screen>
    );

  const usagePct = usage.pct / 100;
  const usageTone: 'default' | 'warn' | 'danger' =
    usage.pct >= 95 ? 'danger' : usage.pct >= 80 ? 'warn' : 'default';

  return (
    <Screen testID="settings-screen">
      <NavBar sub="設定" title="あなたのアカウント" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Account card */}
        <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 }}>
          <View
            style={{
              backgroundColor: t.surface,
              borderColor: t.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radii['2xl'],
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                backgroundColor: t.brand1,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>SY</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }} numberOfLines={1}>
                {usage.paid ? 'Apple ID で接続中' : 'Apple ID で接続中'}
              </Text>
              <Text style={{ fontSize: 12, color: t.text2, marginTop: 2 }}>
                Sign in with Apple
              </Text>
            </View>
            <Chip
              label={usage.paid ? 'ご利用中' : '無料の範囲内'}
              tone={usage.paid ? 'accent' : 'default'}
            />
          </View>
        </View>

        {/* Usage */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <View
            style={{
              backgroundColor: t.surface,
              borderColor: t.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radii['2xl'],
              padding: 16,
            }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}>
              <View>
                <Text style={[type.sectionLabel, { color: t.text3, padding: 0 }]}>
                  今の使い方
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
                  <Text style={[type.num, { fontSize: 26, fontWeight: '700', color: t.text }]}>
                    {formatSizeShort(usage.used)}
                  </Text>
                  <Text style={[type.num, { fontSize: 14, color: t.text2 }]}>
                    / {formatSizeShort(usage.limit)}
                  </Text>
                </View>
              </View>
            </View>
            <UsageBar value={usagePct} tone={usageTone} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontSize: 11, color: t.text2 }}>鍵をかけたあとの大きさで計算</Text>
              {usage.pct >= 80 && (
                <Text style={{ fontSize: 11, color: t.warning }}>
                  あと少しでいっぱいです
                </Text>
              )}
            </View>
            {usage.hardStopped && (
              <Text style={{ color: t.danger, fontWeight: '700', marginTop: 8, fontSize: 12 }}>
                いっぱいです。今は新しいファイルを置けません。
              </Text>
            )}
          </View>
        </View>

        {/* Buckets */}
        <SectionLabel>保管場所</SectionLabel>
        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            {bucketIds.map((id, i, a) => (
              <CardRow
                key={id}
                last={i === a.length - 1}
                onPress={async () => {
                  if (id !== activeId) {
                    await setActiveBucketId(id);
                    refresh();
                  }
                }}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: t.surface2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ color: t.text2, fontSize: 14 }}>☁</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: t.text }}>{id}</Text>
                  {id === activeId && (
                    <Text style={{ fontSize: 12, color: t.text3, marginTop: 1 }}>
                      今使っている
                    </Text>
                  )}
                </View>
                {id === activeId && <Chip label="アクティブ" tone="accent" />}
              </CardRow>
            ))}
          </Card>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Button small variant="secondary" title="おまかせを追加" onPress={addManagedBucket} style={{ flex: 1 }} />
            <Button small variant="secondary" title="互換S3を追加" onPress={addByoBucket} style={{ flex: 1 }} />
          </View>
        </View>

        {/* Keys */}
        <SectionLabel>合言葉と鍵</SectionLabel>
        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            <CardRow onPress={exportMnemonic} testID="settings-export-mnemonic-btn">
              <View style={iconBox(t)}>
                <Text style={{ color: t.text2 }}>🔑</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={rowTitle(t)}>リカバリーフレーズを表示</Text>
                <Text style={rowSub(t)}>画面に12語を表示します</Text>
              </View>
              <Text style={{ color: t.text3 }}>›</Text>
            </CardRow>
            <CardRow onPress={exportMnemonicToFile} testID="settings-export-mnemonic-file-btn">
              <View style={iconBox(t)}>
                <Text style={{ color: t.text2 }}>⤓</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={rowTitle(t)}>ファイルに保存</Text>
                <Text style={rowSub(t)}>共有シートで AirDrop / iCloud / 印刷</Text>
              </View>
              <Text style={{ color: t.text3 }}>›</Text>
            </CardRow>
            <CardRow onPress={importMnemonic}>
              <View style={iconBox(t)}>
                <Text style={{ color: t.text2 }}>⤒</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={rowTitle(t)}>インポート</Text>
                <Text style={rowSub(t)}>別端末からフレーズを取り込み</Text>
              </View>
              <Text style={{ color: t.text3 }}>›</Text>
            </CardRow>
            <CardRow onPress={regenerate} last>
              <View style={iconBox(t)}>
                <Text style={{ color: t.danger }}>↻</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: t.danger }}>鍵を作り直す</Text>
                <Text style={rowSub(t)}>既存データは復号不可になります</Text>
              </View>
            </CardRow>
          </Card>
        </View>

        {/* Lock */}
        <SectionLabel>ロック</SectionLabel>
        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            <CardRow onPress={!hasPp ? enablePp : undefined}>
              <View style={iconBox(t)}>
                <Text style={{ color: t.text2 }}>🔐</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={rowTitle(t)}>パスフレーズで開く</Text>
                <Text style={rowSub(t)}>{hasPp ? '設定済' : '未設定'}</Text>
              </View>
              <Text style={{ color: t.text3 }}>›</Text>
            </CardRow>
            <CardRow last>
              <View style={iconBox(t)}>
                <Text style={{ color: t.text2 }}>⏱</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 14, color: t.text }}>自動ロック</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Button small variant="secondary" title="30秒" onPress={() => setAutoLock(30)} />
                <Button small variant="secondary" title="5分" onPress={() => setAutoLock(300)} />
                <Button small variant="secondary" title="1時間" onPress={() => setAutoLock(3600)} />
              </View>
            </CardRow>
          </Card>
        </View>

        {/* Payment */}
        <SectionLabel>お支払い</SectionLabel>
        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            <CardRow>
              <Text style={{ flex: 1, color: t.text2 }}>状態</Text>
              <Text style={{ color: t.text, fontWeight: '500' }}>
                {usage.paid ? 'ご利用中' : '無料の範囲内'}
              </Text>
            </CardRow>
            <CardRow last onPress={buy}>
              <Text style={{ flex: 1, color: t.text2 }}>容量を広げる</Text>
              <Text style={[type.num, { color: t.text, fontWeight: '500' }]}>¥480 / 月</Text>
              <Text style={{ color: t.text3, marginLeft: 8 }}>›</Text>
            </CardRow>
          </Card>
        </View>

        {/* BYO Usage report */}
        <SectionLabel>BYO 使用量レポート (任意)</SectionLabel>
        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            <View style={{ padding: 14 }}>
              <Text style={{ fontSize: 12, color: t.text2, marginBottom: 8, lineHeight: 18 }}>
                BYO バケット運用時に使用量を送る集計サーバ
              </Text>
              <TextInput
                placeholder="https://example.com/usage"
                placeholderTextColor={t.text3}
                autoCapitalize="none"
                autoCorrect={false}
                value={reportUrl}
                onChangeText={setReportUrl}
                style={{
                  height: 40,
                  borderColor: t.borderStrong,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderRadius: radii.md,
                  paddingHorizontal: 12,
                  color: t.text,
                  fontSize: 13,
                  fontFamily: type.mono.fontFamily,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Button
                  small
                  variant="secondary"
                  title="保存"
                  style={{ flex: 1 }}
                  onPress={async () => {
                    await setReportEndpoint(reportUrl.trim() || null);
                    Alert.alert('OK', reportUrl ? '保存しました' : '解除しました');
                  }}
                />
                <Button
                  small
                  variant="secondary"
                  style={{ flex: 1 }}
                  title={hasToken ? 'トークン更新' : 'トークン設定'}
                  onPress={() => {
                    Alert.prompt?.('Bearer トークン', '空欄で削除', async (text: string) => {
                      await setReportToken(text?.trim() ? text.trim() : null);
                      setHasToken(!!text?.trim());
                    });
                  }}
                />
              </View>
              <Text style={{ marginTop: 6, fontSize: 11, color: t.text3 }}>
                {hasToken ? 'トークン: 設定済 (Keychain)' : 'トークン: 未設定'}
              </Text>
            </View>
          </Card>
        </View>

        {/* Recovery banner */}
        <SectionLabel>もしのときのために</SectionLabel>
        <View style={{ paddingHorizontal: 16 }}>
          <View
            style={{
              backgroundColor: t.surface,
              borderColor: t.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radii['2xl'],
              padding: 16,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Text style={{ color: t.accentText, fontSize: 16 }}>🛡</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>
                アプリがなくなっても、取り出せます
              </Text>
            </View>
            <Text style={{ fontSize: 12.5, color: t.text2, lineHeight: 20 }}>
              鍵と、復元用の道具を公開しています。もしこのアプリが使えなくなっても、あなたのデータは取り戻せます。
            </Text>
          </View>
        </View>

        {/* Danger */}
        <SectionLabel>データを消す</SectionLabel>
        <View style={{ paddingHorizontal: 16 }}>
          <Card>
            <CardRow onPress={purge} testID="settings-delete-account-btn" last>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: t.danger }}>アカウントを消す</Text>
                <Text style={rowSub(t)}>おまかせプランのデータはすぐに消えます</Text>
              </View>
              <Text style={{ color: t.danger }}>›</Text>
            </CardRow>
          </Card>
        </View>

        {/* Footer */}
        <View style={{ alignItems: 'center', paddingTop: 32, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <BrandMark size={28} />
            <Wordmark size={16} />
          </View>
          <Text style={[type.num, { fontSize: 11, color: t.text3 }]}>0.1.0</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function iconBox(t: ReturnType<typeof useTheme>) {
  return {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: t.surface2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
}

function rowTitle(t: ReturnType<typeof useTheme>) {
  return { fontSize: 14, fontWeight: '500' as const, color: t.text };
}

function rowSub(t: ReturnType<typeof useTheme>) {
  return { fontSize: 12, color: t.text3, marginTop: 1 };
}

function formatSizeShort(n: number): string {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

// Re-export to satisfy unused imports (kept for parity with old file)
export const _unused = { clearMnemonic };
