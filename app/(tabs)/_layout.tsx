import { Tabs, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function TabLayout() {
  // null = checking, false = no session (redirecting), true = allowed
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { setAuthed(false); router.replace('/'); }
      else setAuthed(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) { setAuthed(false); router.replace('/'); }
      else setAuthed(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Never render the tabs without a session.
  if (authed !== true) {
    return (
      <View style={{ flex: 1, backgroundColor: '#16263F', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2FB6A8" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2FB6A8',
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
      <Tabs.Screen name="explore" options={{ title: 'Map', tabBarIcon: () => <Text>🗺</Text> }} />
      <Tabs.Screen name="create" options={{ title: 'Create', tabBarIcon: () => <Text>✦</Text> }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed', tabBarIcon: () => <Text>📰</Text> }} />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarIcon: () => <Text>👤</Text> }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts', tabBarIcon: () => <Text>🔔</Text> }} />
    </Tabs>
  );
}
