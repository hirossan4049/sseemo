import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, TouchableOpacity, View } from 'react-native';
import FoldersScreen from '@/screens/FoldersScreen';
import AlbumsScreen from '@/screens/AlbumsScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import { palettes } from '@/theme';

const Tab = createBottomTabNavigator();

const tabIcon =
  (emoji: string) =>
  ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
  );

// Maestro-targetable tab buttons.
const tabButton = (testID: string) => (props: any) => (
  <TouchableOpacity {...props} testID={testID} activeOpacity={0.7} />
);

export default function RootTabs() {
  // We use the light palette here so the tab bar tone matches the design's
  // mocked iPhone frame. (Settings UI follows useColorScheme via useTheme.)
  const t = palettes.light;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.text3,
        tabBarStyle: {
          backgroundColor: t.bg,
          borderTopColor: t.border,
          borderTopWidth: 0.5,
          paddingTop: 6,
          height: 84,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.4,
        },
      }}>
      <Tab.Screen
        name="Folders"
        component={FoldersScreen}
        options={{
          title: 'フォルダ',
          tabBarIcon: tabIcon('📁'),
          tabBarButton: tabButton('tab-folders'),
        }}
      />
      <Tab.Screen
        name="Albums"
        component={AlbumsScreen}
        options={{
          title: 'アルバム',
          tabBarIcon: tabIcon('🖼'),
          tabBarButton: tabButton('tab-albums'),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: '設定',
          tabBarIcon: tabIcon('⚙️'),
          tabBarButton: tabButton('tab-settings'),
        }}
      />
    </Tab.Navigator>
  );
}
