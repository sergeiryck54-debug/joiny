import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

const TABS = ['All', 'Events', 'Posts'];

export default function NotificationsScreen() {
  const [activeTab, setActiveTab] = useState('All');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState('');

  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const fetchAll = async () => {
    try {
      const { data: evts } = await supabase.from('events').select('*').order('created_at', { ascending: false }).limit(15);
      const { data: psts } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(15);
      const eItems = (evts || []).map((e: any) => ({
        id: 'e' + e.id, type: 'event', emoji: e.emoji || '📍', bg: '#FFF6D6',
        text: `New event nearby — "${e.title}" · ${e.people}/${e.max_people} people`,
        time: timeAgo(e.created_at), created: e.created_at, eventId: e.id, creator: e.creator_id,
      }));
      const pItems = (psts || []).map((p: any) => ({
        id: 'p' + p.id, type: 'post', emoji: p.emoji || '💬', bg: p.bg_color || '#F2F2EE',
        text: `${p.user_name} posted: "${(p.caption || '').slice(0, 80)}${(p.caption || '').length > 80 ? '...' : ''}"`,
        time: timeAgo(p.created_at), created: p.created_at,
      }));
      const all = [...eItems, ...pItems].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
      setItems(all);
    } catch (e) {}
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
      await fetchAll();
      setLoading(false);
    })();
  }, []);

  const deleteEvent = (eventId: string) => {
    Alert.alert('Удалить событие?', 'Событие и его чат удалятся для всех. Это необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase.rpc('delete_event', { p_event_id: eventId });
            if (error) throw error;
            setItems(prev => prev.filter(i => i.eventId !== eventId));
          } catch (e) {
            Alert.alert('Не удалось удалить', 'Попробуй ещё раз.');
          }
        },
      },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const filtered = items.filter(i => {
    if (activeTab === 'All') return true;
    if (activeTab === 'Events') return i.type === 'event';
    if (activeTab === 'Posts') return i.type === 'post';
    return true;
  });

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#F5C400" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabOn]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabTxt, activeTab === tab && styles.tabTxtOn]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>Nothing yet</Text>
            <Text style={styles.emptySub}>Activity will appear here</Text>
          </View>
        )}
        {filtered.map(n => (
          <View key={n.id} style={styles.item}>
            <View style={[styles.avatar, { backgroundColor: n.bg }]}>
              <Text style={styles.avatarEmoji}>{n.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifText}>{n.text}</Text>
              {n.type === 'event' && (
                <TouchableOpacity style={styles.viewBtn} onPress={() => router.push('/explore')}>
                  <Text style={styles.viewBtnTxt}>View on map →</Text>
                </TouchableOpacity>
              )}
              {n.type === 'event' && n.creator && n.creator === userId && (
                <TouchableOpacity style={styles.viewBtn} onPress={() => deleteEvent(n.eventId)}>
                  <Text style={styles.delLinkTxt}>🗑 Удалить</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.time}>{n.time}</Text>
            </View>
          </View>
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: '#FAFAF7', alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  header: { padding: 18, paddingTop: 56 },
  title: { fontSize: 26, fontWeight: '800', color: '#111' },
  tabs: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#E5E5DF', paddingHorizontal: 18 },
  tab: { paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 2.5, borderBottomColor: 'transparent', marginBottom: -2 },
  tabOn: { borderBottomColor: '#F5C400' },
  tabTxt: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase' },
  tabTxtOn: { color: '#111' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5DF' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 22 },
  notifText: { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 6 },
  viewBtn: { alignSelf: 'flex-start', marginBottom: 6 },
  viewBtnTxt: { fontSize: 13, fontWeight: '700', color: '#C49B00' },
  delLinkTxt: { fontSize: 13, fontWeight: '700', color: '#C0392B' },
  time: { fontSize: 11, color: '#aaa' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 52 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  emptySub: { fontSize: 14, color: '#888' },
});