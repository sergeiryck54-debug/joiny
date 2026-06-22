import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Share, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useI18n } from '../lib/i18n';
import { addEventMedia, captureMedia, getEventPhotos, isVideoUrl, MediaKind, PickedMedia, pickMedia, removeEventPhoto } from '../lib/photos';
import { supabase } from '../lib/supabase';
import { useUnread } from '../lib/unread';

const SCREEN_W = Dimensions.get('window').width;

function buildEventMapHtml(lat: number, lng: number) {
  return `
    <!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>html,body,#map{margin:0;height:100%;width:100%}</style>
    </head><body><div id="map"></div><script>
      var map = L.map('map', {zoomControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false, boxZoom:false, keyboard:false, tap:false, touchZoom:false}).setView([${lat}, ${lng}], 15);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(map);
      L.marker([${lat}, ${lng}]).addTo(map);
    </script></body></html>
  `;
}

function buildVideoHtml(url: string) {
  return `
    <!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <style>html,body{margin:0;background:#000;height:100%;width:100%}video{width:100%;height:100%;object-fit:contain}</style>
    </head><body>
    <video src="${url}" controls playsinline webkit-playsinline preload="metadata"></video>
    </body></html>
  `;
}

export default function EventDetailScreen() {
  const { t } = useI18n();
  const { counts } = useUnread();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ev, setEv] = useState<any>(null);
  const [creator, setCreator] = useState<any>(null);
  const [userId, setUserId] = useState('');
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photos, setPhotos] = useState<any[]>([]);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);

  const load = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
      const { data: event } = await supabase.from('events').select('*').eq('id', id).single();
      setEv(event);
      setPhotos(await getEventPhotos(id));
      if (event?.creator_id) {
        const { data: prof } = await supabase.from('profiles').select('id, name, avatar_url').eq('id', event.creator_id).single();
        setCreator(prof);
      }
      if (user) {
        const { data: part } = await supabase.from('event_participants').select('event_id').eq('event_id', id).eq('user_id', user.id).maybeSingle();
        setJoined(!!part);
        const { data: lk } = await supabase.from('event_likes').select('event_id').eq('event_id', id).eq('user_id', user.id).maybeSingle();
        setLiked(!!lk);
      }
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { if (id) load(); }, [id]);

  // Refresh when returning (e.g. after editing).
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    if (id) load();
  }, [id]));

  const isCreator = !!ev?.creator_id && ev.creator_id === userId;

  const toggleJoin = async () => {
    if (joining) return;
    setJoining(true);
    const was = joined;
    setJoined(!was);
    setEv((e: any) => e ? { ...e, people: Math.max(0, (e.people || 0) + (was ? -1 : 1)) } : e);
    try {
      const { data, error } = await supabase.rpc('toggle_join', { p_event_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setJoined(row.joined);
        setEv((e: any) => e ? { ...e, people: row.people } : e);
      }
    } catch (e: any) {
      setJoined(was);
      setEv((e: any) => e ? { ...e, people: Math.max(0, (e.people || 0) + (was ? 1 : -1)) } : e);
      if (String(e?.message || '').includes('full')) Alert.alert(t('map.full'), t('map.fullMsg'));
    } finally {
      setJoining(false);
    }
  };

  const toggleLike = async () => {
    if (likeBusy) return;
    setLikeBusy(true);
    const was = liked;
    setLiked(!was);
    setEv((e: any) => e ? { ...e, likes: Math.max(0, (e.likes || 0) + (was ? -1 : 1)) } : e);
    try {
      const { data, error } = await supabase.rpc('toggle_event_like', { p_event_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) { setLiked(row.liked); setEv((e: any) => e ? { ...e, likes: row.likes } : e); }
    } catch (e) {
      setLiked(was);
      setEv((e: any) => e ? { ...e, likes: Math.max(0, (e.likes || 0) + (was ? 1 : -1)) } : e);
    } finally {
      setLikeBusy(false);
    }
  };

  const toggleParticipants = async () => {
    const next = !showParticipants;
    setShowParticipants(next);
    if (next && participants.length === 0) {
      const { data: parts } = await supabase.from('event_participants').select('user_id').eq('event_id', id);
      const ids = (parts || []).map((p: any) => p.user_id);
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name, avatar_url').in('id', ids);
        setParticipants(profs || []);
      }
    }
  };

  const openChat = () => {
    if (!joined) { Alert.alert(t('ev.joinFirst'), t('ev.joinFirstMsg')); return; }
    router.push(`/chat/${id}` as any);
  };

  const shareEvent = async () => {
    if (!ev) return;
    const lines = [`${ev.emoji || '📍'} ${ev.title}`];
    if (ev.location) lines.push(`📍 ${ev.location}`);
    lines.push(`📅 ${when}`);
    lines.push(`👥 ${ev.people}/${ev.max_people}`);
    lines.push(`\n${t('ev.shareOpen')}joinapp://event/${id}`);
    try { await Share.share({ message: lines.join('\n') }); } catch (e) {}
  };

  const uploadMediaItems = async (items: PickedMedia[]) => {
    if (!items.length || !userId) return;
    setPhotoBusy(true);
    try {
      const { rejected } = await addEventMedia(id, userId, items);
      const ph = await getEventPhotos(id);
      setPhotos(ph);
      const cover = ph.map((p: any) => p.url).find((u: string) => !isVideoUrl(u)) || null;
      setEv((e: any) => ({ ...e, photo_url: cover }));
      if (rejected > 0) Alert.alert(t('media.rejectedTitle'), t('media.rejected', { n: rejected }));
    } catch (e) {
      Alert.alert(t('ev.photoFail'), t('common.tryAgain'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const captureAndAdd = (kind: MediaKind) => async () => {
    try { const m = await captureMedia(kind); if (m) await uploadMediaItems([m]); }
    catch (e) { Alert.alert(t('media.fail'), t('common.tryAgain')); }
  };
  const pickAndAdd = async () => {
    try { const list = await pickMedia(6, true); if (list.length) await uploadMediaItems(list); }
    catch (e) { Alert.alert(t('media.fail'), t('common.tryAgain')); }
  };

  const addPhotos = () => {
    if (photoBusy || !userId) return;
    Alert.alert(t('media.addTitle'), undefined, [
      { text: t('media.camera'), onPress: () => Alert.alert(t('media.cameraTitle'), undefined, [
        { text: t('media.photo'), onPress: captureAndAdd('image') },
        { text: t('media.video'), onPress: captureAndAdd('video') },
        { text: t('common.cancel'), style: 'cancel' },
      ]) },
      { text: t('media.gallery'), onPress: pickAndAdd },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const removePhoto = (photoId: string | null) => {
    Alert.alert(t('ev.delPhotoQ'), t('ev.delPhotoMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive', onPress: async () => {
          setPhotoBusy(true);
          try {
            if (photoId) await removeEventPhoto(id, photoId);
            else await supabase.rpc('set_event_photo', { p_event_id: id, p_url: null });
            const ph = await getEventPhotos(id);
            setPhotos(ph);
            setEv((e: any) => ({ ...e, photo_url: ph.length ? ph[0].url : null }));
          } catch (e) { Alert.alert(t('ev.photoFail'), t('common.tryAgain')); }
          finally { setPhotoBusy(false); }
        },
      },
    ]);
  };

  const reportPhoto = (url: string) => {
    const sendReport = async (reason: string) => {
      try {
        await supabase.from('photo_reports').insert({ reporter_id: userId, event_id: id, photo_url: url, reason });
        Alert.alert(t('ev.reportThanks'), t('ev.reportThanksMsg'));
      } catch (e) { Alert.alert(t('ev.reportFail'), t('common.tryAgain')); }
    };
    Alert.alert(t('ev.reportTitle'), t('ev.reportSub'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('ev.rOffensive'), onPress: () => sendReport('offensive') },
      { text: t('ev.rSpam'), onPress: () => sendReport('spam') },
      { text: t('ev.rOther'), onPress: () => sendReport('other') },
    ]);
  };

  const deleteEvent = () => {
    Alert.alert(t('map.delQ'), t('map.delMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase.rpc('delete_event', { p_event_id: id });
            if (error) throw error;
            router.back();
          } catch (e) { Alert.alert(t('map.delFail'), t('common.tryAgain')); }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#2FB6A8" />
      </View>
    );
  }

  if (!ev) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.muted}>{t('ev.notFound')}</Text>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}><Text style={styles.backLinkTxt}>{t('common.back')}</Text></TouchableOpacity>
      </View>
    );
  }

  const when = ev.starts_at ? ev.starts_at : (ev.is_now ? t('ev.rightNow') : t('ev.noTime'));
  // Gallery from event_photos; fall back to the legacy single cover for old events.
  const gallery = photos.length ? photos : (ev.photo_url ? [{ id: null, url: ev.photo_url }] : []);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backFab}>
        <Text style={styles.backFabTxt}>‹</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Photo gallery */}
        {gallery.length ? (
          <View style={styles.photoWrap}>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {gallery.map((p, i) => (
                <View key={p.id || i} style={styles.slide}>
                  {isVideoUrl(p.url)
                    ? <WebView originWhitelist={['*']} source={{ html: buildVideoHtml(p.url) }} style={styles.photo} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} />
                    : <Image source={{ uri: p.url }} style={styles.photo} contentFit="cover" />}
                  <View style={styles.photoActions}>
                    <TouchableOpacity style={styles.photoBtn} onPress={() => reportPhoto(p.url)}><Text style={styles.photoBtnTxt}>⚑</Text></TouchableOpacity>
                    {isCreator && <TouchableOpacity style={styles.photoBtn} onPress={() => removePhoto(p.id)} disabled={photoBusy}><Text style={styles.photoBtnTxt}>🗑</Text></TouchableOpacity>}
                  </View>
                </View>
              ))}
            </ScrollView>
            {gallery.length > 1 && <View style={styles.countBadge}><Text style={styles.countTxt}>{t('ev.photosCount', { n: gallery.length })}</Text></View>}
            {isCreator && <TouchableOpacity style={styles.addMore} onPress={addPhotos} disabled={photoBusy}><Text style={styles.addMoreTxt}>＋</Text></TouchableOpacity>}
            {photoBusy && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
          </View>
        ) : isCreator ? (
          <TouchableOpacity style={styles.addPhoto} onPress={addPhotos} disabled={photoBusy}>
            <Text style={styles.addPhotoTxt}>{photoBusy ? t('common.uploading') : t('ev.addPhoto')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.noPhoto}><Text style={styles.noPhotoEmoji}>{ev.emoji || '📍'}</Text></View>
        )}

        <View style={styles.body}>
          <Text style={styles.title}>{ev.emoji} {ev.title}</Text>

          {/* Creator */}
          <TouchableOpacity style={styles.creatorRow} onPress={() => ev.creator_id && router.push(`/user/${ev.creator_id}` as any)} disabled={!ev.creator_id}>
            <View style={styles.creatorAvatar}>
              {creator?.avatar_url ? <Image source={{ uri: creator.avatar_url }} style={styles.creatorAvatarImg} contentFit="cover" /> : <Text style={{ fontSize: 18 }}>🧑</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.creatorLabel}>{t('ev.organizer')}</Text>
              <Text style={styles.creatorName}>{creator?.name || t('common.anon')} {ev.creator_id ? '›' : ''}</Text>
            </View>
          </TouchableOpacity>

          {/* Like */}
          <TouchableOpacity style={styles.likeRow} onPress={toggleLike} disabled={likeBusy} activeOpacity={0.7}>
            <Text style={styles.likeHeart}>{liked ? '❤️' : '🤍'}</Text>
            <Text style={styles.likeCount}>{ev.likes || 0}</Text>
            <Text style={styles.likeLabel}>{liked ? t('ev.liked') : t('ev.like')}</Text>
          </TouchableOpacity>

          {/* Info */}
          <View style={styles.infoRow}><Text style={styles.infoIcon}>📅</Text><Text style={styles.infoTxt}>{when}</Text></View>
          {ev.location ? <View style={styles.infoRow}><Text style={styles.infoIcon}>📍</Text><Text style={styles.infoTxt}>{ev.location}</Text></View> : null}
          <TouchableOpacity style={styles.infoRow} onPress={toggleParticipants} activeOpacity={0.7}>
            <Text style={styles.infoIcon}>👥</Text>
            <Text style={styles.infoTxt}>{ev.people}/{ev.max_people} {t('ev.participants')}</Text>
            <Text style={styles.infoChevron}>{showParticipants ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showParticipants && (
            <View style={styles.partList}>
              {participants.length === 0 && <Text style={styles.partEmpty}>…</Text>}
              {participants.map(p => (
                <TouchableOpacity key={p.id} style={styles.partItem} onPress={() => router.push(`/user/${p.id}` as any)} activeOpacity={0.7}>
                  <View style={styles.partAvatar}>
                    {p.avatar_url ? <Image source={{ uri: p.avatar_url }} style={styles.partAvatarImg} contentFit="cover" /> : <Text style={{ fontSize: 16 }}>🧑</Text>}
                  </View>
                  <Text style={styles.partName}>{p.name || t('common.anon')}</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Map */}
          <View style={styles.miniMap}>
            <WebView originWhitelist={['*']} source={{ html: buildEventMapHtml(ev.lat, ev.lng) }} scrollEnabled={false} style={{ flex: 1 }} pointerEvents="none" />
          </View>

          {/* Join */}
          <TouchableOpacity style={[styles.joinBtn, joined && styles.joinBtnDone]} onPress={toggleJoin} disabled={joining}>
            <Text style={[styles.joinTxt, joined && styles.joinTxtDone]}>
              {joining ? '…' : joined ? t('ev.leave') : t('ev.join')}
            </Text>
          </TouchableOpacity>

          {/* Chat */}
          <TouchableOpacity style={styles.chatBtn} onPress={openChat}>
            <Text style={styles.chatTxt}>{t('ev.openChat')}</Text>
            {(counts[id] || 0) > 0 && (
              <View style={styles.chatBadge}><Text style={styles.chatBadgeTxt}>{counts[id] > 99 ? '99+' : counts[id]}</Text></View>
            )}
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity style={styles.chatBtn} onPress={shareEvent}>
            <Text style={styles.chatTxt}>{t('ev.share')}</Text>
          </TouchableOpacity>

          {isCreator && (
            <TouchableOpacity style={styles.editBtn} onPress={() => router.push(`/edit-event/${id}` as any)}>
              <Text style={styles.editTxt}>{t('ev.edit')}</Text>
            </TouchableOpacity>
          )}

          {isCreator && (
            <TouchableOpacity style={styles.delBtn} onPress={deleteEvent}>
              <Text style={styles.delTxt}>{t('ev.del')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  loadingWrap: { flex: 1, backgroundColor: '#FAFAF7', alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#888', fontSize: 15 },
  backLink: { padding: 10 },
  backLinkTxt: { color: '#1E8C80', fontWeight: '700' },
  backFab: { position: 'absolute', top: 48, left: 14, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(17,17,16,0.7)', alignItems: 'center', justifyContent: 'center' },
  backFabTxt: { color: '#fff', fontSize: 30, lineHeight: 30, marginTop: -3 },
  photoWrap: { width: '100%', height: 240, backgroundColor: '#eee' },
  slide: { width: SCREEN_W, height: 240 },
  photo: { width: SCREEN_W, height: 240 },
  countBadge: { position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: 'rgba(17,17,16,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countTxt: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  addMore: { position: 'absolute', bottom: 10, right: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: '#2FB6A8', alignItems: 'center', justifyContent: 'center' },
  addMoreTxt: { fontSize: 24, fontWeight: '700', color: '#16263F' },
  photoActions: { position: 'absolute', top: 48, right: 12, flexDirection: 'row', gap: 6 },
  photoBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(17,17,16,0.7)', alignItems: 'center', justifyContent: 'center' },
  photoBtnTxt: { color: '#fff', fontSize: 16 },
  photoOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  addPhoto: { margin: 16, marginTop: 56, height: 120, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E5DF', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  addPhotoTxt: { fontSize: 14, fontWeight: '600', color: '#888' },
  noPhoto: { width: '100%', height: 160, backgroundColor: '#16263F', alignItems: 'center', justifyContent: 'center' },
  noPhotoEmoji: { fontSize: 64 },
  body: { padding: 18 },
  title: { fontSize: 26, fontWeight: '800', color: '#16263F', marginBottom: 14 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E5DF', padding: 12, marginBottom: 14 },
  creatorAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2FB6A8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  creatorAvatarImg: { width: 44, height: 44 },
  creatorLabel: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase' },
  creatorName: { fontSize: 16, fontWeight: '700', color: '#16263F', marginTop: 1 },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E5DF', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 14 },
  likeHeart: { fontSize: 18 },
  likeCount: { fontSize: 15, fontWeight: '800', color: '#16263F' },
  likeLabel: { fontSize: 13, color: '#888', fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  infoIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  infoTxt: { fontSize: 15, color: '#333', flex: 1 },
  infoChevron: { fontSize: 12, color: '#888' },
  partList: { marginBottom: 12, gap: 6 },
  partItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E5DF', borderRadius: 12, padding: 8 },
  partAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#2FB6A8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  partAvatarImg: { width: 34, height: 34 },
  partName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#16263F' },
  partEmpty: { fontSize: 13, color: '#888' },
  chevron: { fontSize: 20, color: '#ccc' },
  miniMap: { height: 160, borderRadius: 14, overflow: 'hidden', marginTop: 8, marginBottom: 18, borderWidth: 1, borderColor: '#E5E5DF', backgroundColor: '#e5e5df' },
  joinBtn: { backgroundColor: '#2FB6A8', padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  joinBtnDone: { backgroundColor: '#16263F' },
  joinTxt: { fontSize: 16, fontWeight: '800', color: '#16263F' },
  joinTxtDone: { color: '#2FB6A8' },
  chatBtn: { padding: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E5E5DF', backgroundColor: '#fff', marginBottom: 10 },
  chatTxt: { fontSize: 15, fontWeight: '700', color: '#16263F' },
  chatBadge: { position: 'absolute', right: 14, top: '50%', marginTop: -12, minWidth: 24, height: 24, borderRadius: 12, backgroundColor: '#2FB6A8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  chatBadgeTxt: { color: '#16263F', fontSize: 12, fontWeight: '800' },
  editBtn: { padding: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#16263F', marginBottom: 10 },
  editTxt: { fontSize: 15, fontWeight: '700', color: '#2FB6A8' },
  delBtn: { padding: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#FDECEC', marginTop: 4 },
  delTxt: { fontSize: 14, fontWeight: '700', color: '#C0392B' },
});
