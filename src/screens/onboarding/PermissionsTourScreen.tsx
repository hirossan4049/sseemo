import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Platform,
  PermissionsAndroid,
  ScrollView,
} from 'react-native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { requestNotificationPermissionOnce } from '@/state/usageNotify';
import { useTheme, type, radii } from '@/theme';
import { Button, Card, CardRow, Screen } from '@/components/ui';
import { AppIcon, type AppIconName } from '@/components/icons';

/**
 * spec §8 onboarding step 5/6:
 * - photo library permission
 * - 3-row tour
 */
export default function PermissionsTourScreen({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const [stage, setStage] = useState<'perm' | 'tour'>('perm');
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (stage !== 'perm') return;
    (async () => {
      try {
        if (Platform.OS === 'ios') {
          await CameraRoll.getPhotos({ first: 1, assetType: 'Photos' });
          setGranted(true);
        } else {
          const r = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES ??
              PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          );
          setGranted(r === PermissionsAndroid.RESULTS.GRANTED);
        }
        await requestNotificationPermissionOnce().catch(() => {});
      } catch {
        setGranted(false);
      }
    })();
  }, [stage]);

  if (stage === 'perm') {
    return (
      <Screen testID="tour-perm-screen">
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: t.surface2,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
              }}>
              <AppIcon name="image" color={t.accentText} size={30} />
            </View>
            <Text style={[type.h1, { color: t.text, marginBottom: 12 }]}>写真もあずかります</Text>
            <Text style={{ fontSize: 14, color: t.text2, lineHeight: 24, marginBottom: 24 }}>
              許可していただくと、新しい写真は鍵をかけて自動でしまっておきます。いつでもやめられます。
            </Text>
            <Card>
              {[
                { t: '見るだけです', s: '書いたり消したりはしません' },
                { t: 'Wi-Fi のときだけ', s: '通信量は気にしなくて大丈夫です' },
                { t: '小さな写真も鍵つきで', s: 'サッと開けるよう手元にも置いておきます' },
              ].map((row, i, a) => (
                <CardRow key={i} last={i === a.length - 1}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: t.text }}>
                      {row.t}
                    </Text>
                    <Text style={{ fontSize: 12, color: t.text2, marginTop: 2 }}>
                      {row.s}
                    </Text>
                  </View>
                </CardRow>
              ))}
            </Card>
            {granted === false && (
              <Text
                style={{
                  color: t.danger,
                  marginTop: 12,
                  fontSize: 13,
                }}>
                今は許可いただけませんでした。あとから設定アプリで変えられます。
              </Text>
            )}
            <View style={{ height: 24 }} />
            <Button testID="tour-next-btn" title="次へ" onPress={() => setStage('tour')} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen testID="tour-done-screen">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
          <Text
            style={{
              fontSize: 11,
              color: t.accentText,
              letterSpacing: 1.8,
              fontWeight: '700',
              marginBottom: 14,
            }}>
            ALL SET
          </Text>
          <Text style={[type.h1Large, { color: t.text, marginBottom: 12 }]}>準備できました</Text>
          <Text style={{ fontSize: 14, color: t.text2, lineHeight: 22, marginBottom: 24 }}>
            使うのはこの 3 つだけ。
          </Text>
          <View style={{ gap: 12 }}>
            {[
              { icon: 'folder', t: 'フォルダ', s: 'ファイルを置く場所' },
              { icon: 'image', t: 'アルバム', s: '写真を日付で' },
              { icon: 'settings', t: '設定', s: '保存先と鍵のこと' },
            ].map((r, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  padding: 14,
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  borderWidth: 1,
                  borderRadius: radii.xl,
                }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: t.surface2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <AppIcon
                    name={r.icon as AppIconName}
                    color={t.text2}
                    size={20}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>
                    {r.t}
                  </Text>
                  <Text style={{ fontSize: 12, color: t.text2, marginTop: 1 }}>
                    {r.s}
                  </Text>
                </View>
                <AppIcon name="chevronRight" color={t.text3} size={18} />
              </View>
            ))}
          </View>
          <View style={{ height: 24 }} />
          <Button testID="tour-done-btn" title="使い始める" onPress={onDone} />
      </ScrollView>
    </Screen>
  );
}
