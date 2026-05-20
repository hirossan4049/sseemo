import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  Pressable,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { loadIndex, IndexEntry } from '@/storage';
import { pickAndImport } from '@/photos/importer';
import { loadThumb } from '@/photos/thumbnail';
import { getMaster } from '@/state/keyStore';
import { getActiveBucket } from '@/state/bucketStore';
import { useTheme, radii, type } from '@/theme';
import { Screen, NavBar, IconButton, FAB } from '@/components/ui';

const COLS = 3;
const SIZE = Dimensions.get('window').width / COLS - 3;

type GroupBy = 'year' | 'month' | 'day';

export default function AlbumsScreen() {
  const t = useTheme();
  const [all, setAll] = useState<IndexEntry[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('day');

  const load = useCallback(async () => {
    setAll(await loadIndex());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const photos = useMemo(() => all.filter(isImage), [all]);
  const groups = useMemo(() => groupByDate(photos, groupBy), [photos, groupBy]);

  return (
    <Screen>
      <NavBar
        sub="アルバム"
        title="写真"
        meta={
          <Text style={[type.num, { fontSize: 12, color: t.text3, marginTop: 4 }]}>
            {photos.length.toLocaleString()} 枚を保管中
          </Text>
        }
        trailing={
          <IconButton>
            <Text style={{ color: t.text, fontSize: 14 }}>🔍</Text>
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
                  {item.items.length} 枚
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
              {item.items.map(x => (
                <Thumb key={x.id} entry={x} />
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
            まだ写真はありません
          </Text>
        }
        ListFooterComponent={
          photos.length > 0 ? (
            <Text
              style={{
                textAlign: 'center',
                fontSize: 11,
                color: t.text3,
                paddingTop: 24,
              }}>
              小さな写真は手元に。元データは鍵をかけて保管しています。
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
        <Text style={{ color: t.bg, fontSize: 26, lineHeight: 28 }}>+</Text>
      </FAB>
    </Screen>
  );
}

function Thumb({ entry }: { entry: IndexEntry }) {
  const t = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const master = getMaster();
      const bucket = await getActiveBucket();
      if (!master || !bucket) return;
      try {
        const buf = await loadThumb(master, bucket, entry.id);
        if (!cancelled && buf) {
          setUri(`data:image/jpeg;base64,${buf.toString('base64')}`);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.id]);
  return (
    <View
      style={{
        width: SIZE,
        height: SIZE,
        backgroundColor: t.surface3,
        borderRadius: 4,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text style={{ fontSize: 22 }}>🖼</Text>
      )}
    </View>
  );
}

function isImage(e: IndexEntry): boolean {
  return !e.isFolder && !!e.mime?.startsWith('image/');
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
