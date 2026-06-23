import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { colors, font, gradients, radius, shadow } from '../lib/theme';

type Relation = 'none' | 'outgoing' | 'incoming' | 'friends';

export default function UserProfileScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [prof, setProf] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState('');
  const [relation, setRelation] = useState<Relation>('none');
  const [friendBusy, setFriendBusy] = useState(false);

  const relationFrom = (rows: any[], uid: string): Relation => {
    let rel: Relation = 'none';
    for (const r of rows || []) {
      if (r.status === 'accepted') return 'friends';
      rel = r.user_id === uid ? 'outgoing' : 'incoming';
    }
    return rel;
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setMyId(user.id);
          const { data: rows } = await supabase.from('friendships').select('user_id, friend_id, status')
            .or(`and(user_id.eq.${user.id},friend_id.eq.${id}),and(user_id.eq.${id},friend_id.eq.${user.id})`);
          setRelation(relationFrom(rows || [], user.id));
        }
        const { data: p } = await supabase.from('profiles').select('*').eq('id', id).single();
        setProf(p);
        const { data: evts } = await supabase.from('events').select('*').eq('creator_id', id).order('created_at', { ascending: false });
        if (evts) setEvents(evts);
      } catch (e) {}
      setLoading(false);
    })();
  }, [id]);

  const onFriendBtn = async () => {
    if (friendBusy) return;
    let uid = myId;
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser();
      uid = user?.id || '';
      if (uid) setMyId(uid);
    }
    if (!uid || uid === id) return;
    setFriendBusy(true);
    try {
      if (relation === 'none') {
        const { error } = await supabase.from('friendships').upsert({ user_id: uid, friend_id: id, status: 'pending' });
        if (error) throw error;
        setRelation('outgoing');
      } else if (relation === 'outgoing') {
        const { error } = await supabase.from('friendships').delete().eq('user_id', uid).eq('friend_id', id);
        if (error) throw error;
        setRelation('none');
      } else if (relation === 'incoming') {
        const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('user_id', id).eq('friend_id', uid);
        if (error) throw error;
        setRelation('friends');
      } else if (relation === 'friends') {
        const { error } = await supabase.from('friendships').delete()
          .or(`and(user_id.eq.${uid},friend_id.eq.${id}),and(user_id.eq.${id},friend_id.eq.${uid})`);
        if (error) throw error;
        setRelation('none');
      }
    } catch (e: any) {
      Alert.alert(t('common.failed'), e?.message || t('common.tryAgain'));
    } finally {
      setFriendBusy(false);
    }
  };

  if (loading) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.brandBlue} /></View>;
  }

  const interests: string[] = prof?.interests || [];
  const btn = {
    none: { txt: t('user.addFriend'), action: true },
    incoming: { txt: t('user.accept'), action: true },
    outgoing: { txt: t('user.requested'), action: false },
    friends: { txt: t('user.friends'), action: false },
  }[relation];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <View style={styles.avatar}>
          {prof?.avatar_url ? <Image source={{ uri: prof.avatar_url }} style={styles.avatarImg} contentFit="cover" /> : <Text style={styles.avatarEmoji}>🧑</Text>}
        </View>
        <Text style={styles.name}>{prof?.name || t('common.anon')}</Text>
        {prof?.bio ? <Text style={styles.bio}>{prof.bio}</Text> : null}
        {prof?.city ? <Text style={styles.location}>📍 {prof.city}</Text> : null}
        {!!myId && myId !== id && (
          <TouchableOpacity style={[styles.friendBtn, !btn.action && styles.friendBtnOff]} onPress={onFriendBtn} disabled={friendBusy}>
            <Text style={[styles.friendTxt, !btn.action && styles.friendTxtOff]}>{btn.txt}</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statN}>{events.length}</Text><Text style={styles.statL}>Events</Text></View>
        <View style={[styles.stat, styles.statBorder]}><Text style={styles.statN}>{interests.length}</Text><Text style={styles.statL}>Interests</Text></View>
      </View>

      {interests.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('user.interests')}</Text>
          <View style={styles.tagsWrap}>
            {interests.map(tag => (
              <View key={tag} style={styles.tag}><Text style={styles.tagTxt}>{tag}</Text></View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('user.events')}</Text>
        {events.length === 0 && <Text style={styles.empty}>{t('user.noEvents')}</Text>}
        {events.map(e => (
          <TouchableOpacity key={e.id} style={styles.eventCard} onPress={() => router.push(`/event/${e.id}` as any)}>
            <Text style={styles.eventEmoji}>{e.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>{e.title}</Text>
              <Text style={styles.eventMeta}>👥 {e.people}/{e.max_people} · ❤️ {e.likes || 0} · {e.is_now ? t('common.now') : t('common.later')}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { padding: 28, paddingTop: 56, alignItems: 'center' },
  backBtn: { position: 'absolute', top: 48, left: 14, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#fff', fontSize: 32, lineHeight: 32, marginTop: -3 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 14, overflow: 'hidden' },
  avatarImg: { width: 88, height: 88 },
  avatarEmoji: { fontSize: 40 },
  name: { fontSize: 22, fontFamily: font.heading, color: '#fff', marginBottom: 4 },
  bio: { fontSize: 13, fontFamily: font.medium, color: 'rgba(255,255,255,0.7)', marginBottom: 4, textAlign: 'center' },
  location: { fontSize: 12, fontFamily: font.medium, color: 'rgba(255,255,255,0.6)' },
  friendBtn: { marginTop: 14, paddingHorizontal: 22, paddingVertical: 10, borderRadius: radius.tile, backgroundColor: '#fff' },
  friendBtnOff: { backgroundColor: 'rgba(255,255,255,0.18)' },
  friendTxt: { fontSize: 14, fontFamily: font.bold, color: colors.brandBlue },
  friendTxtOff: { color: '#fff' },
  stats: { flexDirection: 'row', backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 16, borderRadius: radius.card, overflow: 'hidden', ...shadow.card },
  stat: { flex: 1, padding: 14, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1, borderLeftColor: colors.hairline },
  statN: { fontSize: 18, fontFamily: font.heading, color: colors.text, marginBottom: 2 },
  statL: { fontSize: 10, color: colors.textMuted, fontFamily: font.bold, textTransform: 'uppercase' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 17, fontFamily: font.heading, color: colors.text, marginBottom: 12 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.chip, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.hairline },
  tagTxt: { fontSize: 12, fontFamily: font.semibold, color: colors.text },
  empty: { fontSize: 13, fontFamily: font.medium, color: colors.textMuted },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.card, padding: 12, marginBottom: 9, ...shadow.card },
  eventEmoji: { fontSize: 24 },
  eventTitle: { fontSize: 14, fontFamily: font.headingBold, color: colors.text },
  eventMeta: { fontSize: 12, fontFamily: font.medium, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textFaint },
});
