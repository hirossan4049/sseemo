import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { headBucket } from '@/s3/client';
import { BucketCredentials } from '@/crypto/keychain';
import { addBucket } from '@/state/bucketStore';

export default function BucketSetupScreen({ navigation }: any) {
  const [mode, setMode] = useState<'managed' | 'byo'>('managed');
  const [endpoint, setEndpoint] = useState('https://s3.amazonaws.com');
  const [region, setRegion] = useState('us-east-1');
  const [bucket, setBucket] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [testing, setTesting] = useState(false);

  async function proceed() {
    setTesting(true);
    try {
      const creds: BucketCredentials = {
        id: `b-${Date.now()}`,
        mode,
        endpoint:
          mode === 'managed' ? 'https://managed.secstorage.app' : endpoint,
        region: mode === 'managed' ? 'auto' : region,
        bucket: mode === 'managed' ? 'managed' : bucket,
        accessKeyId: mode === 'managed' ? 'managed' : accessKey,
        secretAccessKey: mode === 'managed' ? 'managed' : secretKey,
      };
      if (mode === 'byo') {
        const ok = await headBucket(creds);
        if (!ok) throw new Error('接続テスト失敗');
      }
      await addBucket(creds);
      navigation.navigate('KeyGen');
    } catch (e: any) {
      Alert.alert('接続に失敗しました', e.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.root}>
      <Text style={s.title}>バケット選択</Text>
      <View style={s.row}>
        <Button
          title={`マネージド ${mode === 'managed' ? '✓' : ''}`}
          onPress={() => setMode('managed')}
        />
        <View style={{ width: 8 }} />
        <Button
          title={`互換S3 ${mode === 'byo' ? '✓' : ''}`}
          onPress={() => setMode('byo')}
        />
      </View>
      {mode === 'byo' && (
        <>
          <Field label="Endpoint" value={endpoint} onChange={setEndpoint} />
          <Field label="Region" value={region} onChange={setRegion} />
          <Field label="Bucket" value={bucket} onChange={setBucket} />
          <Field label="Access Key ID" value={accessKey} onChange={setAccessKey} />
          <Field
            label="Secret Access Key"
            value={secretKey}
            onChange={setSecretKey}
            secure
          />
        </>
      )}
      <View style={{ height: 24 }} />
      <Button title={testing ? '...' : '次へ'} onPress={proceed} disabled={testing} />
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
}) {
  return (
    <View style={{ marginVertical: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        style={s.input}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  row: { flexDirection: 'row', marginBottom: 16 },
  label: { fontSize: 12, color: '#666', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 8,
  },
});
