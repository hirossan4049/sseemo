import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import FoldersScreen from '@/screens/FoldersScreen';
import AlbumsScreen from '@/screens/AlbumsScreen';
import SettingsScreen from '@/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const tabIcon = (emoji: string) => () => <Text style={{ fontSize: 20 }}>{emoji}</Text>;

export default function RootTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name="Folders"
        component={FoldersScreen}
        options={{ title: 'フォルダ', tabBarIcon: tabIcon('📁') }}
      />
      <Tab.Screen
        name="Albums"
        component={AlbumsScreen}
        options={{ title: 'アルバム', tabBarIcon: tabIcon('🖼') }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: '設定', tabBarIcon: tabIcon('⚙️') }}
      />
    </Tab.Navigator>
  );
}
