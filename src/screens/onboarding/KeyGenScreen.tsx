import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  Switch,
  ScrollView,
  Alert,
} from 'react-native';
import { generate12WordMnemonic } from '@/crypto/mnemonic';
import { saveMnemonic } from '@/crypto/keychain';
import { unlock } from '@/state/keyStore';

export default function KeyGenScreen({ onDone }: { onDone: () => void }) {
  const mnemonic = useMemo(() => generate12WordMnemonic(), []);
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
    <ScrollView contentContainerStyle={s.root}>
      <Text style={s.title}>あなたの合言葉</Text>
      <Text style={s.body}>
        この12個の言葉が、あなたの鍵です。紙に書いて、大切な場所にしまっておいてください。なくしてしまうと、誰にも開けられなくなります。
      </Text>
      <View style={s.grid}>
        {mnemonic.split(' ').map((w, i) => (
          <View key={i} style={s.word}>
            <Text style={s.num}>{i + 1}</Text>
            <Text style={s.wordText}>{w}</Text>
          </View>
        ))}
      </View>
      <View style={s.checkRow}>
        <Switch value={checked} onValueChange={setChecked} />
        <Text style={s.checkText}>
          書き写しました。あとからは見られないこと、わかっています。
        </Text>
      </View>
      <Button title="次へ" onPress={commit} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  body: { color: '#555', marginBottom: 16, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  word: {
    width: '33%',
    flexDirection: 'row',
    paddingVertical: 6,
    alignItems: 'center',
  },
  num: { width: 22, color: '#888', fontSize: 11 },
  wordText: { fontWeight: '600' },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  checkText: { marginLeft: 8, flex: 1, fontSize: 13, color: '#444', lineHeight: 18 },
});
