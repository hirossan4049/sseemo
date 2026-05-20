import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  Pressable,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { loadIndex, IndexEntry } from '@/storage';
import { pickAndImport } from '@/photos/importer';
import { useTheme, radii, type } from '@/theme';
import { Screen, NavBar, IconButton, FAB } from '@/components/ui';
import { AppIcon } from '@/components/icons';
import { MediaPreview } from '@/components/MediaPreview';
import { MediaThumb } from '@/components/MediaThumb';
import { canPreviewEntry } from '@/media/entryFile';

const COLS = 3;
const SIZE = Dimensions.get('window').width / COLS - 3;

type GroupBy = 'year' | 'month' | 'day';

export default function AlbumsScreen() {
  const t = useTheme();
  const [all, setAll] = useState<IndexEntry[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [previewEntry, setPreviewEntry] = useState<IndexEntry | null>(null);

  const load = useCallback(async () => {
    setAll(await loadIndex());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const media = useMemo(() => all.filter(canPreviewEntry), [all]);
  const groups = useMemo(() => groupByDate(media, groupBy), [media, groupBy]);

  return (
    <Screen>
      <NavBar
        sub="アルバム"
        title="メディア"
        meta={
          <Text style={[type.num, { fontSize: 12, color: t.text3, marginTop: 4 }]}>
            {media.length.toLocaleString()} 件を保管中
          </Text>
        }
        trailing={
          <IconButton>
            <AppIcon name="search" color={t.text} size={18} />
          </IconButton>
        }
      />

      {/* Segmented control */}
      <View
        style={{
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingBottom: 12,
        }}>
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: t.surface2,
            borderRadius: 999,
            padding: 3,
          }}>
          {(['year', 'month', 'day'] as GroupBy[]).map(g => {
            const active = groupBy === g;
            return (
              <Pressable
                key={g}
                onPress={() => setGroupBy(g)}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: active ? t.surface : 'transparent',
                }}>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '600',
                    color: active ? t.text : t.text2,
                  }}>
                  {g === 'year' ? '年' : g === 'month' ? '月' : '日'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={groups}
        keyExtractor={g => g.label}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 28 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 10,
              }}>
              <View>
                <Text style={{ fontSize: 17, fontWeight: '700', color: t.text, letterSpacing: -0.3 }}>
                  {item.label}
                </Text>
                <Text style={[type.num, { fontSize: 11.5, color: t.text3, marginTop: 2 }]}>
                  {item.items.length} 件
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
              {item.items.map(x => (
                <Pressable key={x.id} onPress={() => setPreviewEntry(x)}>
                  <MediaThumb entry={x} size={SIZE} />
                </Pressable>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text
            style={{
              textAlign: 'center',
              marginTop: 48,
              color: t.text3,
              fontSize: 13,
            }}>
            まだプレビューできるメディアはありません
          </Text>
        }
        ListFooterComponent={
          media.length > 0 ? (
            <Text
              style={{
                textAlign: 'center',
                fontSize: 11,
                color: t.text3,
                paddingTop: 24,
              }}>
              小さなプレビューは手元に。元データは鍵をかけて保管しています。
            </Text>
          ) : null
        }
      />

      <FAB
        onPress={async () => {
          try {
            const n = await pickAndImport();
            Alert.alert('あずかりました', `${n} 件、鍵をかけてしまっておきました。`);
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

function groupByDate(
  items: IndexEntry[],
  by: GroupBy = 'month',
): { label: string; items: IndexEntry[] }[] {
  const map = new Map<string, { label: string; items: IndexEntry[] }>();
  for (const it of items) {
    const d = new Date(it.mtime);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    let sortKey: string;
    let label: string;
    if (by === 'year') {
      sortKey = `${y}`;
      label = `${y}年`;
    } else if (by === 'day') {
      sortKey = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      label = `${y}年 ${m}月 ${day}日`;
    } else {
      sortKey = `${y}-${String(m).padStart(2, '0')}`;
      label = `${y}年 ${m}月`;
    }
    if (!map.has(sortKey)) map.set(sortKey, { label, items: [] });
    map.get(sortKey)!.items.push(it);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([, v]) => v);
}
