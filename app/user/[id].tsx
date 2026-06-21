import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

type Relation = 'none' | 'outgoing' | 'incoming' | 'friends';

export default function UserProfileScreen() {
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
      Alert.alert('Не удалось', e?.message || 'Попробуй ещё раз.');
    } finally {
      setFriendBusy(false);
    }
  };

  if (loading) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#2FB6A8" /></View>;
  }

  const interests: string[] = prof?.interests || [];
  const btn = {
    none: { txt: '+ Добавить в друзья', action: true },
    incoming: { txt: '✓ Принять заявку', action: true },
    outgoing: { txt: '⏳ Заявка отправлена', action: false },
    friends: { txt: '✓ В друзьях', action: false },
  }[relation];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <View style={styles.avatar}>
          {prof?.avatar_url ? <Image source={{ uri: prof.avatar_url }} style={styles.avatarImg} contentFit="cover" /> : <Text style={styles.avatarEmoji}>🧑</Text>}
        </View>
        <Text style={styles.name}>{prof?.name || 'Аноним'}</Text>
        {prof?.bio ? <Text style={styles.bio}>{prof.bio}</Text> : null}
        {prof?.city ? <Text style={styles.location}>📍 {prof.city}</Text> : null}
        {!!myId && myId !== id && (
          <TouchableOpacity style={[styles.friendBtn, !btn.action && styles.friendBtnOff]} onPress={onFriendBtn} disabled={friendBusy}>
            <Text style={[styles.friendTxt, !btn.action && styles.friendTxtOff]}>{btn.txt}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statN}>{events.length}</Text><Text style={styles.statL}>Events</Text></View>
        <View style={[styles.stat, styles.statBorder]}><Text style={styles.statN}>{interests.length}</Text><Text style={styles.statL}>Interests</Text></View>
      </View>

      {interests.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Интересы</Text>
          <View style={styles.tagsWrap}>
            {interests.map(tag => (
              <View key={tag} style={styles.tag}><Text style={styles.tagTxt}>{tag}</Text></View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>События</Text>
        {events.length === 0 && <Text style={styles.empty}>Пока нет событий</Text>}
        {events.map(e => (
          <TouchableOpacity key={e.id} style={styles.eventCard} onPress={() => router.push(`/event/${e.id}` as any)}>
            <Text style={styles.eventEmoji}>{e.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>{e.title}</Text>
              <Text style={styles.eventMeta}>👥 {e.people}/{e.max_people} · ❤️ {e.likes || 0} · {e.is_now ? '🟢 Now' : '🕐 Later'}</Text>
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
  loadingWrap: { flex: 1, backgroundColor: '#FAFAF7', alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  hero: { backgroundColor: '#16263F', padding: 28, paddingTop: 56, alignItems: 'center' },
  backBtn: { position: 'absolute', top: 48, left: 14, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#fff', fontSize: 32, lineHeight: 32, marginTop: -3 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#2FB6A8', alignItems: 'center', justifyContent: 'center', marginBottom: 14, overflow: 'hidden' },
  avatarImg: { width: 88, height: 88 },
  avatarEmoji: { fontSize: 40 },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  bio: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 4, textAlign: 'center' },
  location: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  friendBtn: { marginTop: 14, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12, backgroundColor: '#2FB6A8' },
  friendBtnOff: { backgroundColor: 'rgba(255,255,255,0.12)' },
  friendTxt: { fontSize: 14, fontWeight: '700', color: '#16263F' },
  friendTxtOff: { color: '#fff' },
  stats: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E5E5DF', overflow: 'hidden' },
  stat: { flex: 1, padding: 14, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1, borderLeftColor: '#E5E5DF' },
  statN: { fontSize: 18, fontWeight: '800', color: '#16263F', marginBottom: 2 },
  statL: { fontSize: 10, color: '#888', fontWeight: '600', textTransform: 'uppercase' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#16263F', marginBottom: 12 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E5DF' },
  tagTxt: { fontSize: 12, fontWeight: '600', color: '#16263F' },
  empty: { fontSize: 13, color: '#888' },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E5DF' },
  eventEmoji: { fontSize: 24 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: '#16263F' },
  eventMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  chevron: { fontSize: 22, color: '#ccc' },
});
