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
import { authApple } from '@/s3/managedClient';
import { signInWithApple } from '@/auth/apple';
import { MANAGED_BACKEND_URL } from '@/config';

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
      let creds: BucketCredentials;
      if (mode === 'managed') {
        const apple = await signInWithApple();
        if (!apple.identityToken) throw new Error('Apple identityToken missing');
        const { token, userId } = await authApple(MANAGED_BACKEND_URL, apple.identityToken);
        creds = {
          id: `managed-${userId}`,
          mode: 'managed',
          endpoint: MANAGED_BACKEND_URL,
          region: 'auto',
          bucket: 'managed',
          accessKeyId: '',
          secretAccessKey: '',
          backendUrl: MANAGED_BACKEND_URL,
          sessionToken: token,
        };
      } else {
        creds = {
          id: `b-${Date.now()}`,
          mode: 'byo',
          endpoint,
          region,
          bucket,
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
        };
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
    <ScrollView contentContainerStyle={s.root} testID="bucket-setup-screen">
      <Text style={s.title}>バケット選択</Text>
      <View style={s.row}>
        <Button
          testID="bucket-managed-btn"
          title={`マネージド ${mode === 'managed' ? '✓' : ''}`}
          onPress={() => setMode('managed')}
        />
        <View style={{ width: 8 }} />
        <Button
          testID="bucket-byo-btn"
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
      <Button
        testID="bucket-continue-btn"
        title={testing ? '...' : '次へ'}
        onPress={proceed}
        disabled={testing}
      />
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
