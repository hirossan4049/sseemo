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
      Alert.alert('確認', '「書き写した」にチェックしてください');
      return;
    }
    await saveMnemonic(mnemonic);
    await unlock();
    onDone();
  }

  return (
    <ScrollView contentContainerStyle={s.root}>
      <Text style={s.title}>回復用フレーズ</Text>
      <Text style={s.body}>
        この12語があれば、アプリ無しでもデータを復号できます。
        オフラインに書き写し、誰にも見せず保管してください。
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
        <Text style={{ marginLeft: 8 }}>書き写した</Text>
      </View>
      <Button title="完了" onPress={commit} />
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
});
