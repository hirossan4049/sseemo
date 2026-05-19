import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { childrenOf, IndexEntry, removeEntry } from '@/storage';
import { pickAndImport } from '@/photos/importer';

type SortKey = 'name' | 'size' | 'mtime';

export default function FoldersScreen() {
  const [stack, setStack] = useState<(string | null)[]>([null]);
  const [items, setItems] = useState<IndexEntry[]>([]);
  const [sort, setSort] = useState<SortKey>('name');
  const [refreshing, setRefreshing] = useState(false);

  const parentId = stack[stack.length - 1];

  const load = useCallback(async () => {
    setRefreshing(true);
    const c = await childrenOf(parentId);
    c.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'size') return b.size - a.size;
      return b.mtime - a.mtime;
    });
    setItems(c);
    setRefreshing(false);
  }, [parentId, sort]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={s.root}>
      <View style={s.toolbar}>
        {stack.length > 1 && (
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
      </View>
      <FlatList
        data={items}
        keyExtractor={x => x.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.row}
            onPress={() => {
              if (item.isFolder) setStack([...stack, item.id]);
            }}
            onLongPress={() =>
              Alert.alert('削除', `${item.name} を削除しますか`, [
                { text: 'キャンセル' },
                {
                  text: '削除',
                  style: 'destructive',
                  onPress: async () => {
                    await removeEntry(item.id);
                    load();
                  },
                },
              ])
            }>
            <Text style={s.icon}>{item.isFolder ? '📁' : '📄'}</Text>
            <View style={{ flex: 1 }}>
              <Text>{item.name}</Text>
              <Text style={s.sub}>{formatSize(item.plainSize)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={s.empty}>ファイルがありません</Text>
        }
      />
      <TouchableOpacity
        style={s.fab}
        onPress={async () => {
          try {
            const n = await pickAndImport();
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
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  tool: { color: '#007aff' },
  row: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
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
