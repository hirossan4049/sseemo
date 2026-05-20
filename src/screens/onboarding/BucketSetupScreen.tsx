import React, { useState } from 'react';
import {
  View,
  Text,
  Alert,
  ScrollView,
  Pressable,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { headBucket } from '@/s3/client';
import { BucketCredentials } from '@/crypto/keychain';
import { addBucket } from '@/state/bucketStore';
import { deviceLogin } from '@/auth/deviceLogin';
import { MANAGED_BACKEND_URL } from '@/config';
import { useTheme, type, radii } from '@/theme';
import { Button, Field, Chip, Screen } from '@/components/ui';

export default function BucketSetupScreen({ navigation }: any) {
  const t = useTheme();
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
        creds = await deviceLogin(MANAGED_BACKEND_URL);
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
        await addBucket(creds);
      }
      navigation.navigate('KeyGen');
    } catch (e: any) {
      Alert.alert('接続に失敗しました', e.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Screen testID="bucket-setup-screen">
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
          <Text style={[type.h1, { color: t.text, marginBottom: 12 }]}>
            どこに置きますか？
          </Text>
          <Text style={{ fontSize: 14, color: t.text2, lineHeight: 24, marginBottom: 24 }}>
            どちらを選んでも、安全さは変わりません。あとから変えられます。
          </Text>

          <BucketCard
            testID="bucket-managed-btn"
            selected={mode === 'managed'}
            onPress={() => setMode('managed')}
            tag="おまかせ"
            title="マネージド"
            free="5GB まで無料"
            price="¥480 / 月"
            desc="すぐ使えるおまかせプラン。ストレージ料金もアプリ料金に含まれます。"
          />
          <View style={{ height: 12 }} />
          <BucketCard
            testID="bucket-byo-btn"
            selected={mode === 'byo'}
            onPress={() => setMode('byo')}
            tag="ご自身で用意"
            title="BYO・互換 S3"
            free="10GB まで無料"
            price="¥480 / 月"
            desc="お持ちのストレージにつなぎます。ストレージ料金はご利用先にお支払いください。"
          />

          {mode === 'byo' && (
            <View style={{ marginTop: 24 }}>
              <Text style={[type.h3, { color: t.text, marginBottom: 4 }]}>
                つなぎ先を教えてください
              </Text>
              <Text style={{ fontSize: 13, color: t.text2, marginBottom: 16, lineHeight: 20 }}>
                S3 互換ならどこでも大丈夫です (Cloudflare R2、Wasabi、Backblaze など)
              </Text>
              <Field label="つなぎ先のアドレス" value={endpoint} onChange={setEndpoint} mono />
              <Field label="地域" value={region} onChange={setRegion} mono />
              <Field label="入れものの名前" value={bucket} onChange={setBucket} mono />
              <Field label="アクセスキー" value={accessKey} onChange={setAccessKey} mono />
              <Field label="ひみつのキー" value={secretKey} onChange={setSecretKey} secure mono />
            </View>
          )}

          <View style={{ height: 24 }} />
          <Button
            testID="bucket-continue-btn"
            title={testing ? 'つながりを確かめています…' : '次へ'}
            onPress={proceed}
            disabled={testing}
          />
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function BucketCard({
  selected,
  onPress,
  tag,
  title,
  free,
  price,
  desc,
  testID,
}: {
  selected: boolean;
  onPress: () => void;
  tag: string;
  title: string;
  free: string;
  price: string;
  desc: string;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        backgroundColor: t.surface,
        borderColor: selected ? t.text : t.border,
        borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
        borderRadius: radii['2xl'],
        padding: 18,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: '700',
            color: t.text3,
            letterSpacing: 1,
          }}>
          {tag.toUpperCase()}
        </Text>
        <Chip label={free} tone="accent" />
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}>
        <Text style={{ fontSize: 19, fontWeight: '600', color: t.text, letterSpacing: -0.3 }}>
          {title}
        </Text>
        <Text style={[type.num, { fontSize: 12, color: t.text2 }]}>{price}</Text>
      </View>
      <Text style={{ fontSize: 13, color: t.text2, lineHeight: 21 }}>{desc}</Text>
    </Pressable>
  );
}
