import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';

const FILTERS = ['All', '⚽', '🎸', '🧘', '🎲', '🐕'];

function buildMapHtml(location: { lat: number; lng: number }, events: any[]) {
  const markersJs = events
    .map(e => `L.marker([${e.lat}, ${e.lng}], {icon: L.divIcon({className:'',html:'<div style=\\'background:${e.now ? '#2FB6A8' : '#16263F'};color:${e.now ? '#16263F' : '#fff'};border-radius:12px;padding:4px 6px;font-size:14px;font-weight:700;white-space:nowrap\\'>${e.category} ${e.people}/${e.max}</div>',iconSize:[40,28]})}).addTo(map).on('click', function(){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify({type:'event', id:'${e.id}'})); } });`)
    .join('\n');
  return `
    <!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>html,body,#map{margin:0;height:100%;width:100%}</style>
    </head><body><div id="map"></div><script>
      var map = L.map('map').setView([${location.lat}, ${location.lng}], 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(map);
      L.circleMarker([${location.lat}, ${location.lng}], {radius:8,color:'#2563eb',fillColor:'#2563eb',fillOpacity:1}).addTo(map).bindPopup('You are here');
      ${markersJs}
      var pickMarker = null;
      map.on('click', function(e){
        if (pickMarker) { map.removeLayer(pickMarker); }
        pickMarker = L.marker(e.latlng).addTo(map);
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'mapclick', lat:e.latlng.lat, lng:e.latlng.lng}));
        }
      });
    </script></body></html>
  `;
}

export default function MapScreen() {
  const { t } = useI18n();
  const [filter, setFilter] = useState('All');
  const [joined, setJoined] = useState<string[]>([]);
  const [joining, setJoining] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbEvents, setDbEvents] = useState<any[]>([]);
  const [mapHtml, setMapHtml] = useState('');
  const [userId, setUserId] = useState('');
  const [likedEvents, setLikedEvents] = useState<string[]>([]);
  // Map-tap creation is armed only after pressing the Create Event button.
  const [placing, setPlacing] = useState(false);

  const locRef = useRef<{ lat: number; lng: number } | null>(null);
  const sigRef = useRef('');
  const firstFocus = useRef(true);

  const fetchEvents = useCallback(async (loc: { lat: number; lng: number } | null) => {
    try {
      const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false });
      const mapped = (data || []).map((e: any) => ({
        id: e.id, title: e.title, category: e.emoji, lat: e.lat, lng: e.lng,
        people: e.people, max: e.max_people, now: e.is_now, location: e.location, creator: e.creator_id, photo: e.photo_url, likes: e.likes,
      }));
      setDbEvents(mapped);
      // Rebuild the map only when the event set actually changed (avoids reload flicker).
      const sig = mapped.map((e: any) => `${e.id}:${e.people}`).join(',');
      if (loc && sig !== sigRef.current) {
        sigRef.current = sig;
        setMapHtml(buildMapHtml(loc, mapped));
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: parts } = await supabase.from('event_participants').select('event_id').eq('user_id', user.id);
        if (parts) setJoined(parts.map((p: any) => p.event_id));
        const { data: lks } = await supabase.from('event_likes').select('event_id').eq('user_id', user.id);
        if (lks) setLikedEvents(lks.map((l: any) => l.event_id));
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    (async () => {
      let loc = { lat: 12.9236, lng: 100.8825 };
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch (e) {}
      locRef.current = loc;
      setLocation(loc);
      await fetchEvents(loc);
      setLoading(false);
    })();
  }, [fetchEvents]);

  // Re-fetch when returning to the Map tab so newly created events appear.
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) { firstFocus.current = false; return; }
      fetchEvents(locRef.current);
    }, [fetchEvents])
  );
 

  const events = dbEvents;

  const filtered = events.filter(e => filter === 'All' || e.category === filter);

  const toggleJoin = async (id: string) => {
    if (joining) return;
    const wasJoined = joined.includes(id);
    setJoining(id);
    // Optimistic update
    setJoined(prev => wasJoined ? prev.filter(i => i !== id) : [...prev, id]);
    setDbEvents(prev => prev.map(e => e.id === id ? { ...e, people: Math.max(0, (e.people || 0) + (wasJoined ? -1 : 1)) } : e));
    try {
      const { data, error } = await supabase.rpc('toggle_join', { p_event_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        // Reconcile with server truth
        setDbEvents(prev => prev.map(e => e.id === id ? { ...e, people: row.people } : e));
        setJoined(prev => {
          const has = prev.includes(id);
          if (row.joined && !has) return [...prev, id];
          if (!row.joined && has) return prev.filter(i => i !== id);
          return prev;
        });
      }
    } catch (e: any) {
      // Revert optimistic update on failure
      setJoined(prev => wasJoined ? [...prev, id] : prev.filter(i => i !== id));
      setDbEvents(prev => prev.map(e => e.id === id ? { ...e, people: Math.max(0, (e.people || 0) + (wasJoined ? 1 : -1)) } : e));
      if (String(e?.message || '').includes('full')) {
        Alert.alert(t('map.full'), t('map.fullMsg'));
      }
    } finally {
      setJoining(null);
    }
  };

  const deleteEvent = (id: string) => {
    Alert.alert(t('map.delQ'), t('map.delMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase.rpc('delete_event', { p_event_id: id });
            if (error) throw error;
            const next = dbEvents.filter(e => e.id !== id);
            setDbEvents(next);
            setJoined(prev => prev.filter(i => i !== id));
            if (location) setMapHtml(buildMapHtml(location, next));
          } catch (e) {
            Alert.alert(t('map.delFail'), t('common.tryAgain'));
          }
        },
      },
    ]);
  };

  const toggleEventLike = async (id: string) => {
    const was = likedEvents.includes(id);
    setLikedEvents(prev => was ? prev.filter(i => i !== id) : [...prev, id]);
    setDbEvents(prev => prev.map(e => e.id === id ? { ...e, likes: Math.max(0, (e.likes || 0) + (was ? -1 : 1)) } : e));
    try {
      const { data, error } = await supabase.rpc('toggle_event_like', { p_event_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setDbEvents(prev => prev.map(e => e.id === id ? { ...e, likes: row.likes } : e));
        setLikedEvents(prev => {
          const has = prev.includes(id);
          if (row.liked && !has) return [...prev, id];
          if (!row.liked && has) return prev.filter(i => i !== id);
          return prev;
        });
      }
    } catch (e) {
      setLikedEvents(prev => was ? [...prev, id] : prev.filter(i => i !== id));
      setDbEvents(prev => prev.map(e => e.id === id ? { ...e, likes: Math.max(0, (e.likes || 0) + (was ? 1 : -1)) } : e));
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2FB6A8" />
        <Text style={styles.loadingTxt}>{t('map.finding')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapWrap}>
        <WebView
          originWhitelist={['*']}
          source={{ html: mapHtml }}
          style={{ flex: 1 }}
          scrollEnabled={false}
          onMessage={(ev) => {
            try {
              const msg = JSON.parse(ev.nativeEvent.data);
              if (msg.type === 'event') {
                router.push(`/event/${msg.id}` as any);
              } else if (msg.type === 'mapclick' && placing) {
                // Only create when the user has armed placement via the Create Event button.
                setPlacing(false);
                router.push(`/create?lat=${msg.lat}&lng=${msg.lng}` as any);
              }
            } catch (e) {}
          }}
        />
        {placing && (
          <View style={styles.mapHint} pointerEvents="none">
            <Text style={styles.mapHintTxt}>{t('map.tapHint')}</Text>
          </View>
        )}
      </View>

      <View style={styles.statsBar}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{events.filter(e => e.now).length}</Text>
          <Text style={styles.statLbl}>{t('map.now')}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{events.length}</Text>
          <Text style={styles.statLbl}>{t('map.nearby')}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{events.reduce((s, e) => s + (e.people || 0), 0)}</Text>
          <Text style={styles.statLbl}>{t('map.people')}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filtersContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.ftag, filter === f && styles.ftagActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.ftagTxt, filter === f && styles.ftagTxtActive]}>{f === 'All' ? t('map.all') : f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {filtered.map(event => (
          <View key={event.id} style={styles.card}>
            <TouchableOpacity style={styles.cardMain} onPress={() => router.push(`/event/${event.id}` as any)} activeOpacity={0.7}>
              <View style={styles.cardLeft}>
                {event.photo ? (
                  <Image source={{ uri: event.photo }} style={styles.cardPhoto} contentFit="cover" />
                ) : (
                  <Text style={styles.cardEmoji}>{event.category}</Text>
                )}
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{event.title}</Text>
                {event.location ? <Text style={styles.cardLoc} numberOfLines={1}>📍 {event.location}</Text> : null}
                <Text style={styles.cardMeta}>👥 {event.people}/{event.max} · {event.now ? t('common.now') : t('common.later')}</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.likeBtn} onPress={() => toggleEventLike(event.id)}>
                <Text style={styles.likeBtnTxt}>{likedEvents.includes(event.id) ? '❤️' : '🤍'} {event.likes || 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.joinBtn, joined.includes(event.id) && styles.joinBtnDone]}
                disabled={joining === event.id}
                onPress={() => toggleJoin(event.id)}
              >
                <Text style={[styles.joinTxt, joined.includes(event.id) && styles.joinTxtDone]}>
                  {joining === event.id ? '…' : joined.includes(event.id) ? '✓' : t('map.join')}
                </Text>
              </TouchableOpacity>
              {event.creator && event.creator === userId && (
                <TouchableOpacity style={styles.delBtn} onPress={() => deleteEvent(event.id)}>
                  <Text style={styles.delBtnTxt}>🗑</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.fab}>
        <BlurView intensity={45} tint="light" style={styles.fabBlur}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => setPlacing(p => !p)} style={styles.fabInner}>
            <Text style={styles.fabTxt}>{placing ? t('map.cancelPick') : t('map.createEvent')}</Text>
          </TouchableOpacity>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#16263F', alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingTxt: { color: '#2FB6A8', fontSize: 16, fontWeight: '600' },
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  mapWrap: { height: 240, marginHorizontal: 12, marginTop: 52, borderRadius: 16, overflow: 'hidden', backgroundColor: '#e5e5df' },
  mapHint: { position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: 'rgba(17,17,16,0.82)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  mapHintTxt: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  statsBar: { flexDirection: 'row', marginHorizontal: 12, marginTop: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E5DF', overflow: 'hidden' },
  stat: { flex: 1, padding: 10, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#E5E5DF' },
  statNum: { fontSize: 18, fontWeight: '800', color: '#16263F' },
  statLbl: { fontSize: 10, color: '#888', fontWeight: '600', textTransform: 'uppercase' },
  filters: { marginTop: 10, maxHeight: 44 },
  filtersContent: { paddingHorizontal: 12, gap: 7 },
  ftag: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E5DF', backgroundColor: '#fff' },
  ftagActive: { backgroundColor: '#16263F', borderColor: '#16263F' },
  ftagTxt: { fontSize: 12, fontWeight: '600', color: '#888' },
  ftagTxtActive: { color: '#2FB6A8' },
  list: { flex: 1, marginTop: 10, paddingHorizontal: 12 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E5E5DF' },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  cardLeft: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F2F2EE', alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  cardPhoto: { width: 44, height: 44 },
  cardEmoji: { fontSize: 22 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#16263F', marginBottom: 3 },
  cardLoc: { fontSize: 12, color: '#888', marginBottom: 3 },
  cardMeta: { fontSize: 12, color: '#888' },
  cardActions: { alignItems: 'flex-end', gap: 6 },
  likeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E5DF', minWidth: 64, alignItems: 'center' },
  likeBtnTxt: { fontSize: 12, fontWeight: '700', color: '#16263F' },
  joinBtn: { backgroundColor: '#16263F', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, minWidth: 64, alignItems: 'center' },
  joinBtnDone: { backgroundColor: '#2FB6A8' },
  joinTxt: { fontSize: 13, fontWeight: '700', color: '#2FB6A8' },
  joinTxtDone: { color: '#16263F' },
  chatBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E5DF', minWidth: 64, alignItems: 'center' },
  chatBtnTxt: { fontSize: 12, fontWeight: '700', color: '#16263F' },
  delBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, borderColor: '#F3C5C5', backgroundColor: '#FDECEC', minWidth: 64, alignItems: 'center' },
  delBtnTxt: { fontSize: 12, fontWeight: '700', color: '#C0392B' },
  fab: { position: 'absolute', bottom: 24, alignSelf: 'center', borderRadius: 50, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', shadowColor: '#16263F', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  fabBlur: { },
  fabInner: { paddingHorizontal: 26, paddingVertical: 14, backgroundColor: 'rgba(47,182,168,0.30)', alignItems: 'center', justifyContent: 'center' },
  fabTxt: { color: '#0E2A33', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
});