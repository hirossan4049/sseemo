import React, { useEffect, useRef, useState } from 'react';
import { AppState, ActivityIndicator, View, Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RootTabs from '@/navigation/RootNavigator';
import WelcomeScreen from '@/screens/onboarding/WelcomeScreen';
import BucketSetupScreen from '@/screens/onboarding/BucketSetupScreen';
import KeyGenScreen from '@/screens/onboarding/KeyGenScreen';
import PermissionsTourScreen from '@/screens/onboarding/PermissionsTourScreen';
import LockScreen from '@/screens/LockScreen';
import { loadMnemonic } from '@/crypto/keychain';
import {
  unlock,
  lock,
  maybeAutoLock,
  touch,
  getMaster,
} from '@/state/keyStore';
import { init as initIAP } from '@/iap';
import { runAutoImport } from '@/photos/autoImport';
import { runDevOnboard } from '@/auth/devOnboard';

const Stack = createNativeStackNavigator();

export default function App() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [locked, setLocked] = useState(false);
  const importTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    (async () => {
      await initIAP().catch(() => {});
      const m = await loadMnemonic();
      if (m) {
        setOnboarded(true);
        const k = await unlock();
        setLocked(!k);
      }
      setReady(true);
    })();
  }, []);

  // Dev-only deeplink: `secstorage://dev-onboard?token=...&tag=...&verify=1&cleanup=1`
  // drives the managed-backend onboarding + roundtrip without UI interaction.
  // Backend gate (`ALLOW_DEV_AUTH`) is what actually keeps prod safe.
  useEffect(() => {
    if (!__DEV__) return;
    async function handle(url: string | null) {
      if (!url) return;
      try {
        // Parse `secstorage://dev-onboard?k=v&...` without depending on whatwg URL.
        // Accept either `secstorage://dev-onboard?...` or the conflict-free
        // dev-only scheme `secstoragedev://onboard?...` (expo-dev-client owns
        // the `secstorage://` scheme on first launch and may swallow it).
        const m = /^(secstorage|secstoragedev):\/\/([^/?]+)(?:\?(.*))?$/.exec(url);
        if (!m || (m[2] !== 'dev-onboard' && m[2] !== 'onboard')) return;
        const params = new Map<string, string>();
        for (const kv of (m[3] ?? '').split('&').filter(Boolean)) {
          const i = kv.indexOf('=');
          const k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
          const v = decodeURIComponent(i < 0 ? '' : kv.slice(i + 1));
          params.set(k, v);
        }
        const token = params.get('token') ?? '';
        const tag = params.get('tag') ?? 'sim';
        const backendUrl = params.get('backend') || undefined;
        const verify = params.get('verify') === '1';
        const cleanup = params.get('cleanup') === '1';
        if (!token) {
          console.log('[VERIFY] dev-onboard missing token');
          return;
        }
        await runDevOnboard({ backendUrl, token, deviceTag: tag, verify, cleanup });
        if (!cleanup) {
          // Surface onto the Main stack so the user can poke around.
          setOnboarded(true);
          setLocked(false);
        }
      } catch (e: any) {
        console.log(`[VERIFY] dev-onboard error: ${e?.message ?? e}`);
      }
    }
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', e => handle(e.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async state => {
      if (state === 'active') {
        if (await maybeAutoLock()) setLocked(true);
        if (!getMaster()) return;
        runAutoImport().catch(() => {});
      } else {
        touch();
      }
    });
    importTimer.current = setInterval(() => {
      if (getMaster()) runAutoImport().catch(() => {});
    }, 5 * 60 * 1000);
    return () => {
      sub.remove();
      if (importTimer.current) clearInterval(importTimer.current);
    };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (onboarded && locked) {
    return <LockScreen onUnlocked={() => setLocked(false)} />;
  }

  return (
    <NavigationContainer
      onStateChange={() => touch()}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {onboarded ? (
          <Stack.Screen name="Main" component={RootTabs} />
        ) : (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="BucketSetup" component={BucketSetupScreen} />
            <Stack.Screen name="KeyGen">
              {props => (
                <KeyGenScreen
                  {...props}
                  onDone={() => (props.navigation as any).navigate('PermissionsTour')}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="PermissionsTour">
              {() => <PermissionsTourScreen onDone={() => setOnboarded(true)} />}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
