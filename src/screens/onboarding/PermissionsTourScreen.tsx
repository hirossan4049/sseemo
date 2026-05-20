import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { requestNotificationPermissionOnce } from '@/state/usageNotify';

/**
 * spec §8 オンボーディング step 5/6:
 * - 写真アクセス権限リクエスト
 * - 簡易ツアー (3スライド)
 */
export default function PermissionsTourScreen({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<'perm' | 'tour'>('perm');
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
        // spec §4: 80/95% 容量通知用のローカル通知許可も同時に依頼
        await requestNotificationPermissionOnce().catch(() => {});
      } catch {
        setGranted(false);
      }
    })();
  }, [stage]);

  if (stage === 'perm') {
    return (
      <View style={s.root}>
        <Text style={s.title}>写真もあずかります</Text>
        <Text style={s.body}>
          許可していただくと、新しい写真は鍵をかけて自動でしまっておきます。いつでもやめられます。
        </Text>
        <View style={s.bullets}>
          <Text style={s.bullet}>・見るだけ。書いたり消したりはしません。</Text>
          <Text style={s.bullet}>・Wi-Fiのときだけ。通信量は気にしなくて大丈夫です。</Text>
          <Text style={s.bullet}>
            ・小さな写真も鍵つきで。サッと開けるよう手元にも置いておきます。
          </Text>
        </View>
        {granted === false && (
          <Text style={s.warn}>
            今は許可いただけませんでした。あとから設定アプリで変えられます。
          </Text>
        )}
        <View style={{ height: 24 }} />
        <Button title="次へ" onPress={() => setStage('tour')} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <Text style={s.title}>準備できました</Text>
      <Text style={s.body}>使うのはこの3つだけ。</Text>
      <View style={s.tabList}>
        <TabRow label="フォルダ" body="ファイルを置く場所" />
        <TabRow label="アルバム" body="写真を日付で" />
        <TabRow label="設定" body="保存先と鍵のこと" />
      </View>
      <View style={{ height: 24 }} />
      <Button title="使い始める" onPress={onDone} />
    </View>
  );
}

function TabRow({ label, body }: { label: string; body: string }) {
  return (
    <View style={s.tabRow}>
      <Text style={s.tabLabel}>{label}</Text>
      <Text style={s.tabBody}>/ {body}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  body: { color: '#555', lineHeight: 20 },
  bullets: { marginTop: 16 },
  bullet: { color: '#555', lineHeight: 22, fontSize: 13 },
  warn: { color: '#c33', marginTop: 12 },
  tabList: { marginTop: 16 },
  tabRow: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 6 },
  tabLabel: { fontSize: 16, fontWeight: '600', width: 96 },
  tabBody: { color: '#555' },
});
