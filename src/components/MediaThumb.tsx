import React, { useEffect, useState } from 'react';
import { Image, View, StyleProp, ViewStyle } from 'react-native';
import { getActiveBucket } from '@/state/bucketStore';
import { getMaster } from '@/state/keyStore';
import { loadThumb } from '@/photos/thumbnail';
import { IndexEntry } from '@/storage';
import { useTheme } from '@/theme';
import { AppIcon } from '@/components/icons';
import { canPreviewEntry, isVideoEntry } from '@/media/entryFile';
import { b64encode } from '@/crypto/base64';

export function MediaThumb({
  entry,
  size,
  radius = 4,
  style,
}: {
  entry: IndexEntry;
  size: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const previewable = canPreviewEntry(entry);

  useEffect(() => {
    let cancelled = false;
    if (!previewable) {
      setUri(null);
      return;
    }
    (async () => {
      const master = getMaster();
      const bucket = await getActiveBucket();
      if (!master || !bucket) return;
      try {
        const buf = await loadThumb(master, bucket, entry.id);
        if (!cancelled && buf) {
          setUri(`data:image/jpeg;base64,${b64encode(buf)}`);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.id, previewable]);

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          backgroundColor: t.surface3,
          borderRadius: radius,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <AppIcon
          name={entry.isFolder ? 'folder' : previewable ? 'image' : 'file'}
          color={entry.isFolder ? t.accentText : t.text3}
          size={Math.max(18, size * 0.48)}
        />
      )}
      {isVideoEntry(entry) && (
        <View
          style={{
            position: 'absolute',
            width: Math.max(22, size * 0.32),
            height: Math.max(22, size * 0.32),
            borderRadius: 999,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppIcon name="play" color="#fff" size={Math.max(14, size * 0.18)} />
        </View>
      )}
    </View>
  );
}
