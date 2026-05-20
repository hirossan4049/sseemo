import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Button,
  Alert,
} from 'react-native';
import * as Keychain from 'react-native-keychain';
import { isPassphraseEnabled, unlock } from '@/state/keyStore';

/**
 * 生体認証ロック。
 * - パスフレーズ未設定 → Keychain の biometryPrompt だけで解錠
 * - パスフレーズ設定済 → パスフレーズ入力 + Keychain
 */
export default function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [pp, setPp] = useState('');

  useEffect(() => {
    (async () => {
      if (await isPassphraseEnabled()) {
        setNeedsPassphrase(true);
        return;
      }
      try {
        // 触ることで biometry プロンプト発火
        await Keychain.getGenericPassword({
          service: 'app.secstorage.mnemonic',
          authenticationPrompt: { title: 'sseemo のロック解除' },
        });
        const k = await unlock();
        if (k) onUnlocked();
      } catch {}
    })();
  }, [onUnlocked]);

  async function tryUnlock() {
    const k = await unlock(pp);
    if (k) onUnlocked();
    else Alert.alert('解錠失敗', 'パスフレーズが違います');
  }

  return (
    <View style={s.root}>
      <Text style={s.title}>🔒 sseemo</Text>
      {needsPassphrase && (
        <>
          <TextInput
            placeholder="パスフレーズ"
            value={pp}
            onChangeText={setPp}
            secureTextEntry
            style={s.input}
          />
          <Button title="解錠" onPress={tryUnlock} />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 32 },
  title: { fontSize: 28, textAlign: 'center', marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
});
