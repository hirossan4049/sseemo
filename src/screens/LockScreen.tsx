import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { isPassphraseEnabled, unlock } from '@/state/keyStore';
import { useTheme, radii, type } from '@/theme';
import { Button, Screen, BrandMark, Wordmark } from '@/components/ui';

/**
 * Biometric lock.
 * - Without passphrase → Keychain biometryPrompt only
 * - With passphrase    → user passphrase + Keychain
 */
export default function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const t = useTheme();
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [pp, setPp] = useState('');

  useEffect(() => {
    (async () => {
      if (await isPassphraseEnabled()) {
        setNeedsPassphrase(true);
        return;
      }
      try {
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
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 24 }}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <BrandMark size={84} />
          <Wordmark size={28} />
        </View>
        <Text style={[type.bodySmall, { color: t.text2 }]}>
          {needsPassphrase ? '合言葉を入力してください' : '生体認証で解錠してください'}
        </Text>
        {needsPassphrase && (
          <View style={{ width: '100%', maxWidth: 320, gap: 12 }}>
            <TextInput
              placeholder="パスフレーズ"
              placeholderTextColor={t.text3}
              value={pp}
              onChangeText={setPp}
              secureTextEntry
              style={{
                height: 44,
                paddingHorizontal: 14,
                backgroundColor: t.surface,
                borderColor: t.borderStrong,
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: radii.lg,
                color: t.text,
                fontSize: 15,
              }}
            />
            <Button title="解錠" onPress={tryUnlock} />
          </View>
        )}
      </View>
    </Screen>
  );
}
