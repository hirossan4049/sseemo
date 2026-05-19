import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RootTabs from '@/navigation/RootNavigator';
import WelcomeScreen from '@/screens/onboarding/WelcomeScreen';
import BucketSetupScreen from '@/screens/onboarding/BucketSetupScreen';
import KeyGenScreen from '@/screens/onboarding/KeyGenScreen';
import { loadMnemonic } from '@/crypto/keychain';
import { unlock } from '@/state/keyStore';
import { ActivityIndicator, View } from 'react-native';

const Stack = createNativeStackNavigator();

export default function App() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    (async () => {
      const m = await loadMnemonic();
      if (m) {
        await unlock();
        setOnboarded(true);
      }
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
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
                  onDone={() => setOnboarded(true)}
                />
              )}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
