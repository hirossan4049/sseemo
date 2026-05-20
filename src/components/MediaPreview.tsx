import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import { IndexEntry } from '@/storage';
import { useTheme, type } from '@/theme';
import { AppIcon } from '@/components/icons';
import { Button } from '@/components/ui';
import {
  canPreviewEntry,
  cleanupMaterialized,
  isImageEntry,
  isVideoEntry,
  materializeEntry,
  shareEntry,
} from '@/media/entryFile';

export function MediaPreview({
  entry,
  onClose,
}: {
  entry: IndexEntry | null;
  onClose: () => void;
}) {
  const t = useTheme();
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let materialized: string | null = null;

    setLocalPath(null);
    setError(null);

    if (!entry || !canPreviewEntry(entry)) return;
    setLoading(true);
    materializeEntry(entry, 'preview')
      .then(path => {
        materialized = path;
        if (cancelled) {
          cleanupMaterialized(path);
          return;
        }
        setLocalPath(path);
      })
      .catch(e => {
        if (!cancelled) setError(e?.message ?? String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      cleanupMaterialized(materialized);
    };
  }, [entry]);

  if (!entry) return null;

  const uri = localPath ? `file://${localPath}` : null;
  const title = entry.name;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView
        edges={['top', 'bottom', 'left', 'right']}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.92)',
          paddingHorizontal: 16,
          paddingTop: 18,
          paddingBottom: 18,
        }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
          }}>
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' }}>
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <AppIcon name="x" color="#fff" size={22} />
          </Pressable>
        </View>

        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : error ? (
            <View style={{ width: '100%', maxWidth: 320, gap: 12 }}>
              <Text style={[type.bodySmall, { color: '#fff', textAlign: 'center' }]}>
                {error}
              </Text>
              <Button title="共有で開く" variant="secondary" onPress={() => shareEntry(entry)} />
            </View>
          ) : uri && isImageEntry(entry) ? (
            <Image
              source={{ uri }}
              resizeMode="contain"
              style={{ width: '100%', height: '100%' }}
            />
          ) : uri && isVideoEntry(entry) ? (
            <Video
              source={{ uri }}
              controls
              resizeMode="contain"
              style={{ width: '100%', height: '100%' }}
            />
          ) : null}
        </View>

        <View style={{ paddingTop: 12 }}>
          <Button
            title="共有"
            variant="secondary"
            onPress={() => shareEntry(entry)}
            leading={<AppIcon name="arrowUpFromLine" color={t.text} size={17} />}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
