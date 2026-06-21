import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';

const byNewest = (a: any, b: any) => new Date(b.created).getTime() - new Date(a.created).getTime();

export default function FeedScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liked, setLiked] = useState<string[]>([]);
  const [likedEvents, setLikedEvents] = useState<string[]>([]);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const fetchFeed = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let friendSet = new Set<string>();
      if (user) {
        const { data: fr } = await supabase.from('friendships').select('user_id, friend_id, status')
          .eq('status', 'accepted').or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
        friendSet = new Set((fr || []).map((f: any) => f.user_id === user.id ? f.friend_id : f.user_id));
        const { data: elk } = await supabase.from('event_likes').select('event_id').eq('user_id', user.id);
        setLikedEvents((elk || []).map((l: any) => l.event_id));
      }
      const [{ data: events }, { data: posts }] = await Promise.all([
        supabase.from('events').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(40),
      ]);
      const evItems = (events || []).map((e: any) => ({
        kind: 'event', id: e.id, created: e.created_at, title: e.title, emoji: e.emoji, photo: e.photo_url,
        location: e.location, people: e.people, max: e.max_people, now: e.is_now, likes: e.likes, friend: friendSet.has(e.creator_id),
      }));
      const poItems = (posts || []).map((p: any) => ({
        kind: 'post', id: p.id, created: p.created_at, user_name: p.user_name, activity: p.activity,
        emoji: p.emoji, bg: p.bg_color, location: p.location, caption: p.caption, likes: p.likes,
      }));
      const friendEvents = evItems.filter(e => e.friend).sort(byNewest);
      const rest = [...evItems.filter(e => !e.friend), ...poItems].sort(byNewest);
      setItems([...friendEvents, ...rest]);
    } catch (e) {}
  };

  const fetchMyLikes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLiked([]); return; }
      const { data } = await supabase.from('post_likes').select('post_id').eq('user_id', user.id);
      if (data) setLiked(data.map((r: any) => r.post_id));
    } catch (e) {}
  };

  useEffect(() => {
    (async () => { await Promise.all([fetchFeed(), fetchMyLikes()]); setLoading(false); })();
  }, []);

  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    fetchFeed();
    fetchMyLikes();
  }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchFeed(), fetchMyLikes()]);
    setRefreshing(false);
  };

  const createPost = async () => {
    if (text.trim().length < 3) return;
    setPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = user ? await supabase.from('profiles').select('name').eq('id', user.id).single() : { data: null };
      await supabase.from('posts').insert({
        user_name: prof?.name || user?.email?.split('@')[0] || 'Anonymous',
        activity: '✍️ New post · just now', emoji: '💬', bg_color: '#D9F4EF', location: '', caption: text.trim(), likes: 0,
      });
      setText('');
      setWriting(false);
      await fetchFeed();
    } catch (e) {}
    setPosting(false);
  };

  const toggleLike = async (id: string) => {
    const wasLiked = liked.includes(id);
    setLiked(prev => wasLiked ? prev.filter(i => i !== id) : [...prev, id]);
    setItems(prev => prev.map(it => (it.kind === 'post' && it.id === id) ? { ...it, likes: Math.max(0, (it.likes || 0) + (wasLiked ? -1 : 1)) } : it));
    try {
      const { data, error } = await supabase.rpc('toggle_like', { p_post_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setItems(prev => prev.map(it => (it.kind === 'post' && it.id === id) ? { ...it, likes: row.likes } : it));
        setLiked(prev => {
          const has = prev.includes(id);
          if (row.liked && !has) return [...prev, id];
          if (!row.liked && has) return prev.filter(i => i !== id);
          return prev;
        });
      }
    } catch (e) {
      setLiked(prev => wasLiked ? [...prev, id] : prev.filter(i => i !== id));
      setItems(prev => prev.map(it => (it.kind === 'post' && it.id === id) ? { ...it, likes: Math.max(0, (it.likes || 0) + (wasLiked ? 1 : -1)) } : it));
    }
  };

  const toggleEventLike = async (id: string) => {
    const was = likedEvents.includes(id);
    setLikedEvents(prev => was ? prev.filter(i => i !== id) : [...prev, id]);
    setItems(prev => prev.map(it => (it.kind === 'event' && it.id === id) ? { ...it, likes: Math.max(0, (it.likes || 0) + (was ? -1 : 1)) } : it));
    try {
      const { data, error } = await supabase.rpc('toggle_event_like', { p_event_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setItems(prev => prev.map(it => (it.kind === 'event' && it.id === id) ? { ...it, likes: row.likes } : it));
        setLikedEvents(prev => {
          const has = prev.includes(id);
          if (row.liked && !has) return [...prev, id];
          if (!row.liked && has) return prev.filter(i => i !== id);
          return prev;
        });
      }
    } catch (e) {
      setLikedEvents(prev => was ? [...prev, id] : prev.filter(i => i !== id));
      setItems(prev => prev.map(it => (it.kind === 'event' && it.id === id) ? { ...it, likes: Math.max(0, (it.likes || 0) + (was ? 1 : -1)) } : it));
    }
  };

  if (loading) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#2FB6A8" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('feed.title')}</Text>
          <Text style={styles.headerSub}>{t('feed.sub')}</Text>
        </View>
        <TouchableOpacity style={styles.writeBtn} onPress={() => setWriting(w => !w)}>
          <Text style={styles.writeBtnTxt}>{writing ? '✕' : '✍️'}</Text>
        </TouchableOpacity>
      </View>

      {writing && (
        <View style={styles.composer}>
          <TextInput style={styles.composerInput} placeholder={t('feed.composerPh')} placeholderTextColor="#aaa" value={text} onChangeText={setText} multiline />
          <TouchableOpacity style={[styles.postBtn, (text.trim().length < 3 || posting) && styles.postBtnOff]} disabled={text.trim().length < 3 || posting} onPress={createPost}>
            {posting ? <ActivityIndicator color="#16263F" /> : <Text style={styles.postBtnTxt}>{t('feed.post')}</Text>}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {items.length === 0 && <Text style={styles.empty}>{t('feed.empty')}</Text>}
        {items.map(item => item.kind === 'event' ? (
          <TouchableOpacity key={'e' + item.id} style={styles.post} activeOpacity={0.7} onPress={() => router.push(`/event/${item.id}` as any)}>
            <View style={styles.postHead}>
              <View style={[styles.postAv, { backgroundColor: '#D9F4EF', overflow: 'hidden' }]}>
                {item.photo ? <Image source={{ uri: item.photo }} style={styles.postAvImg} contentFit="cover" /> : <Text style={styles.postAvEmoji}>{item.emoji}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.postUser}>{item.title}</Text>
                <Text style={styles.postActivity}>{t('feed.eventTag')} · 👥 {item.people}/{item.max} · {item.now ? t('common.now') : t('common.later')}</Text>
              </View>
              {item.friend && <View style={styles.friendBadge}><Text style={styles.friendBadgeTxt}>{t('feed.friend')}</Text></View>}
            </View>
            {item.location ? <Text style={styles.postLoc}>📍 {item.location}</Text> : null}
            <View style={styles.postActions}>
              <TouchableOpacity onPress={() => toggleEventLike(item.id)}>
                <Text style={styles.actionTxt}>{likedEvents.includes(item.id) ? '❤️' : '🤍'} {item.likes || 0}</Text>
              </TouchableOpacity>
              <Text style={styles.openHint}>{t('feed.open')}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View key={'p' + item.id} style={styles.post}>
            <View style={styles.postHead}>
              <View style={[styles.postAv, { backgroundColor: item.bg || '#F2F2EE' }]}>
                <Text style={styles.postAvEmoji}>{item.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.postUser}>{item.user_name}</Text>
                <Text style={styles.postActivity}>{item.activity}</Text>
              </View>
            </View>
            {item.location ? <Text style={styles.postLoc}>{item.location}</Text> : null}
            <Text style={styles.postCaption}>{item.caption}</Text>
            <View style={styles.postActions}>
              <TouchableOpacity onPress={() => toggleLike(item.id)}>
                <Text style={styles.actionTxt}>{liked.includes(item.id) ? '❤️' : '🤍'} {item.likes || 0}</Text>
              </TouchableOpacity>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingTop: 56 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#16263F' },
  headerSub: { fontSize: 13, color: '#888', marginTop: 2 },
  writeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#16263F', alignItems: 'center', justifyContent: 'center' },
  writeBtnTxt: { fontSize: 16, color: '#2FB6A8' },
  composer: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E5DF', padding: 12 },
  composerInput: { minHeight: 60, fontSize: 14, color: '#16263F', textAlignVertical: 'top' },
  postBtn: { alignSelf: 'flex-end', backgroundColor: '#2FB6A8', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, marginTop: 8 },
  postBtnOff: { opacity: 0.4 },
  postBtnTxt: { fontSize: 13, fontWeight: '700', color: '#16263F' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  post: { backgroundColor: '#fff', marginBottom: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E5E5DF', padding: 12 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  postAv: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  postAvImg: { width: 40, height: 40 },
  postAvEmoji: { fontSize: 20 },
  postUser: { fontSize: 14, fontWeight: '700', color: '#16263F' },
  postActivity: { fontSize: 11, color: '#888', marginTop: 1 },
  friendBadge: { backgroundColor: '#2FB6A8', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  friendBadgeTxt: { fontSize: 11, fontWeight: '800', color: '#16263F' },
  postLoc: { fontSize: 12, color: '#888', marginBottom: 6 },
  postCaption: { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 8 },
  openHint: { fontSize: 13, fontWeight: '700', color: '#1E8C80' },
  postActions: { flexDirection: 'row', gap: 16 },
  actionTxt: { fontSize: 14, fontWeight: '600', color: '#555' },
});
