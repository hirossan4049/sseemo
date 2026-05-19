import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  Platform,
  PermissionsAndroid,
  Alert,
} from 'react-native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

/**
 * spec §8 オンボーディング step 5/6:
 * - 写真アクセス権限リクエスト
 * - 簡易ツアー (3スライド)
 */
export default function PermissionsTourScreen({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<'perm' | 'tour'>('perm');
  const [tourIdx, setTourIdx] = useState(0);
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (stage !== 'perm') return;
    (async () => {
      try {
        if (Platform.OS === 'ios') {
          // CameraRoll.getPhotos が初回呼び出しで PHPicker の権限ダイアログを出す
          await CameraRoll.getPhotos({ first: 1, assetType: 'Photos' });
          setGranted(true);
        } else {
          const r = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES ??
              PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          );
          setGranted(r === PermissionsAndroid.RESULTS.GRANTED);
        }
      } catch {
        setGranted(false);
      }
    })();
  }, [stage]);

  if (stage === 'perm') {
    return (
      <View style={s.root}>
        <Text style={s.title}>写真へのアクセス</Text>
        <Text style={s.body}>
          自動取り込みのため写真ライブラリへのアクセスを許可してください。
          後で設定アプリから変更できます。
        </Text>
        {granted === false && (
          <Text style={s.warn}>
            権限が拒否されました。手動アップロードのみ利用可能です。
          </Text>
        )}
        <View style={{ height: 24 }} />
        <Button title="次へ" onPress={() => setStage('tour')} />
      </View>
    );
  }

  const slides = [
    {
      title: 'フォルダタブ',
      body: 'ファイル管理アプリ風のヒエラルキー型ストレージ。検索・並び替え・選択・移動。',
    },
    {
      title: 'アルバムタブ',
      body: '写真.app風UI。日付グルーピングで一覧。自動取り込み対応。',
    },
    {
      title: '設定タブ',
      body: 'バケット切替、鍵管理、生体認証ロック、容量表示。',
    },
  ];
  const slide = slides[tourIdx];
  const isLast = tourIdx === slides.length - 1;
  return (
    <View style={s.root}>
      <Text style={s.title}>{slide.title}</Text>
      <Text style={s.body}>{slide.body}</Text>
      <View style={{ height: 24 }} />
      <Button
        title={isLast ? '使い始める' : '次へ'}
        onPress={() => {
          if (isLast) onDone();
          else setTourIdx(tourIdx + 1);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  body: { color: '#555', lineHeight: 20 },
  warn: { color: '#c33', marginTop: 12 },
});
