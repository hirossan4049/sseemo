import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  TextInput,
  Share,
  Platform,
  Pressable,
} from 'react-native';
import QuickCrypto from 'react-native-quick-crypto';
import { useFocusEffect } from '@react-navigation/native';
import { childrenOf, IndexEntry } from '@/storage';
import {
  createFolder,
  deleteEntries,
  moveEntries,
  searchEntries,
} from '@/storage/operations';
import { pickAndImport, pickAndImportDocuments } from '@/photos/importer';
import { getActiveBucket, getActiveBucketId } from '@/state/bucketStore';
import { downloadAndDecrypt } from '@/s3/download';
import { downloadAndDecryptChunked } from '@/s3/chunkedDownload';
import { getMaster } from '@/state/keyStore';
import RNFS from 'react-native-fs';
import { useTheme, radii, type } from '@/theme';
import { Screen, NavBar, IconButton, FAB, Button } from '@/components/ui';

type SortKey = 'name' | 'size' | 'mtime';

export default function FoldersScreen() {
  const t = useTheme();
  const [stack, setStack] = useState<(string | null)[]>([null]);
  const [items, setItems] = useState<IndexEntry[]>([]);
  const [sort, setSort] = useState<SortKey>('name');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const parentId = stack[stack.length - 1];

  const load = useCallback(async () => {
    setRefreshing(true);
    let c: IndexEntry[];
    if (query.trim()) c = await searchEntries(query.trim());
    else c = await childrenOf(parentId);
    c.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'size') return b.size - a.size;
      return b.mtime - a.mtime;
    });
    setItems(c);
    setRefreshing(false);
  }, [parentId, sort, query]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function toggleSel(id: string) {
    const n = new Set(selection);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelection(n);
  }

  async function newFolder() {
    Alert.prompt?.('新規フォルダ', '名前', async name => {
      if (!name) return;
      const bid = (await getActiveBucketId()) ?? '';
      await createFolder(name, parentId, bid);
      load();
    });
  }

  async function moveSelected() {
    if (selection.size === 0) return;
    const folders = items.filter(i => i.isFolder && !selection.has(i.id));
    Alert.alert('移動先', '', [
      { text: 'ルート', onPress: () => doMove(null) },
      ...folders.map(f => ({ text: f.name, onPress: () => doMove(f.id) })),
      { text: 'キャンセル', style: 'cancel' as const },
    ]);
  }

  async function doMove(target: string | null) {
    await moveEntries([...selection], target);
    setSelection(new Set());
    load();
  }

  async function downloadItem(item: IndexEntry) {
    const master = getMaster();
    const bucket = await getActiveBucket();
    if (!master || !bucket) {
      Alert.alert('エラー', 'ロック中またはバケット未設定');
      return;
    }
    const opaqueDir = `${RNFS.CachesDirectoryPath}/ssf-share`;
    await RNFS.mkdir(opaqueDir).catch(() => {});
    const opaqueId = Buffer.from(QuickCrypto.randomBytes(16) as any).toString('hex');
    const ext = (() => {
      const dot = item.name.lastIndexOf('.');
      return dot > 0 ? item.name.slice(dot) : '';
    })();
    const out = `${opaqueDir}/${opaqueId}${ext}`;
    const isChunked = !item.remoteKey.endsWith('.ssf');
    try {
      if (isChunked) {
        await downloadAndDecryptChunked({
          master,
          creds: bucket,
          remotePrefix: item.remoteKey,
          localPath: out,
        });
      } else {
        await downloadAndDecrypt({
          master,
          creds: bucket,
          remoteKey: item.remoteKey,
          localPath: out,
        });
      }
      try {
        if (Platform.OS === 'ios' && (RNFS as any).setReadable) {
          await (RNFS as any).setReadable?.(out, false);
        }
      } catch {
        /* ignore */
      }
      try {
        await Share.share(
          Platform.OS === 'ios'
            ? { url: `file://${out}` }
            : { url: `file://${out}`, message: item.name, title: item.name },
        );
      } finally {
        const ttlMs = Platform.OS === 'android' ? 5000 : 0;
        setTimeout(() => {
          RNFS.unlink(out).catch(() => {});
        }, ttlMs);
      }
    } catch (e: any) {
      await RNFS.unlink(out).catch(() => {});
      Alert.alert('失敗', e.message);
    }
  }

  async function delSelected() {
    if (selection.size === 0) return;
    Alert.alert('削除', `${selection.size}件削除しますか`, [
      { text: 'キャンセル' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await deleteEntries([...selection]);
          setSelection(new Set());
          load();
        },
      },
    ]);
  }

  const selecting = selection.size > 0;
  const crumbTitle = stack.length === 1 ? 'すべてのファイル' : '中身';

  return (
    <Screen testID="folders-screen">
      <NavBar
        sub="フォルダ"
        title={crumbTitle}
        leading={
          stack.length > 1 ? (
            <Pressable
              onPress={() => setStack(stack.slice(0, -1))}
              hitSlop={10}
              style={{ marginBottom: 4 }}>
              <Text style={{ color: t.text, fontSize: 18 }}>‹ 戻る</Text>
            </Pressable>
          ) : null
        }
        trailing={
          <>
            <IconButton
              onPress={() =>
                setSort(sort === 'name' ? 'size' : sort === 'size' ? 'mtime' : 'name')
              }>
              <Text style={{ color: t.text, fontSize: 14 }}>↕</Text>
            </IconButton>
            <IconButton onPress={newFolder}>
              <Text style={{ color: t.text, fontSize: 18 }}>+</Text>
            </IconButton>
          </>
        }
      />

      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View
          style={{
            backgroundColor: t.surface2,
            borderRadius: radii.lg,
            paddingHorizontal: 12,
            paddingVertical: 9,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
          <Text style={{ color: t.text3, fontSize: 14 }}>🔍</Text>
          <TextInput
            placeholder="検索"
            placeholderTextColor={t.text3}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={load}
            style={{ flex: 1, color: t.text, fontSize: 15, padding: 0 }}
          />
        </View>
      </View>

      {selecting && (
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 16,
            gap: 8,
            paddingBottom: 8,
          }}>
          <Button small variant="secondary" title={`移動 (${selection.size})`} onPress={moveSelected} />
          <Button small variant="danger" title="削除" onPress={delSelected} />
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={x => x.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={t.text3} />
        }
        renderItem={({ item }) => {
          const sel = selection.has(item.id);
          return (
            <Pressable
              onPress={() => {
                if (selecting) toggleSel(item.id);
                else if (item.isFolder) setStack([...stack, item.id]);
                else downloadItem(item);
              }}
              onLongPress={() => toggleSel(item.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 11,
                paddingHorizontal: 8,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: t.border,
                backgroundColor: sel
                  ? t.accentSoft
                  : pressed
                    ? t.surface2
                    : 'transparent',
                borderRadius: sel ? radii.md : 0,
              })}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: t.surface2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{ fontSize: 18, color: item.isFolder ? t.accentText : t.text2 }}>
                  {item.isFolder ? '📁' : '📄'}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 14.5, fontWeight: '500', color: t.text }}>
                  {item.name}
                </Text>
                <Text style={[type.num, { fontSize: 11.5, color: t.text3, marginTop: 2 }]}>
                  {item.isFolder ? '—' : formatSize(item.plainSize)}
                </Text>
              </View>
              {sel ? (
                <Text style={{ color: t.accentText, fontSize: 14 }}>✓</Text>
              ) : (
                <Text style={{ color: t.text3, fontSize: 14 }}>›</Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text
            style={{
              textAlign: 'center',
              marginTop: 48,
              color: t.text3,
              fontSize: 13,
            }}>
            まだ何もありません
          </Text>
        }
      />

      <FAB
        testID="folders-fab-document"
        rightOffset={84}
        onPress={async () => {
          try {
            const n = await pickAndImportDocuments(parentId);
            Alert.alert('しまっておきました', `${n} 件、鍵をかけて送りました。`);
            load();
          } catch (e: any) {
            if (!/cancel/i.test(e.message ?? ''))
              Alert.alert('うまくいきませんでした', e.message);
          }
        }}>
        <Text style={{ color: t.bg, fontSize: 22 }}>📄</Text>
      </FAB>
      <FAB
        testID="folders-fab"
        onPress={async () => {
          try {
            const n = await pickAndImport(parentId);
            Alert.alert('しまっておきました', `${n} 件、鍵をかけて送りました。`);
            load();
          } catch (e: any) {
            Alert.alert('うまくいきませんでした', e.message);
          }
        }}>
        <Text style={{ color: t.bg, fontSize: 26, lineHeight: 28 }}>+</Text>
      </FAB>
    </Screen>
  );
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
