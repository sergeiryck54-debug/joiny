import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { addEventPhotos, getEventPhotos, pickImagesBase64, removeEventPhoto } from '../lib/photos';
import { supabase } from '../lib/supabase';

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

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ev, setEv] = useState<any>(null);
  const [creator, setCreator] = useState<any>(null);
  const [userId, setUserId] = useState('');
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photos, setPhotos] = useState<any[]>([]);

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
      if (String(e?.message || '').includes('full')) Alert.alert('Событие заполнено', 'Все места уже заняты.');
    } finally {
      setJoining(false);
    }
  };

  const openChat = () => {
    if (!joined) { Alert.alert('Сначала присоединись', 'Чат доступен участникам события.'); return; }
    router.push(`/chat/${id}` as any);
  };

  const addPhotos = async () => {
    if (photoBusy || !userId) return;
    try {
      const list = await pickImagesBase64(6);
      if (!list.length) return;
      setPhotoBusy(true);
      await addEventPhotos(id, userId, list);
      const ph = await getEventPhotos(id);
      setPhotos(ph);
      setEv((e: any) => ({ ...e, photo_url: ph.length ? ph[0].url : null }));
    } catch (e) {
      Alert.alert('Не удалось добавить фото', 'Попробуй ещё раз.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = (photoId: string | null) => {
    Alert.alert('Удалить фото?', 'Это фото будет удалено.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          setPhotoBusy(true);
          try {
            if (photoId) await removeEventPhoto(id, photoId);
            else await supabase.rpc('set_event_photo', { p_event_id: id, p_url: null });
            const ph = await getEventPhotos(id);
            setPhotos(ph);
            setEv((e: any) => ({ ...e, photo_url: ph.length ? ph[0].url : null }));
          } catch (e) { Alert.alert('Не удалось удалить фото', 'Попробуй ещё раз.'); }
          finally { setPhotoBusy(false); }
        },
      },
    ]);
  };

  const reportPhoto = (url: string) => {
    const sendReport = async (reason: string) => {
      try {
        await supabase.from('photo_reports').insert({ reporter_id: userId, event_id: id, photo_url: url, reason });
        Alert.alert('Спасибо', 'Жалоба отправлена на проверку.');
      } catch (e) { Alert.alert('Не удалось отправить', 'Попробуй ещё раз.'); }
    };
    Alert.alert('Пожаловаться на фото', 'Выбери причину', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Оскорбительное', onPress: () => sendReport('offensive') },
      { text: 'Спам/реклама', onPress: () => sendReport('spam') },
      { text: 'Другое', onPress: () => sendReport('other') },
    ]);
  };

  const deleteEvent = () => {
    Alert.alert('Удалить событие?', 'Событие и его чат удалятся для всех. Это необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase.rpc('delete_event', { p_event_id: id });
            if (error) throw error;
            router.back();
          } catch (e) { Alert.alert('Не удалось удалить', 'Попробуй ещё раз.'); }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#F5C400" />
      </View>
    );
  }

  if (!ev) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.muted}>Событие не найдено</Text>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}><Text style={styles.backLinkTxt}>← Назад</Text></TouchableOpacity>
      </View>
    );
  }

  const when = ev.starts_at ? ev.starts_at : (ev.is_now ? '🟢 Прямо сейчас' : 'Время не указано');
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
                  <Image source={{ uri: p.url }} style={styles.photo} contentFit="cover" />
                  <View style={styles.photoActions}>
                    <TouchableOpacity style={styles.photoBtn} onPress={() => reportPhoto(p.url)}><Text style={styles.photoBtnTxt}>⚑</Text></TouchableOpacity>
                    {isCreator && <TouchableOpacity style={styles.photoBtn} onPress={() => removePhoto(p.id)} disabled={photoBusy}><Text style={styles.photoBtnTxt}>🗑</Text></TouchableOpacity>}
                  </View>
                </View>
              ))}
            </ScrollView>
            {gallery.length > 1 && <View style={styles.countBadge}><Text style={styles.countTxt}>{gallery.length} фото</Text></View>}
            {isCreator && <TouchableOpacity style={styles.addMore} onPress={addPhotos} disabled={photoBusy}><Text style={styles.addMoreTxt}>＋</Text></TouchableOpacity>}
            {photoBusy && <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>}
          </View>
        ) : isCreator ? (
          <TouchableOpacity style={styles.addPhoto} onPress={addPhotos} disabled={photoBusy}>
            <Text style={styles.addPhotoTxt}>{photoBusy ? 'Загрузка…' : '📷 Добавить фото события'}</Text>
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
              <Text style={styles.creatorLabel}>Организатор</Text>
              <Text style={styles.creatorName}>{creator?.name || 'Аноним'} {ev.creator_id ? '›' : ''}</Text>
            </View>
          </TouchableOpacity>

          {/* Info */}
          <View style={styles.infoRow}><Text style={styles.infoIcon}>📅</Text><Text style={styles.infoTxt}>{when}</Text></View>
          {ev.location ? <View style={styles.infoRow}><Text style={styles.infoIcon}>📍</Text><Text style={styles.infoTxt}>{ev.location}</Text></View> : null}
          <View style={styles.infoRow}><Text style={styles.infoIcon}>👥</Text><Text style={styles.infoTxt}>{ev.people}/{ev.max_people} участников</Text></View>

          {/* Map */}
          <View style={styles.miniMap}>
            <WebView originWhitelist={['*']} source={{ html: buildEventMapHtml(ev.lat, ev.lng) }} scrollEnabled={false} style={{ flex: 1 }} pointerEvents="none" />
          </View>

          {/* Join */}
          <TouchableOpacity style={[styles.joinBtn, joined && styles.joinBtnDone]} onPress={toggleJoin} disabled={joining}>
            <Text style={[styles.joinTxt, joined && styles.joinTxtDone]}>
              {joining ? '…' : joined ? '✓ Вы участвуете — выйти' : 'Join — присоединиться'}
            </Text>
          </TouchableOpacity>

          {/* Chat */}
          <TouchableOpacity style={styles.chatBtn} onPress={openChat}>
            <Text style={styles.chatTxt}>💬 Открыть чат события</Text>
          </TouchableOpacity>

          {isCreator && (
            <TouchableOpacity style={styles.editBtn} onPress={() => router.push(`/edit-event/${id}` as any)}>
              <Text style={styles.editTxt}>✏ Редактировать событие</Text>
            </TouchableOpacity>
          )}

          {isCreator && (
            <TouchableOpacity style={styles.delBtn} onPress={deleteEvent}>
              <Text style={styles.delTxt}>🗑 Удалить событие</Text>
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
  backLinkTxt: { color: '#C49B00', fontWeight: '700' },
  backFab: { position: 'absolute', top: 48, left: 14, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(17,17,16,0.7)', alignItems: 'center', justifyContent: 'center' },
  backFabTxt: { color: '#fff', fontSize: 30, lineHeight: 30, marginTop: -3 },
  photoWrap: { width: '100%', height: 240, backgroundColor: '#eee' },
  slide: { width: SCREEN_W, height: 240 },
  photo: { width: SCREEN_W, height: 240 },
  countBadge: { position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: 'rgba(17,17,16,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countTxt: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  addMore: { position: 'absolute', bottom: 10, right: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: '#F5C400', alignItems: 'center', justifyContent: 'center' },
  addMoreTxt: { fontSize: 24, fontWeight: '700', color: '#111' },
  photoActions: { position: 'absolute', top: 48, right: 12, flexDirection: 'row', gap: 6 },
  photoBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(17,17,16,0.7)', alignItems: 'center', justifyContent: 'center' },
  photoBtnTxt: { color: '#fff', fontSize: 16 },
  photoOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  addPhoto: { margin: 16, marginTop: 56, height: 120, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E5DF', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  addPhotoTxt: { fontSize: 14, fontWeight: '600', color: '#888' },
  noPhoto: { width: '100%', height: 160, backgroundColor: '#111110', alignItems: 'center', justifyContent: 'center' },
  noPhotoEmoji: { fontSize: 64 },
  body: { padding: 18 },
  title: { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 14 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E5DF', padding: 12, marginBottom: 14 },
  creatorAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5C400', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  creatorAvatarImg: { width: 44, height: 44 },
  creatorLabel: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase' },
  creatorName: { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  infoIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  infoTxt: { fontSize: 15, color: '#333', flex: 1 },
  miniMap: { height: 160, borderRadius: 14, overflow: 'hidden', marginTop: 8, marginBottom: 18, borderWidth: 1, borderColor: '#E5E5DF', backgroundColor: '#e5e5df' },
  joinBtn: { backgroundColor: '#F5C400', padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  joinBtnDone: { backgroundColor: '#111' },
  joinTxt: { fontSize: 16, fontWeight: '800', color: '#111' },
  joinTxtDone: { color: '#F5C400' },
  chatBtn: { padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E5DF', backgroundColor: '#fff', marginBottom: 10 },
  chatTxt: { fontSize: 15, fontWeight: '700', color: '#111' },
  editBtn: { padding: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#111', marginBottom: 10 },
  editTxt: { fontSize: 15, fontWeight: '700', color: '#F5C400' },
  delBtn: { padding: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#FDECEC', marginTop: 4 },
  delTxt: { fontSize: 14, fontWeight: '700', color: '#C0392B' },
});
