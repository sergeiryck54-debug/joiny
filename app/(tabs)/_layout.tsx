import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { colors, font, gradients, shadow } from '../lib/theme';
import { useUnread } from '../lib/unread';

// Floating glass tab bar with a centre FAB (create), per the design handoff.
function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useI18n();
  const { total } = useUnread();
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;

  const go = (name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (!route) return;
    const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!e.defaultPrevented) navigation.navigate(name as never);
  };

  const Tab = ({ name, icon, label, badge }: { name: string; icon: string; label: string; badge?: boolean }) => {
    const active = current === name;
    return (
      <TouchableOpacity style={styles.tab} activeOpacity={0.7} onPress={() => go(name)}>
        <View>
          <Text style={[styles.icon, !active && styles.iconOff]}>{icon}</Text>
          {badge ? <View style={styles.dot} /> : null}
        </View>
        <Text style={[styles.label, active ? styles.labelOn : styles.labelOff]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.barWrap, { paddingBottom: insets.bottom ? insets.bottom - 4 : 0 }]} pointerEvents="box-none">
      <BlurView intensity={40} tint="light" style={styles.bar}>
        <Tab name="explore" icon="🗺" label={t('tab.map')} />
        <Tab name="feed" icon="📰" label={t('tab.feed')} />
        <View style={styles.fabSlot} />
        <Tab name="chats" icon="💬" label={t('tab.chats')} badge={total > 0} />
        <Tab name="profile" icon="👤" label={t('tab.me')} />
      </BlurView>
      <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={() => router.push('/create' as never)}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
          <Text style={styles.fabPlus}>＋</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

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

  if (authed !== true) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  return (
    <Tabs tabBar={(props) => <GlassTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="notifications" />
    </Tabs>
  );
}

const BAR_H = 64;
const styles = StyleSheet.create({
  barWrap: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', height: BAR_H, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.72)', ...shadow.float },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 2 },
  icon: { fontSize: 20 },
  iconOff: { opacity: 0.45 },
  label: { fontSize: 10, fontFamily: font.bold },
  labelOn: { color: colors.brandBlue },
  labelOff: { color: colors.textFaint },
  dot: { position: 'absolute', top: -2, right: -6, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brandTeal, borderWidth: 1.5, borderColor: '#fff' },
  fabSlot: { width: 64 },
  fab: { position: 'absolute', left: 0, right: 0, top: -22, alignItems: 'center' },
  fabInner: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadow.cta },
  fabPlus: { color: '#fff', fontSize: 30, marginTop: -2 },
});
