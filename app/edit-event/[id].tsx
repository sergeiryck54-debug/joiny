import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { reverseGeocode } from '../lib/geocode';
import { useI18n } from '../lib/i18n';
import { addEventPhotos, getEventPhotos, pickImagesBase64, removeEventPhoto } from '../lib/photos';
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
    setCoverUrl(ph.length ? ph[0].url : '');
  };

  const addPhotos = async () => {
    if (photoBusy || !userId) return;
    try {
      const list = await pickImagesBase64(6);
      if (!list.length) return;
      setPhotoBusy(true);
      await addEventPhotos(id, userId, list);
      await refreshPhotos();
    } catch (e) {
      Alert.alert(t('ev.photoFail'), t('common.tryAgain'));
    } finally {
      setPhotoBusy(false);
    }
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
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#2FB6A8" /></View>;
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
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={t('create.eventNamePh')} placeholderTextColor="#aaa" />
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
          <TextInput style={[styles.input, { marginTop: 8 }]} value={place} onChangeText={setPlace} placeholder={t('create.addressPh')} placeholderTextColor="#aaa" />
          {resolving ? <Text style={styles.hint}>{t('create.resolving')}</Text> : <Text style={styles.hint}>{t('create.tapMapHint')}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('create.photos')} ({gallery.length}/6)</Text>
          <View style={styles.photoGrid}>
            {gallery.map((p, i) => (
              <View key={p.id || i} style={styles.thumbWrap}>
                <Image source={{ uri: p.url }} style={styles.thumb} contentFit="cover" />
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
            <TextInput style={styles.input} value={startsAt} onChangeText={setStartsAt} placeholder={t('create.dateTimePh')} placeholderTextColor="#aaa" />
          </View>
        )}

        <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnOff]} disabled={!canSave || saving} onPress={save}>
          {saving ? <ActivityIndicator color="#16263F" /> : <Text style={styles.saveTxt}>{t('common.save')}</Text>}
        </TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: '#FAFAF7', alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#16263F', paddingTop: 56, paddingBottom: 14, paddingHorizontal: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#fff', fontSize: 34, lineHeight: 34, marginTop: -4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  form: { flex: 1, padding: 18 },
  field: { marginBottom: 20 },
  label: { fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 0.5, marginBottom: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E5DF', borderRadius: 12, padding: 14, fontSize: 15, color: '#16263F' },
  hint: { fontSize: 12, color: '#888', marginTop: 6 },
  miniMap: { height: 180, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: '#E5E5DF', backgroundColor: '#e5e5df' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { width: 84, height: 84, borderRadius: 10, overflow: 'hidden' },
  thumb: { width: 84, height: 84 },
  thumbX: { position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(17,17,16,0.75)', alignItems: 'center', justifyContent: 'center' },
  thumbXTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  thumbAdd: { width: 84, height: 84, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E5DF', borderStyle: 'dashed', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  thumbAddTxt: { fontSize: 28, color: '#888' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5DF', backgroundColor: '#fff', alignItems: 'center', gap: 4, minWidth: 72 },
  catBtnOn: { backgroundColor: '#16263F', borderColor: '#16263F' },
  catEmoji: { fontSize: 22 },
  catLabel: { fontSize: 11, fontWeight: '600', color: '#888' },
  catLabelOn: { color: '#2FB6A8' },
  counterWrap: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  counterBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E5DF', alignItems: 'center', justifyContent: 'center' },
  counterBtnTxt: { fontSize: 22, fontWeight: '700', color: '#16263F' },
  counterVal: { fontSize: 24, fontWeight: '800', color: '#16263F', minWidth: 40, textAlign: 'center' },
  modeWrap: { flexDirection: 'row', backgroundColor: '#F2F2EE', borderRadius: 12, padding: 3, marginBottom: 20, borderWidth: 1, borderColor: '#E5E5DF' },
  modeBtn: { flex: 1, padding: 10, borderRadius: 9, alignItems: 'center' },
  modeBtnOn: { backgroundColor: '#16263F' },
  modeTxt: { fontSize: 13, fontWeight: '600', color: '#888' },
  modeTxtOn: { color: '#2FB6A8' },
  saveBtn: { backgroundColor: '#2FB6A8', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  saveBtnOff: { opacity: 0.4 },
  saveTxt: { fontSize: 16, fontWeight: '700', color: '#16263F' },
});
