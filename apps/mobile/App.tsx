import React, { useEffect } from 'react';
import { StatusBar, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { DashboardScreen } from './src/screens/DashboardScreen';
import { ServicesScreen } from './src/screens/ServicesScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import {
  registerForPushNotifications,
  setupNotificationListeners,
} from './src/lib/notifications';
import { useAppStore } from './src/lib/store';
import type { RootTabParamList } from './src/navigation/types';

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, { focused: string; unfocused: string }> = {
  Dashboard: { focused: '[D]', unfocused: '[D]' },
  Services: { focused: '[S]', unfocused: '[S]' },
  Map: { focused: '[M]', unfocused: '[M]' },
  Settings: { focused: '[G]', unfocused: '[G]' },
};

export default function App(): React.JSX.Element {
  const setPushToken = useAppStore((s) => s.setPushToken);

  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications().then((token) => {
      if (token) {
        setPushToken(token);
      }
    });

    // Set up notification listeners
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, [setPushToken]);

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F9FAFB"
        translucent={Platform.OS === 'android'}
      />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: '#3B82F6',
            tabBarInactiveTintColor: '#9CA3AF',
            tabBarStyle: {
              backgroundColor: '#FFFFFF',
              borderTopColor: '#F3F4F6',
              paddingBottom: Platform.OS === 'ios' ? 20 : 8,
              paddingTop: 8,
              height: Platform.OS === 'ios' ? 88 : 64,
            },
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '600',
            },
            tabBarLabel: route.name,
            tabBarIcon: ({ focused, color }) => {
              const icon = TAB_ICONS[route.name];
              return (
                <TabIcon
                  label={focused ? icon.focused : icon.unfocused}
                  color={color}
                />
              );
            },
          })}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen
            name="Services"
            component={ServicesScreen}
            options={{ headerShown: false }}
          />
          <Tab.Screen name="Map" component={MapScreen} />
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

import { View, Text, StyleSheet } from 'react-native';

function TabIcon({
  label,
  color,
}: {
  label: string;
  color: string;
}): React.JSX.Element {
  return (
    <View style={tabStyles.iconContainer}>
      <Text style={[tabStyles.iconText, { color }]}>{label}</Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
