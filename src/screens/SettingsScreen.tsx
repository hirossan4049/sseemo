import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Button,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearMnemonic, loadMnemonic } from '@/crypto/keychain';
import { lock } from '@/state/keyStore';
import { loadIndex } from '@/storage';
import { listBucketIds, getActiveBucketId } from '@/state/bucketStore';
import { subscribe, fetchProducts } from '@/iap';

const FREE_LIMIT_MANAGED = 5 * 1024 ** 3;
const FREE_LIMIT_BYO = 10 * 1024 ** 3;

export default function SettingsScreen() {
  const [used, setUsed] = useState(0);
  const [bucketIds, setBucketIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const idx = await loadIndex();
      setUsed(idx.reduce((a, b) => a + b.size, 0));
      setBucketIds(await listBucketIds());
      setActiveId(await getActiveBucketId());
    })();
  }, []);

  async function exportMnemonic() {
    const m = await loadMnemonic();
    if (!m) return;
    Alert.alert('リカバリーフレーズ', m);
  }

  async function purge() {
    Alert.alert('全削除', '本当にすべてのローカルデータを削除しますか？', [
      { text: 'キャンセル' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          await clearMnemonic();
          lock();
          Alert.alert('完了', 'アプリを再起動してください');
        },
      },
    ]);
  }

  async function buy() {
    try {
      const products = await fetchProducts();
      if (products.length === 0) throw new Error('商品取得失敗');
      await subscribe();
    } catch (e: any) {
      Alert.alert('IAP', e.message);
    }
  }

  const limit = FREE_LIMIT_MANAGED;
  const pct = (used / limit) * 100;

  return (
    <ScrollView style={s.root}>
      <Section title="使用量">
        <Text>
          {formatSize(used)} / {formatSize(limit)} ({pct.toFixed(1)}%)
        </Text>
        {pct >= 80 && <Text style={{ color: '#c93' }}>容量に注意: 80%超過</Text>}
        {pct >= 95 && <Text style={{ color: '#c33' }}>95%超過: 課金推奨</Text>}
      </Section>
      <Section title="サブスク">
        <Button title="¥480/月で容量を解放" onPress={buy} />
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
      </Section>
      <Section title="セキュリティ">
        <Text style={s.muted}>生体認証ロック: 有効 (Keychain access control)</Text>
      </Section>
      <Section title="データ">
        <Button title="全削除" color="#c33" onPress={purge} />
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
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  sectionTitle: { fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase' },
  muted: { color: '#888' },
  footer: { textAlign: 'center', color: '#aaa', padding: 24 },
});
