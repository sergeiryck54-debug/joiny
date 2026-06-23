import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, LayoutAnimation, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, UIManager, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { geocodeAddress, reverseGeocode } from '../lib/geocode';
import { Lang, useI18n } from '../lib/i18n';
import { addEventMedia, captureMedia, MediaKind, PickedMedia, pickMedia } from '../lib/photos';
import { supabase } from '../lib/supabase';
import { colors, font, radius, shadow } from '../lib/theme';

// Smooth layout transitions on Android (no-op on the New Architecture, harmless on old).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const pad = (n: number) => String(n).padStart(2, '0');

// Short weekday names per language (Sun..Sat).
const WEEKDAYS: Record<Lang, string[]> = {
  EN: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  RU: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  TH: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'],
};

// Selectable time slots: every 30 min from 07:00 to 23:30.
const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 23; h++) { TIME_SLOTS.push(`${pad(h)}:00`); TIME_SLOTS.push(`${pad(h)}:30`); }

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
  const { t, lang } = useI18n();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [place, setPlace] = useState('');
  const [maxPeople, setMaxPeople] = useState('6');
  const [startsAt, setStartsAt] = useState('');
  // Date/time picker selection: day index (0 = today) + "HH:MM" slot.
  const [selDay, setSelDay] = useState<number | null>(null);
  const [selTime, setSelTime] = useState<string | null>(null);
  const previewScale = useRef(new Animated.Value(1)).current;

  // Next 14 days from today (stable within a session).
  const days = useRef(Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d;
  })).current;

  const dayLabel = (i: number, d: Date) =>
    i === 0 ? t('create.today')
      : i === 1 ? t('create.tomorrow')
        : `${WEEKDAYS[lang][d.getDay()]} ${d.getDate()}.${pad(d.getMonth() + 1)}`;

  // A little spring "pop" whenever the selection changes.
  const pop = () => {
    previewScale.setValue(0.9);
    Animated.spring(previewScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
  };

  // Keep the stored free-text date in sync with the picker selection.
  useEffect(() => {
    if (mode === 'later' && selDay !== null && selTime) {
      setStartsAt(`${dayLabel(selDay, days[selDay])} ${t('create.at')} ${selTime}`);
    } else if (mode === 'later') {
      setStartsAt('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selDay, selTime, mode, lang]);
  const [created, setCreated] = useState(false);
  const [saving, setSaving] = useState(false);
  // Exact point picked on the map (if the user arrived by tapping the map).
  const [pinned, setPinned] = useState<{ lat: number; lng: number } | null>(null);
  const [addrEdited, setAddrEdited] = useState(false);
  const [resolvingAddr, setResolvingAddr] = useState(false);
  // Optional event media (photos/videos kept until publish, then moderated + uploaded).
  const [media, setMedia] = useState<PickedMedia[]>([]);
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

  const addFromCamera = (kind: MediaKind) => async () => {
    try {
      const m = await captureMedia(kind);
      if (m) setMedia(prev => [...prev, m].slice(0, 6));
      else if (m === null) { /* cancelled or permission denied */ }
    } catch (e) { Alert.alert(t('media.fail'), t('common.tryAgain')); }
  };

  const addFromGallery = async () => {
    try {
      const list = await pickMedia(6 - media.length, true);
      if (list.length) setMedia(prev => [...prev, ...list].slice(0, 6));
    } catch (e) { Alert.alert(t('media.fail'), t('common.tryAgain')); }
  };

  const pickEventMedia = () => {
    Alert.alert(t('media.addTitle'), undefined, [
      { text: t('media.camera'), onPress: () => Alert.alert(t('media.cameraTitle'), undefined, [
        { text: t('media.photo'), onPress: addFromCamera('image') },
        { text: t('media.video'), onPress: addFromCamera('video') },
        { text: t('common.cancel'), style: 'cancel' },
      ]) },
      { text: t('media.gallery'), onPress: addFromGallery },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
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
      // Auto-join the creator, then moderate + upload the media gallery (sets the cover).
      if (ev?.id && user) {
        await supabase.from('event_participants').insert({ event_id: ev.id, user_id: user.id });
        if (media.length) {
          try {
            const { rejected, unavailable } = await addEventMedia(ev.id, user.id, media);
            if (unavailable > 0) Alert.alert(t('media.unavailableTitle'), t('media.unavailable'));
            else if (rejected > 0) Alert.alert(t('media.rejectedTitle'), t('media.rejected', { n: rejected }));
          } catch (e) {}
        }
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
        <TouchableOpacity style={styles.successBtn} onPress={() => { setCreated(false); setTitle(''); setCategory(''); setPlace(''); setPinned(null); setAddrEdited(false); setMedia([]); setStartsAt(''); setSelDay(null); setSelTime(null); }}>
          <Text style={styles.successBtnTxt}>{t('create.another')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/explore' as any))} style={styles.headerX}>
          <Text style={styles.headerXTxt}>✕</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('create.header')}</Text>
          <Text style={styles.headerSub}>{t('create.headerSub')}</Text>
        </View>
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false} scrollEnabled={formScroll}>

        {/* Mode toggle */}
        <View style={styles.modeWrap}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'now' && styles.modeBtnOn]}
            onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setMode('now'); }}
          >
            <Text style={[styles.modeTxt, mode === 'now' && styles.modeTxtOn]}>{t('create.rightNow')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'later' && styles.modeBtnOn]}
            onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setMode('later'); }}
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

        {/* Media (photos + videos) */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('create.photos')} ({media.length}/6)</Text>
          <View style={styles.photoGrid}>
            {media.map((m, i) => (
              <View key={i} style={styles.thumbWrap}>
                {m.base64
                  ? <Image source={{ uri: `data:image/jpeg;base64,${m.base64}` }} style={styles.thumb} contentFit="cover" />
                  : <View style={[styles.thumb, styles.thumbVideoFallback]}><Text style={{ fontSize: 28 }}>🎬</Text></View>}
                {m.type === 'video' && <View style={styles.playBadge}><Text style={styles.playBadgeTxt}>▶</Text></View>}
                <TouchableOpacity style={styles.thumbX} onPress={() => setMedia(prev => prev.filter((_, idx) => idx !== i))}>
                  <Text style={styles.thumbXTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {media.length < 6 && (
              <TouchableOpacity style={styles.thumbAdd} onPress={pickEventMedia}>
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

        {/* Date & time picker (only for later) */}
        {mode === 'later' && (
          <View style={styles.field}>
            <Text style={styles.label}>{t('create.day')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {days.map((d, i) => {
                const on = selDay === i;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dayChip, on && styles.chipOn]}
                    onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelDay(i); pop(); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.dayChipTop, on && styles.chipTxtOn]}>
                      {i === 0 ? t('create.today') : i === 1 ? t('create.tomorrow') : WEEKDAYS[lang][d.getDay()]}
                    </Text>
                    {i > 1 && <Text style={[styles.dayChipNum, on && styles.chipTxtOn]}>{d.getDate()}.{pad(d.getMonth() + 1)}</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {selDay !== null && (
              <>
                <Text style={[styles.label, { marginTop: 16 }]}>{t('create.time')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {TIME_SLOTS.map(tm => {
                    const on = selTime === tm;
                    return (
                      <TouchableOpacity
                        key={tm}
                        style={[styles.timeChip, on && styles.chipOn]}
                        onPress={() => { setSelTime(tm); pop(); }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.timeChipTxt, on && styles.chipTxtOn]}>{tm}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {selDay !== null && selTime && (
              <Animated.View style={[styles.previewPill, { transform: [{ scale: previewScale }] }]}>
                <Text style={styles.previewTxt}>📅 {dayLabel(selDay, days[selDay])} {t('create.at')} {selTime}</Text>
              </Animated.View>
            )}
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
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18, paddingTop: 58, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  headerX: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  headerXTxt: { fontSize: 20, color: colors.textMuted },
  headerTitle: { fontSize: 26, fontFamily: font.heading, color: colors.text },
  headerSub: { fontSize: 13, fontFamily: font.medium, color: colors.textMuted, marginTop: 1 },
  form: { flex: 1, padding: 18 },
  modeWrap: { flexDirection: 'row', backgroundColor: colors.soft2, borderRadius: radius.tile, padding: 3, marginBottom: 20 },
  modeBtn: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  modeBtnOn: { backgroundColor: colors.brandBlue },
  modeTxt: { fontSize: 13, fontFamily: font.semibold, color: colors.textMuted },
  modeTxtOn: { color: '#fff' },
  field: { marginBottom: 20 },
  label: { fontSize: 11, fontFamily: font.bold, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  locHint: { fontSize: 12, fontFamily: font.medium, color: colors.textMuted, marginTop: 6 },
  locHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  miniMap: { height: 180, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.soft3 },
  miniMapLoading: { alignItems: 'center', justifyContent: 'center' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { width: 84, height: 84, borderRadius: radius.tile, overflow: 'hidden' },
  thumb: { width: 84, height: 84 },
  thumbVideoFallback: { backgroundColor: colors.navy2, alignItems: 'center', justifyContent: 'center' },
  playBadge: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playBadgeTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 24, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  thumbX: { position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(22,38,62,0.75)', alignItems: 'center', justifyContent: 'center' },
  thumbXTxt: { color: '#fff', fontSize: 12, fontFamily: font.bold },
  thumbAdd: { width: 84, height: 84, borderRadius: radius.tile, borderWidth: 1.5, borderColor: colors.textFaint, borderStyle: 'dashed', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  thumbAddTxt: { fontSize: 28, color: colors.textMuted },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, padding: 14, fontSize: 15, fontFamily: font.medium, color: colors.text, ...shadow.card },
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
  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  dayChip: { minWidth: 58, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.tile, borderWidth: 1.5, borderColor: colors.hairline, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dayChipTop: { fontSize: 13, fontFamily: font.bold, color: colors.text },
  dayChipNum: { fontSize: 11, fontFamily: font.semibold, color: colors.textMuted, marginTop: 2 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.tile, borderWidth: 1.5, borderColor: colors.hairline, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  timeChipTxt: { fontSize: 14, fontFamily: font.bold, color: colors.text },
  chipOn: { backgroundColor: colors.brandBlue, borderColor: colors.brandBlue },
  chipTxtOn: { color: '#fff' },
  previewPill: { alignSelf: 'flex-start', marginTop: 16, backgroundColor: colors.chipBg, borderWidth: 1.5, borderColor: colors.brandTeal, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  previewTxt: { fontSize: 15, fontFamily: font.extrabold, color: colors.text },
  createBtn: { backgroundColor: colors.brandBlue, padding: 16, borderRadius: radius.cta, alignItems: 'center', marginTop: 8, ...shadow.cta },
  createBtnOff: { opacity: 0.4 },
  createBtnTxt: { fontSize: 17, fontFamily: font.extrabold, color: '#fff' },
  successWrap: { flex: 1, backgroundColor: colors.navy2, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successEmoji: { fontSize: 72, marginBottom: 20 },
  successTitle: { fontSize: 32, fontFamily: font.heading, color: '#fff', marginBottom: 12 },
  successSub: { fontSize: 16, fontFamily: font.medium, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  successBtn: { backgroundColor: colors.brandTeal, paddingHorizontal: 28, paddingVertical: 14, borderRadius: radius.cta },
  successBtnTxt: { fontSize: 16, fontFamily: font.extrabold, color: '#0E2A33' },
});

