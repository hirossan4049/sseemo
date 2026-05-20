import React, { useState } from 'react';
import {
  View,
  Text,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { deviceLogin } from '@/auth/deviceLogin';
import { useTheme, type } from '@/theme';
import {
  Button,
  Card,
  CardRow,
  BrandMark,
  Wordmark,
  Screen,
} from '@/components/ui';

export default function WelcomeScreen({ navigation }: any) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);

  return (
    <Screen testID="welcome-screen">
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingTop: 60,
            paddingBottom: 40,
            justifyContent: 'space-between',
          }}>
          <View>
            <View style={{ alignItems: 'center', marginBottom: 40, gap: 14 }}>
              <BrandMark size={88} />
              <Wordmark size={36} />
            </View>
            <Text
              style={[
                type.h1Large,
                { color: t.text, marginBottom: 16, lineHeight: 38 },
              ]}>
              大事なものを、{'\n'}安心して置ける場所。
            </Text>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 26,
                color: t.text2,
                maxWidth: 320,
              }}>
              写真も、書類も、思い出も。鍵はあなたが持っていてください。アプリがなくなっても、データは取り出せます。
            </Text>

            <View style={{ height: 24 }} />

            <Card>
              {[
                'ファイルは手元で鍵をかけます',
                'アカウント登録は不要。端末がそのまま鍵になります',
                'やめたいときはすぐに消せます',
              ].map((line, i, a) => (
                <CardRow key={line} last={i === a.length - 1}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: t.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text style={{ color: t.accentText, fontSize: 13, fontWeight: '700' }}>
                      ✓
                    </Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, color: t.text }}>
                    {line}
                  </Text>
                </CardRow>
              ))}
            </Card>
          </View>

          <View style={{ gap: 10, marginTop: 24 }}>
            <Button
              testID="welcome-start-btn"
              title={busy ? '準備中…' : 'はじめる'}
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await deviceLogin();
                  navigation.navigate('BucketSetup');
                } catch (e: any) {
                  Alert.alert(
                    'はじめられませんでした',
                    e?.message ?? String(e),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Text
              style={{
                textAlign: 'center',
                fontSize: 12,
                color: t.text3,
              }}>
              続けると 利用規約 と プライバシー に同意したことになります
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}
