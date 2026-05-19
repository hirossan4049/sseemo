import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { childrenOf, IndexEntry } from '@/storage';
import {
  createFolder,
  deleteEntries,
  moveEntries,
  searchEntries,
} from '@/storage/operations';
import { pickAndImport } from '@/photos/importer';
import { getActiveBucket, getActiveBucketId } from '@/state/bucketStore';
import { downloadAndDecrypt } from '@/s3/download';
import { getMaster } from '@/state/keyStore';
import RNFS from 'react-native-fs';

type SortKey = 'name' | 'size' | 'mtime';

export default function FoldersScreen() {
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
    Alert.alert(
      '移動先',
      '',
      [
        { text: 'ルート', onPress: () => doMove(null) },
        ...folders.map(f => ({ text: f.name, onPress: () => doMove(f.id) })),
        { text: 'キャンセル', style: 'cancel' as const },
      ],
    );
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
    const out = `${RNFS.DocumentDirectoryPath}/${item.name}`;
    try {
      await downloadAndDecrypt({
        master,
        creds: bucket,
        remoteKey: item.remoteKey,
        localPath: out,
      });
      Alert.alert('ダウンロード完了', out);
    } catch (e: any) {
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

  return (
    <View style={s.root}>
      <TextInput
        placeholder="検索"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={load}
        style={s.search}
      />
      <View style={s.toolbar}>
        {stack.length > 1 && !query && (
          <TouchableOpacity onPress={() => setStack(stack.slice(0, -1))}>
            <Text style={s.tool}>← 戻る</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() =>
            setSort(sort === 'name' ? 'size' : sort === 'size' ? 'mtime' : 'name')
          }>
          <Text style={s.tool}>並び: {sort}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={newFolder}>
          <Text style={s.tool}>＋フォルダ</Text>
        </TouchableOpacity>
        {selecting && (
          <>
            <TouchableOpacity onPress={moveSelected}>
              <Text style={s.tool}>移動 ({selection.size})</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={delSelected}>
              <Text style={[s.tool, { color: '#c33' }]}>削除</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      <FlatList
        data={items}
        keyExtractor={x => x.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        renderItem={({ item }) => {
          const sel = selection.has(item.id);
          return (
            <TouchableOpacity
              style={[s.row, sel && s.rowSel]}
              onPress={() => {
                if (selecting) toggleSel(item.id);
                else if (item.isFolder) setStack([...stack, item.id]);
                else downloadItem(item);
              }}
              onLongPress={() => toggleSel(item.id)}>
              <Text style={s.icon}>{item.isFolder ? '📁' : '📄'}</Text>
              <View style={{ flex: 1 }}>
                <Text>{item.name}</Text>
                <Text style={s.sub}>
                  {item.isFolder ? '—' : formatSize(item.plainSize)}
                </Text>
              </View>
              {sel && <Text>✓</Text>}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>ファイルがありません</Text>}
      />
      <TouchableOpacity
        style={s.fab}
        onPress={async () => {
          try {
            const n = await pickAndImport(parentId);
            Alert.alert('アップロード完了', `${n} 件`);
            load();
          } catch (e: any) {
            Alert.alert('失敗', e.message);
          }
        }}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  search: {
    margin: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    borderBottomWidth: 1,
    borderColor: '#eee',
    gap: 12,
  },
  tool: { color: '#007aff', marginRight: 12 },
  row: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  rowSel: { backgroundColor: '#e0f0ff' },
  icon: { fontSize: 20, marginRight: 12 },
  sub: { fontSize: 11, color: '#888' },
  empty: { textAlign: 'center', marginTop: 48, color: '#888' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007aff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300' },
});
