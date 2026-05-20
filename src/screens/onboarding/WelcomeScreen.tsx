import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { signInWithApple } from '@/auth/apple';
import { runDevOnboard } from '@/auth/devOnboard';
import { MANAGED_BACKEND_URL } from '@/config';
import { useTheme, type } from '@/theme';
import {
  Button,
  Card,
  CardRow,
  BrandMark,
  Wordmark,
  Field,
  Screen,
} from '@/components/ui';

export default function WelcomeScreen({ navigation }: any) {
  const t = useTheme();
  const [devToken, setDevToken] = useState('');
  const [devBackend, setDevBackend] = useState(MANAGED_BACKEND_URL);
  const [devBusy, setDevBusy] = useState(false);

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
                '必要なのは Apple ID だけ',
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
              testID="welcome-apple-btn"
              title="Apple でサインイン"
              onPress={async () => {
                try {
                  await signInWithApple();
                } catch {
                  // dev fallback
                }
                navigation.navigate('BucketSetup');
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

          {__DEV__ && (
            <View
              style={[
                s.devBox,
                { backgroundColor: t.surface2, borderColor: t.border },
              ]}>
              <Text style={[s.devLabel, { color: t.text }]}>
                Dev: sign in via test JWT
              </Text>
              <Text style={[s.devHint, { color: t.text2 }]}>
                Backend gate: ALLOW_DEV_AUTH=true + DEV_AUTH_TOKEN on server.
              </Text>
              <Field
                label="Backend URL"
                value={devBackend}
                onChange={setDevBackend}
              />
              <Field
                label="DEV_AUTH_TOKEN"
                value={devToken}
                onChange={setDevToken}
                testID="welcome-dev-token-input"
              />
              <Button
                small
                testID="welcome-dev-login-btn"
                variant="secondary"
                title={devBusy ? '...' : 'Dev: sign in via test JWT'}
                disabled={devBusy || !devToken}
                onPress={async () => {
                  setDevBusy(true);
                  try {
                    await runDevOnboard({
                      backendUrl: devBackend,
                      token: devToken,
                      deviceTag: 'sim',
                      verify: true,
                    });
                    Alert.alert('Dev sign-in OK', 'See logs for [VERIFY] line.');
                    navigation.navigate('KeyGen');
                  } catch (e: any) {
                    Alert.alert('Dev sign-in failed', e?.message ?? String(e));
                  } finally {
                    setDevBusy(false);
                  }
                }}
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const s = StyleSheet.create({
  devBox: {
    marginTop: 32,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  devLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  devHint: { fontSize: 11, marginBottom: 8 },
});
