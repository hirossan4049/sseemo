import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { signInWithApple } from '@/auth/apple';

export default function WelcomeScreen({ navigation }: any) {
  return (
    <View style={s.root}>
      <Text style={s.title}>SecStorage</Text>
      <Text style={s.lead}>鍵は、自分で持つ。</Text>
      <Text style={s.body}>
        E2E暗号化で写真・書類を保管します。鍵さえあれば、アプリ無しでも復号できます。
      </Text>
      <View style={{ height: 24 }} />
      <Button
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
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '700' },
  lead: { fontSize: 20, marginTop: 12, color: '#444' },
  body: { fontSize: 14, marginTop: 16, color: '#666', lineHeight: 20 },
});
