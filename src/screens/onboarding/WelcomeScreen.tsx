import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, Alert, TextInput } from 'react-native';
import { signInWithApple } from '@/auth/apple';
import { runDevOnboard } from '@/auth/devOnboard';
import { MANAGED_BACKEND_URL } from '@/config';

export default function WelcomeScreen({ navigation }: any) {
  const [devToken, setDevToken] = useState('');
  const [devBackend, setDevBackend] = useState(MANAGED_BACKEND_URL);
  const [devBusy, setDevBusy] = useState(false);

  return (
    <View style={s.root} testID="welcome-screen">
      <Text style={s.title}>大事なものを、{'\n'}安心して置ける場所。</Text>
      <Text style={s.body}>
        写真も、書類も、思い出も。鍵はあなたが持っていてください。アプリがなくなっても、データは取り出せます。
      </Text>
      <View style={{ height: 32 }} />
      <Text style={s.subTitle}>はじめまして</Text>
      <Text style={s.subBody}>
        Apple IDでサインインします。お支払いの管理だけに使うので、ファイルや鍵はこちらからは見えません。
      </Text>
      <View style={s.checklist}>
        <Text style={s.checkItem}>・ファイルは手元で鍵をかけます</Text>
        <Text style={s.checkItem}>・必要なのはApple IDだけ</Text>
        <Text style={s.checkItem}>・やめたいときはすぐに消せます</Text>
      </View>
      <View style={{ height: 16 }} />
      <Button
        testID="welcome-apple-btn"
        title="Apple でサインイン"
        onPress={async () => {
          try {
            await signInWithApple();
          } catch {
            // dev フォールバック: そのまま進む
          }
          navigation.navigate('BucketSetup');
        }}
      />
      {__DEV__ && (
        <View style={s.devBox}>
          <Text style={s.devLabel}>Dev: sign in via test JWT</Text>
          <Text style={s.devHint}>
            Backend gate: requires ALLOW_DEV_AUTH=true + DEV_AUTH_TOKEN on server.
          </Text>
          <TextInput
            value={devBackend}
            onChangeText={setDevBackend}
            placeholder="Backend URL"
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
          />
          <TextInput
            testID="welcome-dev-token-input"
            value={devToken}
            onChangeText={setDevToken}
            placeholder="DEV_AUTH_TOKEN"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={s.input}
          />
          <Button
            testID="welcome-dev-login-btn"
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
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 38 },
  body: { fontSize: 15, marginTop: 16, color: '#555', lineHeight: 22 },
  subTitle: { fontSize: 20, fontWeight: '600' },
  subBody: { fontSize: 14, marginTop: 8, color: '#666', lineHeight: 20 },
  checklist: { marginTop: 14 },
  checkItem: { fontSize: 13, color: '#555', marginVertical: 2 },
  devBox: {
    marginTop: 32,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 6,
    backgroundColor: '#f6f6f6',
  },
  devLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  devHint: { fontSize: 11, color: '#666', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 6,
    marginVertical: 4,
    backgroundColor: '#fff',
    fontSize: 12,
  },
});
