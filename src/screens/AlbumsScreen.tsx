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

export default function AlbumsScreen() {
  const [all, setAll] = useState<IndexEntry[]>([]);

  const load = useCallback(async () => {
    setAll(await loadIndex());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const groups = useMemo(() => groupByDate(all.filter(isImage)), [all]);

  return (
    <View style={{ flex: 1 }}>
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
            写真がありません
          </Text>
        }
      />
      <TouchableOpacity
        style={s.fab}
        onPress={async () => {
          try {
            const n = await pickAndImport();
            Alert.alert('取り込み完了', `${n} 件`);
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

function groupByDate(items: IndexEntry[]): { label: string; items: IndexEntry[] }[] {
  const map = new Map<string, IndexEntry[]>();
  for (const it of items) {
    const d = new Date(it.mtime);
    const label = `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(it);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([label, items]) => ({ label, items }));
}

const s = StyleSheet.create({
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
