import { decode } from 'base64-arraybuffer';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

const ALL_INTERESTS = ['⚽ Sport', '🎸 Music', '🏃 Running', '📸 Photo', '🐕 Dog Walks', '🎲 Board Games', '🍕 Food', '📚 Books', '🧘 Yoga', '🎨 Art'];

export default function ProfileScreen() {
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [myEvents, setMyEvents] = useState<any[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [tab, setTab] = useState<'events' | 'joined' | 'friends'>('events');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const loadLists = async (uid: string) => {
    try {
      const [{ data: mine }, { data: parts }, { data: fr }] = await Promise.all([
        supabase.from('events').select('*').eq('creator_id', uid).order('created_at', { ascending: false }),
        supabase.from('event_participants').select('event_id').eq('user_id', uid),
        supabase.from('friendships').select('friend_id').eq('user_id', uid),
      ]);
      setMyEvents(mine || []);
      const ids = (parts || []).map((p: any) => p.event_id);
      if (ids.length) {
        const { data: jev } = await supabase.from('events').select('*').in('id', ids).order('created_at', { ascending: false });
        setJoinedEvents(jev || []);
      } else setJoinedEvents([]);
      const fids = (fr || []).map((f: any) => f.friend_id);
      if (fids.length) {
        const { data: fp } = await supabase.from('profiles').select('id, name, avatar_url, city').in('id', fids);
        setFriends(fp || []);
      } else setFriends([]);
    } catch (e) {}
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          setEmail(user.email || '');
          const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
          if (prof) {
            setName(prof.name || '');
            setBio(prof.bio || '');
            setCity(prof.city || '');
            setInterests(prof.interests || []);
            setAvatarUrl(prof.avatar_url || '');
          }
          await loadLists(user.id);
        }
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  // Refresh lists when returning to this tab.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await loadLists(user.id);
    })();
  }, []));

  const saveProfile = async () => {
    setSaving(true);
    try {
      await supabase.from('profiles').upsert({ id: userId, name, bio, city, interests });
      setEditing(false);
    } catch (e) {}
    setSaving(false);
  };

  const toggleInterest = (tag: string) => {
    setInterests(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const pickAvatar = async () => {
    if (!userId || uploadingAvatar) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (result.canceled || !result.assets?.length || !result.assets[0].base64) return;
      setUploadingAvatar(true);
      const path = `${userId}/avatar.jpg`;
      const { error: upErr } = await supabase.storage.from('avatars')
        .upload(path, decode(result.assets[0].base64!), { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').upsert({ id: userId, avatar_url: url });
      setAvatarUrl(url);
    } catch (e) {
      Alert.alert('Не удалось загрузить', 'Попробуй ещё раз.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const deleteEvent = (id: string) => {
    Alert.alert('Удалить событие?', 'Событие и его чат удалятся для всех. Это необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase.rpc('delete_event', { p_event_id: id });
            if (error) throw error;
            setMyEvents(prev => prev.filter(e => e.id !== id));
            setJoinedEvents(prev => prev.filter(e => e.id !== id));
          } catch (e) {
            Alert.alert('Не удалось удалить', 'Попробуй ещё раз.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#F5C400" /></View>;
  }

  const renderEvent = (e: any, withDelete: boolean) => (
    <View key={e.id} style={styles.eventCard}>
      <TouchableOpacity style={styles.eventMain} onPress={() => router.push(`/event/${e.id}` as any)} activeOpacity={0.7}>
        <Text style={styles.eventEmoji}>{e.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.eventTitle}>{e.title}</Text>
          {e.location ? <Text style={styles.eventMeta} numberOfLines={1}>📍 {e.location}</Text> : null}
          <Text style={styles.eventMeta}>👥 {e.people}/{e.max_people} · {e.is_now ? '🟢 Now' : '🕐 Later'}</Text>
        </View>
      </TouchableOpacity>
      {withDelete
        ? <TouchableOpacity style={styles.eventDelBtn} onPress={() => deleteEvent(e.id)}><Text style={styles.eventDelTxt}>🗑</Text></TouchableOpacity>
        : <Text style={styles.chevron}>›</Text>}
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <TouchableOpacity style={styles.avatar} onPress={pickAvatar} activeOpacity={0.8}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" transition={150} />
          ) : (
            <Text style={styles.avatarEmoji}>🧑</Text>
          )}
          {uploadingAvatar ? (
            <View style={styles.avatarOverlay}><ActivityIndicator color="#111" /></View>
          ) : (
            <View style={styles.avatarBadge}><Text style={styles.avatarBadgeTxt}>📷</Text></View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={pickAvatar} disabled={uploadingAvatar} style={styles.changePhotoBtn}>
          <Text style={styles.changePhotoTxt}>{uploadingAvatar ? 'Загрузка…' : avatarUrl ? 'Сменить фото' : 'Добавить фото'}</Text>
        </TouchableOpacity>
        {editing ? (
          <>
            <TextInput style={styles.editInput} placeholder="Your name" placeholderTextColor="rgba(255,255,255,0.3)" value={name} onChangeText={setName} />
            <TextInput style={styles.editInput} placeholder="Bio" placeholderTextColor="rgba(255,255,255,0.3)" value={bio} onChangeText={setBio} />
            <TextInput style={styles.editInput} placeholder="City" placeholderTextColor="rgba(255,255,255,0.3)" value={city} onChangeText={setCity} />
            <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
              {saving ? <ActivityIndicator color="#111" /> : <Text style={styles.saveBtnTxt}>Save</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.name}>{name || 'Set your name'}</Text>
            <Text style={styles.bio}>{bio || 'Add a short bio'}</Text>
            <Text style={styles.location}>📍 {city || 'Your city'} · {email}</Text>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editTxt}>✏ Edit Profile</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Tabs (tap a stat to switch the list below) */}
      <View style={styles.stats}>
        <TouchableOpacity style={[styles.stat, tab === 'events' && styles.statOn]} onPress={() => setTab('events')}>
          <Text style={styles.statN}>{myEvents.length}</Text>
          <Text style={styles.statL}>Events</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.stat, styles.statBorder, tab === 'joined' && styles.statOn]} onPress={() => setTab('joined')}>
          <Text style={styles.statN}>{joinedEvents.length}</Text>
          <Text style={styles.statL}>Joined</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.stat, styles.statBorder, tab === 'friends' && styles.statOn]} onPress={() => setTab('friends')}>
          <Text style={styles.statN}>{friends.length}</Text>
          <Text style={styles.statL}>Friends</Text>
        </TouchableOpacity>
      </View>

      {/* Dynamic list */}
      <View style={styles.section}>
        {tab === 'events' && (
          <>
            <Text style={styles.sectionTitle}>My Events</Text>
            {myEvents.length === 0 && <Text style={styles.empty}>Нет своих событий — создай первое!</Text>}
            {myEvents.map(e => renderEvent(e, true))}
          </>
        )}
        {tab === 'joined' && (
          <>
            <Text style={styles.sectionTitle}>Joined</Text>
            {joinedEvents.length === 0 && <Text style={styles.empty}>Ты пока никуда не вступил</Text>}
            {joinedEvents.map(e => renderEvent(e, false))}
          </>
        )}
        {tab === 'friends' && (
          <>
            <Text style={styles.sectionTitle}>Friends</Text>
            {friends.length === 0 && <Text style={styles.empty}>Пока нет друзей</Text>}
            {friends.map(f => (
              <TouchableOpacity key={f.id} style={styles.eventCard} onPress={() => router.push(`/user/${f.id}` as any)} activeOpacity={0.7}>
                <View style={styles.friendAvatar}>
                  {f.avatar_url ? <Image source={{ uri: f.avatar_url }} style={styles.friendAvatarImg} contentFit="cover" /> : <Text style={{ fontSize: 18 }}>🧑</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle}>{f.name || 'Аноним'}</Text>
                  {f.city ? <Text style={styles.eventMeta}>📍 {f.city}</Text> : null}
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>

      {/* Interests editor */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Interests</Text>
        <View style={styles.tagsWrap}>
          {ALL_INTERESTS.map(tag => (
            <TouchableOpacity key={tag} style={[styles.tag, interests.includes(tag) && styles.tagOn]} onPress={() => toggleInterest(tag)}>
              <Text style={[styles.tagTxt, interests.includes(tag) && styles.tagTxtOn]}>{tag}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.saveInterests} onPress={saveProfile} disabled={saving}>
          <Text style={styles.saveInterestsTxt}>{saving ? 'Saving...' : 'Save interests'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={async () => { await supabase.auth.signOut({ scope: 'global' }); router.replace('/'); }}>
        <Text style={styles.signOutTxt}>Sign Out</Text>
      </TouchableOpacity>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: '#FAFAF7', alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  hero: { backgroundColor: '#111110', padding: 28, paddingTop: 64, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F5C400', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarEmoji: { fontSize: 36 },
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
  avatarOverlay: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(245,196,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  avatarBadge: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: '#111', borderWidth: 2, borderColor: '#111110', alignItems: 'center', justifyContent: 'center' },
  avatarBadgeTxt: { fontSize: 13 },
  changePhotoBtn: { marginBottom: 12, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  changePhotoTxt: { color: '#F5C400', fontSize: 12, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  bio: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 4 },
  location: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16 },
  editBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.1)' },
  editTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  editInput: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 12, fontSize: 14, color: '#fff', marginBottom: 8, width: '100%' },
  saveBtn: { backgroundColor: '#F5C400', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  saveBtnTxt: { fontSize: 14, fontWeight: '700', color: '#111' },
  stats: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E5E5DF', overflow: 'hidden' },
  stat: { flex: 1, padding: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  statOn: { borderBottomColor: '#F5C400', backgroundColor: '#FFFBEA' },
  statBorder: { borderLeftWidth: 1, borderLeftColor: '#E5E5DF' },
  statN: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 2 },
  statL: { fontSize: 10, color: '#888', fontWeight: '600', textTransform: 'uppercase' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111', marginBottom: 12 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E5DF' },
  tagOn: { backgroundColor: '#111', borderColor: '#111' },
  tagTxt: { fontSize: 12, fontWeight: '600', color: '#111' },
  tagTxtOn: { color: '#F5C400' },
  saveInterests: { marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#111', alignItems: 'center' },
  saveInterestsTxt: { fontSize: 13, fontWeight: '700', color: '#F5C400' },
  empty: { fontSize: 13, color: '#888' },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E5DF' },
  eventMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  eventDelBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FDECEC', alignItems: 'center', justifyContent: 'center' },
  eventDelTxt: { fontSize: 16 },
  eventEmoji: { fontSize: 24 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  eventMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  chevron: { fontSize: 22, color: '#ccc' },
  friendAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5C400', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  friendAvatarImg: { width: 44, height: 44 },
  signOut: { marginHorizontal: 16, marginTop: 20, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5DF', alignItems: 'center' },
  signOutTxt: { fontSize: 14, fontWeight: '700', color: '#888' },
});
