import React, { useEffect, useRef, useState } from 'react';
import { AppState, ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RootTabs from '@/navigation/RootNavigator';
import WelcomeScreen from '@/screens/onboarding/WelcomeScreen';
import BucketSetupScreen from '@/screens/onboarding/BucketSetupScreen';
import KeyGenScreen from '@/screens/onboarding/KeyGenScreen';
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
                <KeyGenScreen {...props} onDone={() => setOnboarded(true)} />
              )}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
