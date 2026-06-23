import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { colors, font, gradients, radius, shadow } from '../lib/theme';

const byNewest =(a: any, b: any) => new Date(b.created).getTime() - new Date(a.created).getTime();

export default function FeedScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
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
    // Active stories (defensive: never break the feed if the table isn't migrated yet).
    try {
      const { data: st } = await supabase.from('stories').select('*').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false });
      setStories(st || []);
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
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.brandBlue} /></View>;
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
          <TextInput style={styles.composerInput} placeholder={t('feed.composerPh')} placeholderTextColor={colors.textFaint} value={text} onChangeText={setText} multiline />
          <TouchableOpacity style={[styles.postBtn, (text.trim().length < 3 || posting) && styles.postBtnOff]} disabled={text.trim().length < 3 || posting} onPress={createPost}>
            {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.postBtnTxt}>{t('feed.post')}</Text>}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesRow}>
          <TouchableOpacity style={styles.storyItem} activeOpacity={0.8} onPress={() => router.push('/create-story' as any)}>
            <View style={styles.storyAdd}><Text style={styles.storyAddPlus}>＋</Text></View>
            <Text style={styles.storyName}>{t('story.you')}</Text>
          </TouchableOpacity>
          {stories.map(s => (
            <TouchableOpacity key={s.id} style={styles.storyItem} activeOpacity={0.8} onPress={() => router.push(`/story/${s.id}` as any)}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.storyRing}>
                <View style={styles.storyInner}>
                  {s.avatar_url ? <Image source={{ uri: s.avatar_url }} style={styles.storyAvImg} contentFit="cover" /> : <Text style={styles.storyEmoji}>{s.emoji || '✨'}</Text>}
                </View>
              </LinearGradient>
              <Text style={styles.storyName} numberOfLines={1}>{s.user_name || '…'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

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
  loadingWrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 58, paddingBottom: 8 },
  headerTitle: { fontSize: 26, fontFamily: font.heading, color: colors.text },
  headerSub: { fontSize: 13, fontFamily: font.medium, color: colors.textMuted, marginTop: 1 },
  writeBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandBlue, alignItems: 'center', justifyContent: 'center', ...shadow.cta },
  writeBtnTxt: { fontSize: 17, color: '#fff' },
  composer: { marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.surface, borderRadius: radius.card, padding: 14, ...shadow.card },
  composerInput: { minHeight: 60, fontSize: 14, fontFamily: font.medium, color: colors.text, textAlignVertical: 'top' },
  postBtn: { alignSelf: 'flex-end', backgroundColor: colors.brandBlue, paddingHorizontal: 20, paddingVertical: 9, borderRadius: radius.cta, marginTop: 8 },
  postBtnOff: { opacity: 0.4 },
  postBtnTxt: { fontSize: 13, fontFamily: font.extrabold, color: '#fff' },
  empty: { textAlign: 'center', fontFamily: font.medium, color: colors.textMuted, marginTop: 40 },
  storiesRow: { gap: 14, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  storyItem: { alignItems: 'center', gap: 6, width: 64 },
  storyAdd: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandTeal, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', ...shadow.card },
  storyAddPlus: { fontSize: 26, color: colors.brandBlue, marginTop: -2 },
  storyRing: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  storyInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  storyAvImg: { width: 54, height: 54 },
  storyEmoji: { fontSize: 26 },
  storyName: { fontSize: 11, fontFamily: font.semibold, color: colors.textSub, maxWidth: 64, textAlign: 'center' },
  post: { backgroundColor: colors.surface, marginHorizontal: 14, marginBottom: 12, borderRadius: radius.card, padding: 14, ...shadow.card },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 8 },
  postAv: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  postAvImg: { width: 44, height: 44 },
  postAvEmoji: { fontSize: 21 },
  postUser: { fontSize: 15, fontFamily: font.headingBold, color: colors.text },
  postActivity: { fontSize: 12, fontFamily: font.medium, color: colors.textMuted, marginTop: 1 },
  friendBadge: { backgroundColor: colors.chipBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.chip },
  friendBadgeTxt: { fontSize: 11, fontFamily: font.bold, color: colors.chipText },
  postLoc: { fontSize: 12, fontFamily: font.medium, color: colors.textMuted, marginBottom: 6 },
  postCaption: { fontSize: 14, fontFamily: font.regular, color: colors.textSub, lineHeight: 20, marginBottom: 8 },
  openHint: { fontSize: 13, fontFamily: font.bold, color: colors.brandBlue },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 2 },
  actionTxt: { fontSize: 14, fontFamily: font.semibold, color: colors.textSub },
});
