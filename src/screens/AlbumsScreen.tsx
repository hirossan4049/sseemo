import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { loadIndex, IndexEntry } from '@/storage';
import { pickAndImport } from '@/photos/importer';
import { loadThumb } from '@/photos/thumbnail';
import { getMaster } from '@/state/keyStore';
import { getActiveBucket } from '@/state/bucketStore';

const COLS = 3;
const SIZE = Dimensions.get('window').width / COLS;

type GroupBy = 'year' | 'month' | 'day';

export default function AlbumsScreen() {
  const [all, setAll] = useState<IndexEntry[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('month');

  const load = useCallback(async () => {
    setAll(await loadIndex());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const photos = useMemo(() => all.filter(isImage), [all]);
  const groups = useMemo(
    () => groupByDate(photos, groupBy),
    [photos, groupBy],
  );

  return (
    <View style={{ flex: 1 }}>
      <Text style={s.countLine}>
        {photos.length.toLocaleString()}枚を保管中
      </Text>
      <View style={s.segmented}>
        {(['year', 'month', 'day'] as GroupBy[]).map(g => (
          <TouchableOpacity
            key={g}
            style={[s.seg, groupBy === g && s.segActive]}
            onPress={() => setGroupBy(g)}>
            <Text style={[s.segText, groupBy === g && s.segTextActive]}>
              {g === 'year' ? '年' : g === 'month' ? '月' : '日'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={groups}
        keyExtractor={g => g.label}
        renderItem={({ item }) => (
          <View>
            <Text style={s.header}>{item.label}</Text>
            <View style={s.grid}>
              {item.items.map(x => (
                <Thumb key={x.id} entry={x} />
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 48, color: '#888' }}>
            まだ写真はありません
          </Text>
        }
      />
      <TouchableOpacity
        style={s.fab}
        onPress={async () => {
          try {
            const n = await pickAndImport();
            Alert.alert('あずかりました', `${n} 件、鍵をかけてしまっておきました。`);
            load();
          } catch (e: any) {
            Alert.alert('うまくいきませんでした', e.message);
          }
        }}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function Thumb({ entry }: { entry: IndexEntry }) {
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
    <View style={s.cell}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text style={s.thumb}>🖼</Text>
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
  // ソート安定性のため (sortKey, label) を持つ。sortKey はゼロパディング ISO 風。
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

const s = StyleSheet.create({
  countLine: {
    fontSize: 12,
    color: '#666',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  header: { padding: 8, fontWeight: '700', backgroundColor: '#fafafa' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: SIZE,
    height: SIZE,
    backgroundColor: '#eee',
    borderWidth: 0.5,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumb: { fontSize: 28 },
  segmented: {
    flexDirection: 'row',
    margin: 8,
    borderRadius: 8,
    backgroundColor: '#eee',
    overflow: 'hidden',
  },
  seg: { flex: 1, paddingVertical: 6, alignItems: 'center' },
  segActive: { backgroundColor: '#007aff' },
  segText: { color: '#333', fontWeight: '600' },
  segTextActive: { color: '#fff' },
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
