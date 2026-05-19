import AsyncStorage from '@react-native-async-storage/async-storage';
import { BucketCredentials, loadBucket, saveBucket } from '@/crypto/keychain';

const LIST_KEY = '@secstorage/buckets/v1';
const ACTIVE_KEY = '@secstorage/buckets/active';

export async function listBucketIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(LIST_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function addBucket(creds: BucketCredentials): Promise<void> {
  await saveBucket(creds);
  const ids = await listBucketIds();
  if (!ids.includes(creds.id)) {
    ids.push(creds.id);
    await AsyncStorage.setItem(LIST_KEY, JSON.stringify(ids));
  }
  if (!(await getActiveBucketId())) {
    await setActiveBucketId(creds.id);
  }
}

export async function getActiveBucketId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_KEY);
}

export async function setActiveBucketId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_KEY, id);
}

export async function getActiveBucket(): Promise<BucketCredentials | null> {
  const id = await getActiveBucketId();
  if (!id) return null;
  return loadBucket(id);
}
