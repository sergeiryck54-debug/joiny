import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { reverseGeocode } from '../lib/geocode';
import { useI18n } from '../lib/i18n';
import { colors, font, radius, shadow } from '../lib/theme';
import { addEventMedia, captureMedia, getEventPhotos, isVideoUrl, MediaKind, PickedMedia, pickMedia, removeEventPhoto } from '../lib/photos';
import { supabase } from '../lib/supabase';

const CATEGORIES = [
  { emoji: '⚽', label: 'Sport' }, { emoji: '🎸', label: 'Music' }, { emoji: '🍕', label: 'Food' },
  { emoji: '🎲', label: 'Games' }, { emoji: '🧘', label: 'Health' }, { emoji: '📸', label: 'Photo' },
  { emoji: '🐕', label: 'Pets' }, { emoji: '📚', label: 'Books' },
];
const catEmoji: Record<string, string> = { Sport: '⚽', Music: '🎸', Food: '🍕', Games: '🎲', Health: '🧘', Photo: '📸', Pets: '🐕', Books: '📚' };

function buildPickerHtml(center: { lat: number; lng: number }, pin: { lat: number; lng: number } | null) {
  return `
    <!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>html,body,#map{margin:0;height:100%;width:100%}</style>
    </head><body><div id="map"></div><script>
      var map = L.map('map').setView([${center.lat}, ${center.lng}], 15);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(map);
      var marker = null;
      function setMarker(lat, lng){ if (marker){ marker.setLatLng([lat,lng]); } else { marker = L.marker([lat,lng]).addTo(map); } }
      ${pin ? `setMarker(${pin.lat}, ${pin.lng});` : ''}
      map.on('click', function(e){
        setMarker(e.latlng.lat, e.latlng.lng);
        if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify({lat:e.latlng.lat, lng:e.latlng.lng})); }
      });
    </script></body></html>
  `;
}

export default function EditEventScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [place, setPlace] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [maxPeople, setMaxPeople] = useState('6');
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [startsAt, setStartsAt] = useState('');
  const [mapHtml, setMapHtml] = useState('');
  const [formScroll, setFormScroll] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [userId, setUserId] = useState('');
  const [photos, setPhotos] = useState<any[]>([]);
  const [coverUrl, setCoverUrl] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setUserId(user.id);
        const { data: ev } = await supabase.from('events').select('*').eq('id', id).single();
        if (ev) {
          setTitle(ev.title || '');
          setCategory(ev.category || '');
          setPlace(ev.location || '');
          setMaxPeople(String(ev.max_people || 6));
          setMode(ev.is_now ? 'now' : 'later');
          setStartsAt(ev.starts_at || '');
          setCoverUrl(ev.photo_url || '');
          setPhotos(await getEventPhotos(id));
          const c = { lat: ev.lat, lng: ev.lng };
          setCoords(c);
          setMapHtml(buildPickerHtml(c, c));
        }
      } catch (e) {}
      setLoading(false);
    })();
  }, [id]);

  const onMapMessage = (e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (typeof msg.lat === 'number' && typeof msg.lng === 'number') {
        setCoords({ lat: msg.lat, lng: msg.lng });
        setResolving(true);
        (async () => { const a = await reverseGeocode(msg.lat, msg.lng); if (a) setPlace(a); setResolving(false); })();
      }
    } catch (err) {}
  };

  const refreshPhotos = async () => {
    const ph = await getEventPhotos(id);
    setPhotos(ph);
    const cover = ph.map((p: any) => p.url).find((u: string) => !isVideoUrl(u)) || '';
    setCoverUrl(cover);
  };

  const uploadMediaItems = async (items: PickedMedia[]) => {
    if (!items.length || !userId) return;
    setPhotoBusy(true);
    try {
      const { rejected, unavailable } = await addEventMedia(id, userId, items);
      await refreshPhotos();
      if (unavailable > 0) Alert.alert(t('media.unavailableTitle'), t('media.unavailable'));
      else if (rejected > 0) Alert.alert(t('media.rejectedTitle'), t('media.rejected', { n: rejected }));
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
            else { await supabase.rpc('set_event_photo', { p_event_id: id, p_url: null }); setCoverUrl(''); }
            await refreshPhotos();
          } catch (e) { Alert.alert(t('ev.photoFail'), t('common.tryAgain')); }
          finally { setPhotoBusy(false); }
        },
      },
    ]);
  };

  const save = async () => {
    if (!coords || title.trim().length < 3 || !category) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_event', {
        p_event_id: id,
        p_title: title.trim(),
        p_category: category,
        p_emoji: catEmoji[category] || '📍',
        p_location: place.trim(),
        p_lat: coords.lat,
        p_lng: coords.lng,
        p_max_people: parseInt(maxPeople) || 2,
        p_is_now: mode === 'now',
        p_starts_at: mode === 'later' ? (startsAt.trim() || null) : null,
      });
      if (error) throw error;
      router.back();
    } catch (e) {
      setSaving(false);
    }
  };

  const canSave = title.trim().length > 2 && !!category && !!coords;

  if (loading) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.brandBlue} /></View>;
  }

  const gallery = photos.length ? photos : (coverUrl ? [{ id: null, url: coverUrl }] : []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Text style={styles.backTxt}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>{t('edit.header')}</Text>
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false} scrollEnabled={formScroll}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('create.eventName')}</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={t('create.eventNamePh')} placeholderTextColor={colors.textFaint} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('create.category')}</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map(c => (
              <TouchableOpacity key={c.label} style={[styles.catBtn, category === c.label && styles.catBtnOn]} onPress={() => setCategory(c.label)}>
                <Text style={styles.catEmoji}>{c.emoji}</Text>
                <Text style={[styles.catLabel, category === c.label && styles.catLabelOn]}>{t('cat.' + c.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('create.location')}</Text>
          {mapHtml ? (
            <View
              style={styles.miniMap}
              onTouchStart={() => setFormScroll(false)}
              onTouchEnd={() => setFormScroll(true)}
              onTouchCancel={() => setFormScroll(true)}
            >
              <WebView originWhitelist={['*']} source={{ html: mapHtml }} onMessage={onMapMessage} scrollEnabled={false} nestedScrollEnabled style={{ flex: 1 }} />
            </View>
          ) : null}
          <TextInput style={[styles.input, { marginTop: 8 }]} value={place} onChangeText={setPlace} placeholder={t('create.addressPh')} placeholderTextColor={colors.textFaint} />
          {resolving ? <Text style={styles.hint}>{t('create.resolving')}</Text> : <Text style={styles.hint}>{t('create.tapMapHint')}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('create.photos')} ({gallery.length}/6)</Text>
          <View style={styles.photoGrid}>
            {gallery.map((p, i) => (
              <View key={p.id || i} style={styles.thumbWrap}>
                {isVideoUrl(p.url)
                  ? <View style={[styles.thumb, styles.thumbVideo]}><Text style={{ fontSize: 26 }}>🎬</Text></View>
                  : <Image source={{ uri: p.url }} style={styles.thumb} contentFit="cover" />}
                <TouchableOpacity style={styles.thumbX} onPress={() => removePhoto(p.id)} disabled={photoBusy}><Text style={styles.thumbXTxt}>✕</Text></TouchableOpacity>
              </View>
            ))}
            {gallery.length < 6 && (
              <TouchableOpacity style={styles.thumbAdd} onPress={addPhotos} disabled={photoBusy}>
                <Text style={styles.thumbAddTxt}>{photoBusy ? '…' : '＋'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('create.maxPeople')}</Text>
          <View style={styles.counterWrap}>
            <TouchableOpacity style={styles.counterBtn} onPress={() => setMaxPeople(p => String(Math.max(2, +p - 1)))}><Text style={styles.counterBtnTxt}>−</Text></TouchableOpacity>
            <Text style={styles.counterVal}>{maxPeople}</Text>
            <TouchableOpacity style={styles.counterBtn} onPress={() => setMaxPeople(p => String(Math.min(50, +p + 1)))}><Text style={styles.counterBtnTxt}>+</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.modeWrap}>
          <TouchableOpacity style={[styles.modeBtn, mode === 'now' && styles.modeBtnOn]} onPress={() => setMode('now')}><Text style={[styles.modeTxt, mode === 'now' && styles.modeTxtOn]}>{t('create.rightNow')}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, mode === 'later' && styles.modeBtnOn]} onPress={() => setMode('later')}><Text style={[styles.modeTxt, mode === 'later' && styles.modeTxtOn]}>{t('create.planAhead')}</Text></TouchableOpacity>
        </View>

        {mode === 'later' && (
          <View style={styles.field}>
            <Text style={styles.label}>{t('create.dateTime')}</Text>
            <TextInput style={styles.input} value={startsAt} onChangeText={setStartsAt} placeholder={t('create.dateTimePh')} placeholderTextColor={colors.textFaint} />
          </View>
        )}

        <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnOff]} disabled={!canSave || saving} onPress={save}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>{t('common.save')}</Text>}
        </TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.brandBlueDeep, paddingTop: 56, paddingBottom: 14, paddingHorizontal: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#fff', fontSize: 34, lineHeight: 34, marginTop: -4 },
  headerTitle: { color: '#fff', fontSize: 18, fontFamily: font.heading },
  form: { flex: 1, padding: 18 },
  field: { marginBottom: 20 },
  label: { fontSize: 11, fontFamily: font.bold, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, padding: 14, fontSize: 15, fontFamily: font.medium, color: colors.text, ...shadow.card },
  hint: { fontSize: 12, fontFamily: font.medium, color: colors.textMuted, marginTop: 6 },
  miniMap: { height: 180, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.soft3 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { width: 84, height: 84, borderRadius: radius.tile, overflow: 'hidden' },
  thumb: { width: 84, height: 84 },
  thumbVideo: { backgroundColor: colors.navy2, alignItems: 'center', justifyContent: 'center' },
  thumbX: { position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(22,38,62,0.75)', alignItems: 'center', justifyContent: 'center' },
  thumbXTxt: { color: '#fff', fontSize: 12, fontFamily: font.bold },
  thumbAdd: { width: 84, height: 84, borderRadius: radius.tile, borderWidth: 1.5, borderColor: colors.textFaint, borderStyle: 'dashed', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  thumbAddTxt: { fontSize: 28, color: colors.textMuted },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.tile, borderWidth: 1.5, borderColor: colors.hairline, backgroundColor: colors.surface, alignItems: 'center', gap: 4, minWidth: 72 },
  catBtnOn: { backgroundColor: colors.brandBlue, borderColor: colors.brandBlue },
  catEmoji: { fontSize: 22 },
  catLabel: { fontSize: 11, fontFamily: font.semibold, color: colors.textMuted },
  catLabelOn: { color: '#fff' },
  counterWrap: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  counterBtn: { width: 44, height: 44, borderRadius: radius.tile, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center' },
  counterBtnTxt: { fontSize: 22, fontFamily: font.bold, color: colors.text },
  counterVal: { fontSize: 24, fontFamily: font.heading, color: colors.text, minWidth: 40, textAlign: 'center' },
  modeWrap: { flexDirection: 'row', backgroundColor: colors.soft2, borderRadius: radius.tile, padding: 3, marginBottom: 20 },
  modeBtn: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  modeBtnOn: { backgroundColor: colors.brandBlue },
  modeTxt: { fontSize: 13, fontFamily: font.semibold, color: colors.textMuted },
  modeTxtOn: { color: '#fff' },
  saveBtn: { backgroundColor: colors.brandBlue, padding: 16, borderRadius: radius.cta, alignItems: 'center', marginTop: 4, ...shadow.cta },
  saveBtnOff: { opacity: 0.4 },
  saveTxt: { fontSize: 16, fontFamily: font.extrabold, color: '#fff' },
});
