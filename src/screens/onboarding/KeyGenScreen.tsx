import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { generate12WordMnemonic } from '@/crypto/mnemonic';
import { saveMnemonic } from '@/crypto/keychain';
import { unlock } from '@/state/keyStore';
import { useTheme, type, radii } from '@/theme';
import { Button, Screen } from '@/components/ui';

export default function KeyGenScreen({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const mnemonic = useMemo(() => generate12WordMnemonic(), []);
  const words = mnemonic.split(' ');
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState(false);

  async function commit() {
    if (!checked) {
      Alert.alert('もうひとつだけ', '書き写してから、チェックを入れてください。');
      return;
    }
    await saveMnemonic(mnemonic);
    await unlock();
    onDone();
  }

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
          <Text style={[type.h1, { color: t.text, marginBottom: 12 }]}>あなたの合言葉</Text>
          <Text
            style={{
              fontSize: 14,
              color: t.text2,
              lineHeight: 24,
              marginBottom: 22,
            }}>
            この{' '}
            <Text style={{ color: t.text, fontWeight: '600' }}>12 個の言葉</Text>{' '}
            が、あなたの鍵です。紙に書いて、大切な場所にしまっておいてください。なくしてしまうと、誰にも開けられなくなります。
          </Text>

          <View
            style={{
              backgroundColor: t.surface,
              borderColor: t.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radii['2xl'],
              padding: 18,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
            }}>
            {words.map((w, i) => (
              <View
                key={i}
                style={{
                  width: '48%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  backgroundColor: t.surface2,
                  borderRadius: radii.md,
                }}>
                <Text style={[type.num, { fontSize: 10, color: t.text3, width: 16 }]}>
                  {String(i + 1).padStart(2, '0')}
                </Text>
                <Text
                  style={{
                    ...type.mono,
                    fontSize: 14,
                    color: t.text,
                    fontWeight: '500',
                    // Naive blur fallback — RN has no CSS blur. Hide text behind a chip.
                    opacity: revealed ? 1 : 0,
                  }}>
                  {w}
                </Text>
              </View>
            ))}
            {!revealed && (
              <Pressable
                onPress={() => setRevealed(true)}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radii['2xl'],
                  backgroundColor: t.surface,
                }}>
                <Text style={{ fontSize: 22, marginBottom: 6 }}>👁</Text>
                <Text style={{ color: t.text, fontWeight: '600', fontSize: 14 }}>
                  タップして見る
                </Text>
                <Text style={{ color: t.text3, fontSize: 11, marginTop: 4 }}>
                  周りに人がいないことを確かめてから
                </Text>
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => setChecked(c => !c)}
            style={{
              marginTop: 20,
              flexDirection: 'row',
              gap: 12,
              alignItems: 'flex-start',
              padding: 14,
              borderRadius: radii.lg,
              backgroundColor: t.surface2,
            }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: checked ? t.accent : t.borderStrong,
                backgroundColor: checked ? t.accent : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 1,
              }}>
              {checked && (
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>
              )}
            </View>
            <Text style={{ flex: 1, color: t.text, fontSize: 13, lineHeight: 21 }}>
              書き写しました。あとからは見られないこと、わかっています。
            </Text>
          </Pressable>

          <View style={{ height: 16 }} />
          <Button
            title="次へ"
            onPress={commit}
            disabled={!checked || !revealed}
          />
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}
