import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Button,
  ScrollView,
} from 'react-native';
import { clearMnemonic, loadMnemonic } from '@/crypto/keychain';
import {
  lock,
  setAutoLockSeconds,
  setPassphrase,
  isPassphraseEnabled,
} from '@/state/keyStore';
import { listBucketIds, getActiveBucketId, getActiveBucket } from '@/state/bucketStore';
import { subscribe, fetchProducts } from '@/iap';
import { refreshSubscriptionStatus } from '@/iap/verify';
import { computeUsage, UsageStatus, checkAndNotify } from '@/state/usage';
import { deleteAccount } from '@/auth/accountDelete';
import { generate12WordMnemonic } from '@/crypto/mnemonic';
import { saveMnemonic } from '@/crypto/keychain';

export default function SettingsScreen() {
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [bucketIds, setBucketIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hasPp, setHasPp] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    const bucket = await getActiveBucket();
    const mode = bucket?.mode ?? 'managed';
    await refreshSubscriptionStatus();
    const u = await computeUsage(mode);
    setUsage(u);
    setBucketIds(await listBucketIds());
    setActiveId(await getActiveBucketId());
    setHasPp(await isPassphraseEnabled());
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
    <ScrollView style={s.root}>
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
      <Section title="バケット">
        {bucketIds.map(id => (
          <Text key={id}>
            {id} {id === activeId ? '(active)' : ''}
          </Text>
        ))}
      </Section>
      <Section title="鍵">
        <Button title="リカバリーフレーズを表示" onPress={exportMnemonic} />
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
  row: { flexDirection: 'row', gap: 8 },
  footer: { textAlign: 'center', color: '#aaa', padding: 24 },
});
