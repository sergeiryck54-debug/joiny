import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { colors, font, radius, shadow } from '../lib/theme';
import { useUnread } from '../lib/unread';

export default function ChatsScreen() {
  const { t } = useI18n();
  const { counts, refresh } = useUnread();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setEvents([]); return; }
      const { data: parts } = await supabase.from('event_participants').select('event_id').eq('user_id', user.id);
      const ids = (parts || []).map((p: any) => p.event_id);
      if (!ids.length) { setEvents([]); return; }
      const { data: ev } = await supabase.from('events').select('id, title, emoji, photo_url, people, max_people, is_now').in('id', ids).order('created_at', { ascending: false });
      setEvents(ev || []);
    } catch (e) {}
  };

  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, []);

  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    load(); refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]));

  // Sort: unread first, then by people.
  const sorted = [...events].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));

  if (loading) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.brandBlue} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('chats.title')}</Text>
        <Text style={styles.sub}>{t('chats.sub')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 6, paddingBottom: 110 }}>
        {sorted.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTxt}>{t('chats.empty')}</Text>
          </View>
        )}
        {sorted.map(e => {
          const unread = counts[e.id] || 0;
          return (
            <TouchableOpacity key={e.id} style={styles.row} activeOpacity={0.7} onPress={() => router.push(`/chat/${e.id}` as any)}>
              <View style={styles.icon}>
                {e.photo_url ? <Image source={{ uri: e.photo_url }} style={styles.iconImg} contentFit="cover" /> : <Text style={styles.iconEmoji}>{e.emoji || '📍'}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, unread > 0 && styles.rowTitleUnread]} numberOfLines={1}>{e.title}</Text>
                <Text style={styles.rowMeta}>👥 {e.people}/{e.max_people} · {e.is_now ? t('common.now') : t('common.later')}</Text>
              </View>
              {unread > 0 && <View style={styles.badge}><Text style={styles.badgeTxt}>{unread > 99 ? '99+' : unread}</Text></View>}
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 18, paddingTop: 58, paddingBottom: 8 },
  title: { fontSize: 26, fontFamily: font.heading, color: colors.text },
  sub: { fontSize: 13, fontFamily: font.medium, color: colors.textMuted, marginTop: 1 },
  empty: { alignItems: 'center', paddingTop: 70, gap: 10 },
  emptyIcon: { fontSize: 50 },
  emptyTxt: { fontSize: 14, fontFamily: font.medium, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.card, padding: 12, marginHorizontal: 14, marginBottom: 10, ...shadow.card },
  icon: { width: 52, height: 52, borderRadius: radius.tile, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  iconImg: { width: 52, height: 52 },
  iconEmoji: { fontSize: 24 },
  rowTitle: { fontSize: 14, fontFamily: font.headingBold, color: colors.text },
  rowTitleUnread: { color: colors.brandBlue },
  rowMeta: { fontSize: 12, fontFamily: font.medium, color: colors.textMuted, marginTop: 2 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brandTeal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeTxt: { color: '#0E2A33', fontSize: 11, fontFamily: font.extrabold },
  chevron: { fontSize: 22, color: colors.textFaint },
});
