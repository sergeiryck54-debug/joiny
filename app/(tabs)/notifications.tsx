import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { useUnread } from '../lib/unread';

const TABS = ['All', 'Events', 'Posts'];
const TAB_KEY: Record<string, string> = { All: 'notif.all', Events: 'notif.events', Posts: 'notif.posts' };

export default function NotificationsScreen() {
  const { t } = useI18n();
  const { items: unreadChats, refresh: refreshUnread } = useUnread();
  const [activeTab, setActiveTab] = useState('All');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState('');

  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return t('time.now');
    if (mins < 60) return t('time.min', { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('time.hour', { n: hrs });
    return t('time.day', { n: Math.floor(hrs / 24) });
  };

  const fetchAll = async () => {
    try {
      const { data: evts } = await supabase.from('events').select('*').order('created_at', { ascending: false }).limit(15);
      const { data: psts } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(15);
      const eItems = (evts || []).map((e: any) => ({
        id: 'e' + e.id, type: 'event', emoji: e.emoji || '📍', bg: '#D9F4EF',
        text: t('notif.newEvent', { title: e.title, people: e.people, max: e.max_people }),
        time: timeAgo(e.created_at), created: e.created_at, eventId: e.id, creator: e.creator_id,
      }));
      const pItems = (psts || []).map((p: any) => ({
        id: 'p' + p.id, type: 'post', emoji: p.emoji || '💬', bg: p.bg_color || '#F2F2EE',
        text: t('notif.posted', { user: p.user_name, text: `${(p.caption || '').slice(0, 80)}${(p.caption || '').length > 80 ? '...' : ''}` }),
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

  // Refresh when returning to this tab.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    refreshUnread();
    if (firstFocus.current) { firstFocus.current = false; return; }
    fetchAll();
  }, [refreshUnread]));

  const deleteEvent = (eventId: string) => {
    Alert.alert(t('map.delQ'), t('map.delMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase.rpc('delete_event', { p_event_id: eventId });
            if (error) throw error;
            setItems(prev => prev.filter(i => i.eventId !== eventId));
          } catch (e) {
            Alert.alert(t('map.delFail'), t('common.tryAgain'));
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
        <ActivityIndicator size="large" color="#2FB6A8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('notif.title')}</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabOn]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabTxt, activeTab === tab && styles.tabTxtOn]}>{t(TAB_KEY[tab])}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {unreadChats.length > 0 && (
          <View style={styles.unreadSection}>
            <Text style={styles.unreadHeader}>💬 {t('notif.unreadTitle')}</Text>
            {unreadChats.map(c => (
              <TouchableOpacity key={c.event_id} style={styles.unreadItem} onPress={() => router.push(`/chat/${c.event_id}` as any)} activeOpacity={0.7}>
                <View style={styles.unreadEmojiWrap}>
                  <Text style={styles.avatarEmoji}>{c.emoji || '📍'}</Text>
                  <View style={styles.unreadCountDot}><Text style={styles.unreadCountTxt}>{c.unread > 99 ? '99+' : c.unread}</Text></View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifText} numberOfLines={1}>{c.title}</Text>
                  <Text style={styles.unreadMeta}>{t('notif.unreadCount', { n: c.unread })} · {t('notif.openChat')}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {filtered.length === 0 && unreadChats.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>{t('notif.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('notif.emptySub')}</Text>
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
                <TouchableOpacity style={styles.viewBtn} onPress={() => router.push(`/event/${n.eventId}` as any)}>
                  <Text style={styles.viewBtnTxt}>{t('notif.open')}</Text>
                </TouchableOpacity>
              )}
              {n.type === 'event' && n.creator && n.creator === userId && (
                <TouchableOpacity style={styles.viewBtn} onPress={() => deleteEvent(n.eventId)}>
                  <Text style={styles.delLinkTxt}>{t('notif.del')}</Text>
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
  title: { fontSize: 26, fontWeight: '800', color: '#16263F' },
  tabs: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#E5E5DF', paddingHorizontal: 18 },
  tab: { paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 2.5, borderBottomColor: 'transparent', marginBottom: -2 },
  tabOn: { borderBottomColor: '#2FB6A8' },
  tabTxt: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase' },
  tabTxtOn: { color: '#16263F' },
  unreadSection: { paddingTop: 6, paddingBottom: 8, borderBottomWidth: 8, borderBottomColor: '#F2F2EE' },
  unreadHeader: { fontSize: 12, fontWeight: '800', color: '#1E8C80', textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  unreadItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  unreadEmojiWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#D9F4EF', alignItems: 'center', justifyContent: 'center' },
  unreadCountDot: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#2FB6A8', borderWidth: 2, borderColor: '#FAFAF7', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  unreadCountTxt: { color: '#16263F', fontSize: 10, fontWeight: '800' },
  unreadMeta: { fontSize: 12, color: '#1E8C80', fontWeight: '700', marginTop: 2 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5DF' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 22 },
  notifText: { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 6 },
  viewBtn: { alignSelf: 'flex-start', marginBottom: 6 },
  viewBtnTxt: { fontSize: 13, fontWeight: '700', color: '#1E8C80' },
  delLinkTxt: { fontSize: 13, fontWeight: '700', color: '#C0392B' },
  time: { fontSize: 11, color: '#aaa' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 52 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#16263F' },
  emptySub: { fontSize: 14, color: '#888' },
});