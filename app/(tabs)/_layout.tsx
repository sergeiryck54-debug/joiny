import { Tabs, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function TabLayout() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace('/');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!checked) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111110', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#F5C400" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#F5C400',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#E5E5DF',
          height: 60,
          paddingBottom: 8,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ title: 'Map', tabBarIcon: () => <Text>🗺</Text> }} />
      <Tabs.Screen name="create" options={{ title: 'Create', tabBarIcon: () => <Text>✦</Text> }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed', tabBarIcon: () => <Text>📰</Text> }} />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarIcon: () => <Text>👤</Text> }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts', tabBarIcon: () => <Text>🔔</Text> }} />
    </Tabs>
  );
}