import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { captureAvatarImage, moderateImageBase64, PickedMedia, pickAvatarImage, uploadJpeg } from '../lib/photos';
import { supabase } from '../lib/supabase';
import { useUnread } from '../lib/unread';

const ALL_INTERESTS =['⚽ Sport', '🎸 Music', '🏃 Running', '📸 Photo', '🐕 Dog Walks', '🎲 Board Games', '🍕 Food', '📚 Books', '🧘 Yoga', '🎨 Art'];

export default function ProfileScreen() {
  const { t } = useI18n();
  const { counts } = useUnread();
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
  const [friendRequests, setFriendRequests] = useState<any[]>([]);
  const [tab, setTab] = useState<'events' | 'joined' | 'friends'>('events');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const loadLists = async (uid: string) => {
    try {
      const [{ data: mine }, { data: parts }, { data: fships }] = await Promise.all([
        supabase.from('events').select('*').eq('creator_id', uid).order('created_at', { ascending: false }),
        supabase.from('event_participants').select('event_id').eq('user_id', uid),
        supabase.from('friendships').select('user_id, friend_id, status').or(`user_id.eq.${uid},friend_id.eq.${uid}`),
      ]);
      setMyEvents(mine || []);
      const ids = (parts || []).map((p: any) => p.event_id);
      if (ids.length) {
        const { data: jev } = await supabase.from('events').select('*').in('id', ids).order('created_at', { ascending: false });
        setJoinedEvents(jev || []);
      } else setJoinedEvents([]);
      // Accepted friends (either direction) + incoming pending requests.
      const accepted = (fships || []).filter((f: any) => f.status === 'accepted');
      const incoming = (fships || []).filter((f: any) => f.status === 'pending' && f.friend_id === uid);
      const friendIds = accepted.map((f: any) => f.user_id === uid ? f.friend_id : f.user_id);
      const reqIds = incoming.map((f: any) => f.user_id);
      const allIds = Array.from(new Set([...friendIds, ...reqIds]));
      const byId: Record<string, any> = {};
      if (allIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name, avatar_url, city').in('id', allIds);
        (profs || []).forEach((p: any) => { byId[p.id] = p; });
      }
      setFriends(friendIds.map((fid: string) => byId[fid] || { id: fid, name: 'Аноним' }));
      setFriendRequests(reqIds.map((rid: string) => byId[rid] || { id: rid, name: 'Аноним' }));
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

  const uploadAvatar = async (m: PickedMedia | null) => {
    if (!m || !userId) return;
    setUploadingAvatar(true);
    try {
      const mod = await moderateImageBase64(m.base64);
      if (mod.status === 'unavailable') { Alert.alert(t('media.unavailableTitle'), t('media.unavailableShort')); return; }
      if (mod.status === 'blocked') { Alert.alert(t('media.rejectedTitle'), t('media.rejected', { n: 1 })); return; }
      const url = await uploadJpeg('avatars', `${userId}/avatar.jpg`, m.base64);
      await supabase.from('profiles').upsert({ id: userId, avatar_url: url });
      setAvatarUrl(url);
    } catch (e) {
      Alert.alert(t('profile.uploadFail'), t('common.tryAgain'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const pickAvatar = () => {
    if (!userId || uploadingAvatar) return;
    Alert.alert(t('media.addTitle'), undefined, [
      { text: t('media.camera'), onPress: async () => uploadAvatar(await captureAvatarImage()) },
      { text: t('media.gallery'), onPress: async () => uploadAvatar(await pickAvatarImage()) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const deleteEvent = (id: string) => {
    Alert.alert(t('map.delQ'), t('map.delMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase.rpc('delete_event', { p_event_id: id });
            if (error) throw error;
            setMyEvents(prev => prev.filter(e => e.id !== id));
            setJoinedEvents(prev => prev.filter(e => e.id !== id));
          } catch (e) {
            Alert.alert(t('map.delFail'), t('common.tryAgain'));
          }
        },
      },
    ]);
  };

  const acceptRequest = async (requesterId: string) => {
    try {
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('user_id', requesterId).eq('friend_id', userId);
      if (error) throw error;
      await loadLists(userId);
    } catch (e) { Alert.alert(t('common.failed'), t('common.tryAgain')); }
  };

  const declineRequest = async (requesterId: string) => {
    try {
      await supabase.from('friendships').delete().eq('user_id', requesterId).eq('friend_id', userId);
      await loadLists(userId);
    } catch (e) {}
  };

  if (loading) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#2FB6A8" /></View>;
  }

  const renderEvent = (e: any, withDelete: boolean) => {
    const unread = counts[e.id] || 0;
    return (
      <View key={e.id} style={styles.eventCard}>
        <TouchableOpacity style={styles.eventMain} onPress={() => router.push(`/event/${e.id}` as any)} activeOpacity={0.7}>
          <Text style={styles.eventEmoji}>{e.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>{e.title}</Text>
            {e.location ? <Text style={styles.eventMeta} numberOfLines={1}>📍 {e.location}</Text> : null}
            <Text style={styles.eventMeta}>👥 {e.people}/{e.max_people} · ❤️ {e.likes || 0} · {e.is_now ? t('common.now') : t('common.later')}</Text>
          </View>
        </TouchableOpacity>
        {unread > 0 && (
          <View style={styles.unreadBadge}><Text style={styles.unreadBadgeTxt}>{unread > 99 ? '99+' : unread}</Text></View>
        )}
        {withDelete
          ? <TouchableOpacity style={styles.eventDelBtn} onPress={() => deleteEvent(e.id)}><Text style={styles.eventDelTxt}>🗑</Text></TouchableOpacity>
          : <Text style={styles.chevron}>›</Text>}
      </View>
    );
  };

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
            <View style={styles.avatarOverlay}><ActivityIndicator color="#16263F" /></View>
          ) : (
            <View style={styles.avatarBadge}><Text style={styles.avatarBadgeTxt}>📷</Text></View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={pickAvatar} disabled={uploadingAvatar} style={styles.changePhotoBtn}>
          <Text style={styles.changePhotoTxt}>{uploadingAvatar ? t('common.uploading') : avatarUrl ? t('profile.changePhoto') : t('profile.addPhoto')}</Text>
        </TouchableOpacity>
        {editing ? (
          <>
            <TextInput style={styles.editInput} placeholder={t('profile.namePh')} placeholderTextColor="rgba(255,255,255,0.3)" value={name} onChangeText={setName} />
            <TextInput style={styles.editInput} placeholder={t('profile.bioPh')} placeholderTextColor="rgba(255,255,255,0.3)" value={bio} onChangeText={setBio} />
            <TextInput style={styles.editInput} placeholder={t('profile.cityPh')} placeholderTextColor="rgba(255,255,255,0.3)" value={city} onChangeText={setCity} />
            <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
              {saving ? <ActivityIndicator color="#16263F" /> : <Text style={styles.saveBtnTxt}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.name}>{name || t('profile.setName')}</Text>
            <Text style={styles.bio}>{bio || t('profile.addBio')}</Text>
            <Text style={styles.location}>📍 {city || t('profile.yourCity')} · {email}</Text>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editTxt}>{t('profile.edit')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Tabs (tap a stat to switch the list below) */}
      <View style={styles.stats}>
        <TouchableOpacity style={[styles.stat, tab === 'events' && styles.statOn]} onPress={() => setTab('events')}>
          <Text style={styles.statN}>{myEvents.length}</Text>
          <Text style={styles.statL}>{t('profile.statEvents')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.stat, styles.statBorder, tab === 'joined' && styles.statOn]} onPress={() => setTab('joined')}>
          <Text style={styles.statN}>{joinedEvents.length}</Text>
          <Text style={styles.statL}>{t('profile.statJoined')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.stat, styles.statBorder, tab === 'friends' && styles.statOn]} onPress={() => setTab('friends')}>
          <Text style={styles.statN}>{friends.length}</Text>
          <Text style={styles.statL}>{t('profile.statFriends')}</Text>
          {friendRequests.length > 0 && <View style={styles.reqDot}><Text style={styles.reqDotTxt}>{friendRequests.length}</Text></View>}
        </TouchableOpacity>
      </View>

      {/* Dynamic list */}
      <View style={styles.section}>
        {tab === 'events' && (
          <>
            <Text style={styles.sectionTitle}>{t('profile.myEvents')}</Text>
            {myEvents.length === 0 && <Text style={styles.empty}>{t('profile.noEvents')}</Text>}
            {myEvents.map(e => renderEvent(e, true))}
          </>
        )}
        {tab === 'joined' && (
          <>
            <Text style={styles.sectionTitle}>{t('profile.joinedTitle')}</Text>
            {joinedEvents.length === 0 && <Text style={styles.empty}>{t('profile.noJoined')}</Text>}
            {joinedEvents.map(e => renderEvent(e, false))}
          </>
        )}
        {tab === 'friends' && (
          <>
            {friendRequests.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>{t('profile.requests', { n: friendRequests.length })}</Text>
                {friendRequests.map(r => (
                  <View key={r.id} style={styles.eventCard}>
                    <TouchableOpacity style={styles.eventMain} onPress={() => router.push(`/user/${r.id}` as any)} activeOpacity={0.7}>
                      <View style={styles.friendAvatar}>
                        {r.avatar_url ? <Image source={{ uri: r.avatar_url }} style={styles.friendAvatarImg} contentFit="cover" /> : <Text style={{ fontSize: 18 }}>🧑</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eventTitle}>{r.name || t('common.anon')}</Text>
                        <Text style={styles.eventMeta}>{t('profile.wantsFriend')}</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptRequest(r.id)}><Text style={styles.acceptTxt}>✓</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => declineRequest(r.id)}><Text style={styles.declineTxt}>✕</Text></TouchableOpacity>
                  </View>
                ))}
                <View style={{ height: 12 }} />
              </>
            )}
            <Text style={styles.sectionTitle}>{t('profile.friendsTitle')}</Text>
            {friends.length === 0 && <Text style={styles.empty}>{t('profile.noFriends')}</Text>}
            {friends.map(f => (
              <TouchableOpacity key={f.id} style={styles.eventCard} onPress={() => router.push(`/user/${f.id}` as any)} activeOpacity={0.7}>
                <View style={styles.friendAvatar}>
                  {f.avatar_url ? <Image source={{ uri: f.avatar_url }} style={styles.friendAvatarImg} contentFit="cover" /> : <Text style={{ fontSize: 18 }}>🧑</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle}>{f.name || t('common.anon')}</Text>
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
        <Text style={styles.sectionTitle}>{t('profile.interests')}</Text>
        <View style={styles.tagsWrap}>
          {ALL_INTERESTS.map(tag => (
            <TouchableOpacity key={tag} style={[styles.tag, interests.includes(tag) && styles.tagOn]} onPress={() => toggleInterest(tag)}>
              <Text style={[styles.tagTxt, interests.includes(tag) && styles.tagTxtOn]}>{tag}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.saveInterests} onPress={saveProfile} disabled={saving}>
          <Text style={styles.saveInterestsTxt}>{saving ? t('profile.saving') : t('profile.saveInterests')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={async () => { await supabase.auth.signOut({ scope: 'global' }); router.replace('/'); }}>
        <Text style={styles.signOutTxt}>{t('profile.signOut')}</Text>
      </TouchableOpacity>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: '#FAFAF7', alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  hero: { backgroundColor: '#16263F', padding: 28, paddingTop: 64, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2FB6A8', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarEmoji: { fontSize: 36 },
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
  avatarOverlay: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(47,182,168,0.55)', alignItems: 'center', justifyContent: 'center' },
  avatarBadge: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: '#16263F', borderWidth: 2, borderColor: '#16263F', alignItems: 'center', justifyContent: 'center' },
  avatarBadgeTxt: { fontSize: 13 },
  changePhotoBtn: { marginBottom: 12, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  changePhotoTxt: { color: '#2FB6A8', fontSize: 12, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  bio: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 4 },
  location: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16 },
  editBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.1)' },
  editTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  editInput: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 12, fontSize: 14, color: '#fff', marginBottom: 8, width: '100%' },
  saveBtn: { backgroundColor: '#2FB6A8', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  saveBtnTxt: { fontSize: 14, fontWeight: '700', color: '#16263F' },
  stats: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E5E5DF', overflow: 'hidden' },
  stat: { flex: 1, padding: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  statOn: { borderBottomColor: '#2FB6A8', backgroundColor: '#E7F7F4' },
  statBorder: { borderLeftWidth: 1, borderLeftColor: '#E5E5DF' },
  statN: { fontSize: 18, fontWeight: '800', color: '#16263F', marginBottom: 2 },
  statL: { fontSize: 10, color: '#888', fontWeight: '600', textTransform: 'uppercase' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#16263F', marginBottom: 12 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E5DF' },
  tagOn: { backgroundColor: '#16263F', borderColor: '#16263F' },
  tagTxt: { fontSize: 12, fontWeight: '600', color: '#16263F' },
  tagTxtOn: { color: '#2FB6A8' },
  saveInterests: { marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#16263F', alignItems: 'center' },
  saveInterestsTxt: { fontSize: 13, fontWeight: '700', color: '#2FB6A8' },
  empty: { fontSize: 13, color: '#888' },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E5DF' },
  eventMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#2FB6A8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadBadgeTxt: { color: '#16263F', fontSize: 11, fontWeight: '800' },
  eventDelBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FDECEC', alignItems: 'center', justifyContent: 'center' },
  eventDelTxt: { fontSize: 16 },
  eventEmoji: { fontSize: 24 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: '#16263F' },
  eventMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  chevron: { fontSize: 22, color: '#ccc' },
  friendAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2FB6A8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  friendAvatarImg: { width: 44, height: 44 },
  reqDot: { position: 'absolute', top: 6, right: 10, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#C0392B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  reqDotTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  acceptBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#2FB6A8', alignItems: 'center', justifyContent: 'center' },
  acceptTxt: { fontSize: 16, fontWeight: '800', color: '#16263F' },
  declineBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FDECEC', alignItems: 'center', justifyContent: 'center' },
  declineTxt: { fontSize: 16, fontWeight: '800', color: '#C0392B' },
  signOut: { marginHorizontal: 16, marginTop: 20, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5DF', alignItems: 'center' },
  signOutTxt: { fontSize: 14, fontWeight: '700', color: '#888' },
});
