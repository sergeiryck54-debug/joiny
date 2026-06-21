import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { geocodeAddress, reverseGeocode } from '../lib/geocode';
import { useI18n } from '../lib/i18n';
import { addEventPhotos, pickImagesBase64 } from '../lib/photos';
import { supabase } from '../lib/supabase';

const CATEGORIES = [
  { emoji: '⚽', label: 'Sport' },
  { emoji: '🎸', label: 'Music' },
  { emoji: '🍕', label: 'Food' },
  { emoji: '🎲', label: 'Games' },
  { emoji: '🧘', label: 'Health' },
  { emoji: '📸', label: 'Photo' },
  { emoji: '🐕', label: 'Pets' },
  { emoji: '📚', label: 'Books' },
];

// Interactive picker map: tap to drop/move a pin and post its coords back to RN.
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
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({lat:e.latlng.lat, lng:e.latlng.lng}));
        }
      });
    </script></body></html>
  `;
}

export default function CreateScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [place, setPlace] = useState('');
  const [maxPeople, setMaxPeople] = useState('6');
  const [startsAt, setStartsAt] = useState('');
  const [created, setCreated] = useState(false);
  const [saving, setSaving] = useState(false);
  // Exact point picked on the map (if the user arrived by tapping the map).
  const [pinned, setPinned] = useState<{ lat: number; lng: number } | null>(null);
  const [addrEdited, setAddrEdited] = useState(false);
  const [resolvingAddr, setResolvingAddr] = useState(false);
  // Optional event photos (base64 kept until publish, then uploaded as a gallery).
  const [photos, setPhotos] = useState<string[]>([]);
  const [mapHtml, setMapHtml] = useState('');
  // Disable form scroll while panning the mini-map, so vertical drags reach the map.
  const [formScroll, setFormScroll] = useState(true);

  const categoryEmoji: Record<string, string> = { Sport: '⚽', Music: '🎸', Food: '🍕', Games: '🎲', Health: '🧘', Photo: '📸', Pets: '🐕', Books: '📚' };

  // Arrived from a map tap → pin the exact spot and prefill its address.
  useEffect(() => {
    const la = params.lat ? parseFloat(params.lat) : NaN;
    const ln = params.lng ? parseFloat(params.lng) : NaN;
    if (!isNaN(la) && !isNaN(ln)) {
      setPinned({ lat: la, lng: ln });
      setAddrEdited(false);
      setResolvingAddr(true);
      (async () => {
        const addr = await reverseGeocode(la, ln);
        if (addr) setPlace(addr);
        setResolvingAddr(false);
      })();
    }
  }, [params.lat, params.lng]);

  // Build the picker map once — centred on the tapped point, the user's GPS, or a default.
  useEffect(() => {
    (async () => {
      let center = { lat: 12.9236, lng: 100.8825 };
      const la = params.lat ? parseFloat(params.lat) : NaN;
      const ln = params.lng ? parseFloat(params.lng) : NaN;
      let pin: { lat: number; lng: number } | null = null;
      if (!isNaN(la) && !isNaN(ln)) { center = { lat: la, lng: ln }; pin = center; }
      else {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          }
        } catch (e) {}
      }
      setMapHtml(buildPickerHtml(center, pin));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tapped the picker map → pin that exact point and resolve its address.
  const onMapMessage = (ev: any) => {
    try {
      const msg = JSON.parse(ev.nativeEvent.data);
      if (typeof msg.lat === 'number' && typeof msg.lng === 'number') {
        setPinned({ lat: msg.lat, lng: msg.lng });
        setAddrEdited(false);
        setResolvingAddr(true);
        (async () => {
          const addr = await reverseGeocode(msg.lat, msg.lng);
          if (addr) setPlace(addr);
          setResolvingAddr(false);
        })();
      }
    } catch (e) {}
  };

  const pickEventPhoto = async () => {
    try {
      const list = await pickImagesBase64(6 - photos.length);
      if (list.length) setPhotos(prev => [...prev, ...list].slice(0, 6));
    } catch (e) {}
  };

  const publishEvent = async () => {
    setSaving(true);
    let lat = 12.9236, lng = 100.8825;
    if (pinned) {
      // A point was picked on the map — it's authoritative.
      lat = pinned.lat; lng = pinned.lng;
    } else {
      // No pin: try geocoding the typed address, then fall back to GPS.
      const geo = await geocodeAddress(place);
      if (geo) {
        lat = geo.lat; lng = geo.lng;
      } else {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({});
            lat = loc.coords.latitude; lng = loc.coords.longitude;
          }
        } catch (e) {}
      }
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: ev } = await supabase.from('events').insert({
        title, category, emoji: categoryEmoji[category] || '📍',
        location: place.trim(),
        lat, lng, people: 1, max_people: parseInt(maxPeople), is_now: mode === 'now',
        creator_id: user?.id ?? null, photo_url: null,
        starts_at: mode === 'later' ? (startsAt.trim() || null) : null,
      }).select('id').single();
      // Auto-join the creator, then upload the photo gallery (which sets the cover).
      if (ev?.id && user) {
        await supabase.from('event_participants').insert({ event_id: ev.id, user_id: user.id });
        if (photos.length) { try { await addEventPhotos(ev.id, user.id, photos); } catch (e) {} }
      }
      setCreated(true);
    } catch (e) {}
    setSaving(false);
  };

  const canCreate = title.length > 2 && category && (place.length > 2 || !!pinned);

  if (created) {
    return (
      <View style={styles.successWrap}>
        <Text style={styles.successEmoji}>🎉</Text>
        <Text style={styles.successTitle}>{t('create.doneTitle')}</Text>
        <Text style={styles.successSub}>{t('create.doneSub')}</Text>
        <TouchableOpacity style={styles.successBtn} onPress={() => { setCreated(false); setTitle(''); setCategory(''); setPlace(''); setPinned(null); setAddrEdited(false); setPhotos([]); setStartsAt(''); }}>
          <Text style={styles.successBtnTxt}>{t('create.another')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('create.header')}</Text>
        <Text style={styles.headerSub}>{t('create.headerSub')}</Text>
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false} scrollEnabled={formScroll}>

        {/* Mode toggle */}
        <View style={styles.modeWrap}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'now' && styles.modeBtnOn]}
            onPress={() => setMode('now')}
          >
            <Text style={[styles.modeTxt, mode === 'now' && styles.modeTxtOn]}>{t('create.rightNow')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'later' && styles.modeBtnOn]}
            onPress={() => setMode('later')}
          >
            <Text style={[styles.modeTxt, mode === 'later' && styles.modeTxtOn]}>{t('create.planAhead')}</Text>
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('create.eventName')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('create.eventNamePh')}
            placeholderTextColor="#aaa"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Category */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('create.category')}</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c.label}
                style={[styles.catBtn, category === c.label && styles.catBtnOn]}
                onPress={() => setCategory(c.label)}
              >
                <Text style={styles.catEmoji}>{c.emoji}</Text>
                <Text style={[styles.catLabel, category === c.label && styles.catLabelOn]}>{t('cat.' + c.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Place */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('create.location')}</Text>
          {mapHtml ? (
            <View
              style={styles.miniMap}
              onStartShouldSetResponderCapture={() => { setFormScroll(false); return false; }}
              onTouchStart={() => setFormScroll(false)}
              onTouchEnd={() => setFormScroll(true)}
              onTouchCancel={() => setFormScroll(true)}
            >
              <WebView
                originWhitelist={['*']}
                source={{ html: mapHtml }}
                onMessage={onMapMessage}
                scrollEnabled={false}
                nestedScrollEnabled
                style={{ flex: 1 }}
              />
            </View>
          ) : (
            <View style={[styles.miniMap, styles.miniMapLoading]}>
              <ActivityIndicator color="#888" />
            </View>
          )}
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder={t('create.addressPh')}
            placeholderTextColor="#aaa"
            value={place}
            onChangeText={(v) => { setPlace(v); setAddrEdited(true); }}
          />
          {resolvingAddr ? (
            <View style={styles.locHintRow}>
              <ActivityIndicator size="small" color="#888" />
              <Text style={styles.locHint}>{t('create.resolving')}</Text>
            </View>
          ) : pinned ? (
            <Text style={styles.locHint}>{t('create.pointChosen')}</Text>
          ) : (
            <Text style={styles.locHint}>{t('create.tapMapHint')}</Text>
          )}
        </View>

        {/* Photos */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('create.photos')} ({photos.length}/6)</Text>
          <View style={styles.photoGrid}>
            {photos.map((b64, i) => (
              <View key={i} style={styles.thumbWrap}>
                <Image source={{ uri: `data:image/jpeg;base64,${b64}` }} style={styles.thumb} contentFit="cover" />
                <TouchableOpacity style={styles.thumbX} onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}>
                  <Text style={styles.thumbXTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < 6 && (
              <TouchableOpacity style={styles.thumbAdd} onPress={pickEventPhoto}>
                <Text style={styles.thumbAddTxt}>＋</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Max people */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('create.maxPeople')}</Text>
          <View style={styles.counterWrap}>
            <TouchableOpacity
              style={styles.counterBtn}
              onPress={() => setMaxPeople(p => String(Math.max(2, +p - 1)))}
            >
              <Text style={styles.counterBtnTxt}>−</Text>
            </TouchableOpacity>
            <Text style={styles.counterVal}>{maxPeople}</Text>
            <TouchableOpacity
              style={styles.counterBtn}
              onPress={() => setMaxPeople(p => String(Math.min(50, +p + 1)))}
            >
              <Text style={styles.counterBtnTxt}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Time (only for later) */}
        {mode === 'later' && (
          <View style={styles.field}>
            <Text style={styles.label}>{t('create.dateTime')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('create.dateTimePh')}
              placeholderTextColor="#aaa"
              value={startsAt}
              onChangeText={setStartsAt}
            />
          </View>
        )}

        {/* Create button */}
        <TouchableOpacity
          style={[styles.createBtn, !canCreate && styles.createBtnOff]}
          disabled={!canCreate || saving}
          onPress={publishEvent}
        >
          <Text style={styles.createBtnTxt}>{t('create.publish')}</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  header: { padding: 18, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#E5E5DF' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#16263F' },
  headerSub: { fontSize: 13, color: '#888', marginTop: 2 },
  form: { flex: 1, padding: 18 },
  modeWrap: { flexDirection: 'row', backgroundColor: '#F2F2EE', borderRadius: 12, padding: 3, marginBottom: 20, borderWidth: 1, borderColor: '#E5E5DF' },
  modeBtn: { flex: 1, padding: 10, borderRadius: 9, alignItems: 'center' },
  modeBtnOn: { backgroundColor: '#16263F' },
  modeTxt: { fontSize: 13, fontWeight: '600', color: '#888' },
  modeTxtOn: { color: '#2FB6A8' },
  field: { marginBottom: 20 },
  label: { fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 0.5, marginBottom: 8 },
  locHint: { fontSize: 12, color: '#888', marginTop: 6 },
  locHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  miniMap: { height: 180, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: '#E5E5DF', backgroundColor: '#e5e5df' },
  miniMapLoading: { alignItems: 'center', justifyContent: 'center' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { width: 84, height: 84, borderRadius: 10, overflow: 'hidden' },
  thumb: { width: 84, height: 84 },
  thumbX: { position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(17,17,16,0.75)', alignItems: 'center', justifyContent: 'center' },
  thumbXTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  thumbAdd: { width: 84, height: 84, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E5DF', borderStyle: 'dashed', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  thumbAddTxt: { fontSize: 28, color: '#888' },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E5DF', borderRadius: 12, padding: 14, fontSize: 15, color: '#16263F' },
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
  createBtn: { backgroundColor: '#16263F', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  createBtnOff: { opacity: 0.4 },
  createBtnTxt: { fontSize: 17, fontWeight: '700', color: '#2FB6A8' },
  successWrap: { flex: 1, backgroundColor: '#16263F', alignItems: 'center', justifyContent: 'center', padding: 32 },
  successEmoji: { fontSize: 72, marginBottom: 20 },
  successTitle: { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 12 },
  successSub: { fontSize: 16, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  successBtn: { backgroundColor: '#2FB6A8', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  successBtnTxt: { fontSize: 16, fontWeight: '700', color: '#16263F' },
});

