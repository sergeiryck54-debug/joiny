import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { geocodeAddress, reverseGeocode } from '../lib/geocode';
import { pickImageBase64, uploadJpeg } from '../lib/photos';
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

export default function CreateScreen() {
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [place, setPlace] = useState('');
  const [maxPeople, setMaxPeople] = useState('6');
  const [created, setCreated] = useState(false);
  const [saving, setSaving] = useState(false);
  // Exact point picked on the map (if the user arrived by tapping the map).
  const [pinned, setPinned] = useState<{ lat: number; lng: number } | null>(null);
  const [addrEdited, setAddrEdited] = useState(false);
  const [resolvingAddr, setResolvingAddr] = useState(false);
  // Optional event photo (base64 kept until publish, then uploaded).
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

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

  const pickEventPhoto = async () => {
    try {
      const b64 = await pickImageBase64([4, 3]);
      if (b64) setPhotoBase64(b64);
    } catch (e) {}
  };

  const publishEvent = async () => {
    setSaving(true);
    let lat = 12.9236, lng = 100.8825;
    if (pinned && !addrEdited) {
      // Exact point picked on the map — pin there.
      lat = pinned.lat; lng = pinned.lng;
    } else {
      // Geocode the typed address so the event sits where the user said.
      const geo = await geocodeAddress(place);
      if (geo) {
        lat = geo.lat; lng = geo.lng;
      } else if (pinned) {
        lat = pinned.lat; lng = pinned.lng;
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
      let photoUrl: string | null = null;
      if (photoBase64 && user) {
        try { photoUrl = await uploadJpeg('event-photos', `${user.id}/${Date.now()}.jpg`, photoBase64); } catch (e) {}
      }
      const { data: ev } = await supabase.from('events').insert({
        title, category, emoji: categoryEmoji[category] || '📍',
        location: place.trim(),
        lat, lng, people: 1, max_people: parseInt(maxPeople), is_now: mode === 'now',
        creator_id: user?.id ?? null, photo_url: photoUrl,
      }).select('id').single();
      // Auto-join the creator so people count matches participants.
      if (ev?.id && user) {
        await supabase.from('event_participants').insert({ event_id: ev.id, user_id: user.id });
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
        <Text style={styles.successTitle}>Event Created!</Text>
        <Text style={styles.successSub}>People nearby will see your event on the map right now</Text>
        <TouchableOpacity style={styles.successBtn} onPress={() => { setCreated(false); setTitle(''); setCategory(''); setPlace(''); setPinned(null); setAddrEdited(false); setPhotoBase64(null); }}>
          <Text style={styles.successBtnTxt}>Create Another →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>New Event</Text>
        <Text style={styles.headerSub}>Tell people what you're up to</Text>
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>

        {/* Mode toggle */}
        <View style={styles.modeWrap}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'now' && styles.modeBtnOn]}
            onPress={() => setMode('now')}
          >
            <Text style={[styles.modeTxt, mode === 'now' && styles.modeTxtOn]}>⚡ Right Now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'later' && styles.modeBtnOn]}
            onPress={() => setMode('later')}
          >
            <Text style={[styles.modeTxt, mode === 'later' && styles.modeTxtOn]}>📅 Plan Ahead</Text>
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>EVENT NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Football in the park..."
            placeholderTextColor="#aaa"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Category */}
        <View style={styles.field}>
          <Text style={styles.label}>CATEGORY</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c.label}
                style={[styles.catBtn, category === c.label && styles.catBtnOn]}
                onPress={() => setCategory(c.label)}
              >
                <Text style={styles.catEmoji}>{c.emoji}</Text>
                <Text style={[styles.catLabel, category === c.label && styles.catLabelOn]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Place */}
        <View style={styles.field}>
          <Text style={styles.label}>LOCATION</Text>
          <TextInput
            style={styles.input}
            placeholder="📍 Address or place name"
            placeholderTextColor="#aaa"
            value={place}
            onChangeText={(v) => { setPlace(v); setAddrEdited(true); }}
          />
          {resolvingAddr ? (
            <View style={styles.locHintRow}>
              <ActivityIndicator size="small" color="#888" />
              <Text style={styles.locHint}>Определяем адрес точки…</Text>
            </View>
          ) : pinned && !addrEdited ? (
            <Text style={styles.locHint}>📍 Точка выбрана на карте — событие закрепится здесь</Text>
          ) : (
            <Text style={styles.locHint}>Введи адрес — событие встанет на карте по нему</Text>
          )}
        </View>

        {/* Photo */}
        <View style={styles.field}>
          <Text style={styles.label}>PHOTO</Text>
          {photoBase64 ? (
            <View>
              <Image source={{ uri: `data:image/jpeg;base64,${photoBase64}` }} style={styles.photoPreview} contentFit="cover" />
              <View style={styles.photoActions}>
                <TouchableOpacity style={styles.photoBtn} onPress={pickEventPhoto}>
                  <Text style={styles.photoBtnTxt}>Заменить</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={() => setPhotoBase64(null)}>
                  <Text style={styles.photoBtnTxt}>Убрать</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.photoPlaceholder} onPress={pickEventPhoto}>
              <Text style={styles.photoPlaceholderTxt}>📷 Добавить фото</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Max people */}
        <View style={styles.field}>
          <Text style={styles.label}>MAX PEOPLE</Text>
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
            <Text style={styles.label}>DATE & TIME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Tomorrow at 18:00"
              placeholderTextColor="#aaa"
            />
          </View>
        )}

        {/* Create button */}
        <TouchableOpacity
          style={[styles.createBtn, !canCreate && styles.createBtnOff]}
          disabled={!canCreate || saving}
          onPress={publishEvent}
        >
          <Text style={styles.createBtnTxt}>✦ Publish Event</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  header: { padding: 18, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#E5E5DF' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111' },
  headerSub: { fontSize: 13, color: '#888', marginTop: 2 },
  form: { flex: 1, padding: 18 },
  modeWrap: { flexDirection: 'row', backgroundColor: '#F2F2EE', borderRadius: 12, padding: 3, marginBottom: 20, borderWidth: 1, borderColor: '#E5E5DF' },
  modeBtn: { flex: 1, padding: 10, borderRadius: 9, alignItems: 'center' },
  modeBtnOn: { backgroundColor: '#111' },
  modeTxt: { fontSize: 13, fontWeight: '600', color: '#888' },
  modeTxtOn: { color: '#F5C400' },
  field: { marginBottom: 20 },
  label: { fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 0.5, marginBottom: 8 },
  locHint: { fontSize: 12, color: '#888', marginTop: 6 },
  locHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  photoPreview: { width: '100%', height: 170, borderRadius: 12, backgroundColor: '#eee' },
  photoActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  photoBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E5DF', backgroundColor: '#fff' },
  photoBtnTxt: { fontSize: 13, fontWeight: '700', color: '#111' },
  photoPlaceholder: { height: 100, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5DF', borderStyle: 'dashed', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  photoPlaceholderTxt: { fontSize: 14, fontWeight: '600', color: '#888' },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E5DF', borderRadius: 12, padding: 14, fontSize: 15, color: '#111' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5DF', backgroundColor: '#fff', alignItems: 'center', gap: 4, minWidth: 72 },
  catBtnOn: { backgroundColor: '#111', borderColor: '#111' },
  catEmoji: { fontSize: 22 },
  catLabel: { fontSize: 11, fontWeight: '600', color: '#888' },
  catLabelOn: { color: '#F5C400' },
  counterWrap: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  counterBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E5DF', alignItems: 'center', justifyContent: 'center' },
  counterBtnTxt: { fontSize: 22, fontWeight: '700', color: '#111' },
  counterVal: { fontSize: 24, fontWeight: '800', color: '#111', minWidth: 40, textAlign: 'center' },
  createBtn: { backgroundColor: '#111', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  createBtnOff: { opacity: 0.4 },
  createBtnTxt: { fontSize: 17, fontWeight: '700', color: '#F5C400' },
  successWrap: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 32 },
  successEmoji: { fontSize: 72, marginBottom: 20 },
  successTitle: { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 12 },
  successSub: { fontSize: 16, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  successBtn: { backgroundColor: '#F5C400', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  successBtnTxt: { fontSize: 16, fontWeight: '700', color: '#111' },
});

