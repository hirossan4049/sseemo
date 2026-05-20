import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FoldersScreen from '@/screens/FoldersScreen';
import AlbumsScreen from '@/screens/AlbumsScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import { palettes } from '@/theme';
import { AppIcon, type AppIconName } from '@/components/icons';

const Tab = createBottomTabNavigator();

const tabIcon =
  (name: AppIconName) =>
  ({ focused, color }: { focused: boolean; color: string }) => (
    <AppIcon
      name={name}
      color={color}
      size={21}
      strokeWidth={focused ? 2.4 : 2}
    />
  );

// Maestro-targetable tab buttons.
const tabButton = (testID: string) => (props: any) => (
  <TouchableOpacity {...props} testID={testID} activeOpacity={0.7} />
);

export default function RootTabs() {
  // We use the light palette here so the tab bar tone matches the design's
  // mocked iPhone frame. (Settings UI follows useColorScheme via useTheme.)
  const t = palettes.light;
  const insets = useSafeAreaInsets();
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
          paddingBottom: Math.max(insets.bottom, 8),
          height: 56 + Math.max(insets.bottom, 8),
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
          tabBarIcon: tabIcon('folder'),
          tabBarButton: tabButton('tab-folders'),
        }}
      />
      <Tab.Screen
        name="Albums"
        component={AlbumsScreen}
        options={{
          title: 'アルバム',
          tabBarIcon: tabIcon('image'),
          tabBarButton: tabButton('tab-albums'),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: '設定',
          tabBarIcon: tabIcon('settings'),
          tabBarButton: tabButton('tab-settings'),
        }}
      />
    </Tab.Navigator>
  );
}
