import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Button,
  ScrollView,
  TextInput,
  Share,
  Platform,
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

export default function SettingsScreen() {
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
        `容量 ${level}% 超過`,
        level === 95 ? '間もなくハード停止します。課金してください。' : '容量にご注意ください。',
      ),
    );
  }

  async function exportMnemonic() {
    const m = await loadMnemonic();
    if (!m) return;
    Alert.alert('リカバリーフレーズ', m);
  }

  /**
   * spec §14: 12ワードをファイルとして書き出し、Share シートで Files /
   * AirDrop / iCloud / 印刷など好きな宛先にユーザーが送れるようにする。
   * 終了後にテンポラリファイルを削除する。
   */
  async function exportMnemonicToFile() {
    const m = await loadMnemonic();
    if (!m) {
      Alert.alert('エラー', 'リカバリーフレーズが見つかりません');
      return;
    }
    const opaqueDir = `${RNFS.CachesDirectoryPath}/ssf-share`;
    await RNFS.mkdir(opaqueDir).catch(() => {});
    const opaqueId = Buffer.from(QuickCrypto.randomBytes(12) as any).toString('hex');
    const out = `${opaqueDir}/secstorage-recovery-${opaqueId}.txt`;
    const body =
      'SecStorage リカバリーフレーズ (BIP-39 12 words)\n' +
      '取扱注意: このフレーズを知る者はあなたのすべてのファイルを復号できます。\n\n' +
      m +
      '\n';
    await RNFS.writeFile(out, body, 'utf8');
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { url: `file://${out}` }
          : {
              url: `file://${out}`,
              message: body,
              title: 'SecStorage Recovery Phrase',
            },
      );
    } finally {
      const ttlMs = Platform.OS === 'android' ? 5000 : 0;
      setTimeout(() => {
        RNFS.unlink(out).catch(() => {});
      }, ttlMs);
    }
  }

  async function regenerate() {
    Alert.alert(
      '鍵の再生成',
      '既存データは復号不可になります。本当に再生成しますか？',
      [
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
      ],
    );
  }

  async function importMnemonic() {
    Alert.prompt?.(
      'インポート',
      '12語をスペース区切りで入力',
      async (text: string) => {
        if (!text) return;
        await saveMnemonic(text.trim().toLowerCase());
        lock();
        Alert.alert('完了', '再起動してください');
      },
    );
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
    Alert.alert('アカウント削除', 'すべてのデータが削除されます', [
      { text: 'キャンセル' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await deleteAccount();
          Alert.alert(
            '完了',
            'サブスクは App Store > サブスクリプション から解約してください',
          );
        },
      },
    ]);
  }

  if (!usage) return <View />;

  return (
    <ScrollView style={s.root} testID="settings-screen">
      <Section title="使用量">
        <Text>
          {formatSize(usage.used)} / {formatSize(usage.limit)} (
          {usage.pct.toFixed(1)}%)
        </Text>
        {usage.pct >= 80 && usage.pct < 95 && (
          <Text style={{ color: '#c93' }}>容量に注意: 80%超過</Text>
        )}
        {usage.pct >= 95 && !usage.paid && (
          <Text style={{ color: '#c33' }}>95%超過: 課金推奨</Text>
        )}
        {usage.hardStopped && (
          <Text style={{ color: '#c33', fontWeight: '700' }}>
            ハード停止中: 新規アップロード不可
          </Text>
        )}
      </Section>
      <Section title="サブスク">
        <Text style={s.muted}>
          状態: {usage.paid ? '有効' : '無料枠'}
        </Text>
        <Button title="¥480/月で容量解放" onPress={buy} />
      </Section>
      <Section title="BYO 使用量レポート">
        <Text style={s.muted}>
          BYOバケット運用時に使用量を送る集計サーバ (任意)。
        </Text>
        <TextInput
          placeholder="https://example.com/usage"
          autoCapitalize="none"
          autoCorrect={false}
          value={reportUrl}
          onChangeText={setReportUrl}
          style={s.input}
        />
        <View style={s.row}>
          <Button
            title="保存"
            onPress={async () => {
              await setReportEndpoint(reportUrl.trim() || null);
              Alert.alert('OK', reportUrl ? '保存しました' : '解除しました');
            }}
          />
          <Button
            title={hasToken ? 'トークン更新' : 'トークン設定'}
            onPress={() => {
              Alert.prompt?.(
                'Bearer トークン',
                '空欄で削除',
                async (text: string) => {
                  await setReportToken(text?.trim() ? text.trim() : null);
                  setHasToken(!!text?.trim());
                },
              );
            }}
          />
        </View>
        <Text style={s.muted}>
          {hasToken ? 'トークン: 設定済 (Keychain)' : 'トークン: 未設定'}
        </Text>
      </Section>
      <Section title="バケット">
        {bucketIds.map(id => (
          <View key={id} style={s.row}>
            <Text style={{ flex: 1 }}>
              {id} {id === activeId ? '(active)' : ''}
            </Text>
            {id !== activeId && (
              <Button
                title="切替"
                onPress={async () => {
                  await setActiveBucketId(id);
                  refresh();
                }}
              />
            )}
          </View>
        ))}
        <View style={{ height: 6 }} />
        <Button title="マネージドバケットを追加" onPress={addManagedBucket} />
        <View style={{ height: 6 }} />
        <Button title="互換S3バケットを追加" onPress={addByoBucket} />
      </Section>
      <Section title="鍵">
        <Button
          testID="settings-export-mnemonic-btn"
          title="リカバリーフレーズを表示"
          onPress={exportMnemonic}
        />
        <View style={{ height: 6 }} />
        <Button
          testID="settings-export-mnemonic-file-btn"
          title="ファイルに保存"
          onPress={exportMnemonicToFile}
        />
        <View style={{ height: 6 }} />
        <Button title="インポート" onPress={importMnemonic} />
        <View style={{ height: 6 }} />
        <Button title="再生成" color="#c33" onPress={regenerate} />
      </Section>
      <Section title="セキュリティ">
        <Text style={s.muted}>
          パスフレーズ: {hasPp ? '設定済' : '未設定'}
        </Text>
        {!hasPp && <Button title="パスフレーズを設定" onPress={enablePp} />}
        <View style={{ height: 6 }} />
        <Text style={s.muted}>自動ロック:</Text>
        <View style={s.row}>
          <Button title="30s" onPress={() => setAutoLock(30)} />
          <Button title="5m" onPress={() => setAutoLock(300)} />
          <Button title="1h" onPress={() => setAutoLock(3600)} />
        </View>
      </Section>
      <Section title="アカウント">
        <Button
          testID="settings-delete-account-btn"
          title="アカウントとデータを完全削除"
          color="#c33"
          onPress={purge}
        />
      </Section>
      <Text style={s.footer}>SecStorage v0.1 — 鍵は自分で持つ。</Text>
    </ScrollView>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function formatSize(n: number): string {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  section: { padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  sectionTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  muted: { color: '#888', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
  },
  row: { flexDirection: 'row', gap: 8 },
  footer: { textAlign: 'center', color: '#aaa', padding: 24 },
});
