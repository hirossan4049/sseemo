import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  TextInput,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { childrenOf, IndexEntry } from '@/storage';
import {
  createFolder,
  deleteEntries,
  moveEntries,
  searchEntries,
} from '@/storage/operations';
import { pickAndImport, pickAndImportDocuments } from '@/photos/importer';
import { getActiveBucketId } from '@/state/bucketStore';
import { useTheme, radii, type } from '@/theme';
import { Screen, NavBar, IconButton, FAB, Button } from '@/components/ui';
import { AppIcon } from '@/components/icons';
import { MediaPreview } from '@/components/MediaPreview';
import { MediaThumb } from '@/components/MediaThumb';
import { canPreviewEntry, shareEntry } from '@/media/entryFile';

type SortKey = 'name' | 'size' | 'mtime';

export default function FoldersScreen() {
  const t = useTheme();
  const [stack, setStack] = useState<(string | null)[]>([null]);
  const [items, setItems] = useState<IndexEntry[]>([]);
  const [sort, setSort] = useState<SortKey>('name');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [previewEntry, setPreviewEntry] = useState<IndexEntry | null>(null);

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
              style={{
                marginBottom: 4,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 2,
              }}>
              <AppIcon name="chevronLeft" color={t.text} size={18} />
              <Text style={{ color: t.text, fontSize: 16 }}>戻る</Text>
            </Pressable>
          ) : null
        }
        trailing={
          <>
            <IconButton
              onPress={() =>
                setSort(sort === 'name' ? 'size' : sort === 'size' ? 'mtime' : 'name')
              }>
              <AppIcon name="arrowUpDown" color={t.text} size={18} />
            </IconButton>
            <IconButton onPress={newFolder}>
              <AppIcon name="plus" color={t.text} size={20} />
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
          <AppIcon name="search" color={t.text3} size={17} />
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
                else if (canPreviewEntry(item)) setPreviewEntry(item);
                else shareEntry(item);
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
                <MediaThumb entry={item} size={38} radius={10} />
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
                <AppIcon name="check" color={t.accentText} size={18} strokeWidth={2.8} />
              ) : (
                <AppIcon name="chevronRight" color={t.text3} size={18} />
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
        <AppIcon name="file" color={t.bg} size={24} />
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
        <AppIcon name="plus" color={t.bg} size={28} strokeWidth={2.4} />
      </FAB>
      <MediaPreview entry={previewEntry} onClose={() => setPreviewEntry(null)} />
    </Screen>
  );
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
