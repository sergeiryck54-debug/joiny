import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';

const FILTERS = ['All', '⚽', '🎸', '🧘', '🎲', '🐕'];

function buildMapHtml(location: { lat: number; lng: number }, events: any[]) {
  const markersJs = events
    .map(e => `L.marker([${e.lat}, ${e.lng}], {icon: L.divIcon({className:'',html:'<div style=\\'background:${e.now ? '#F5C400' : '#111'};color:${e.now ? '#111' : '#fff'};border-radius:12px;padding:4px 6px;font-size:14px;font-weight:700;white-space:nowrap\\'>${e.category} ${e.people}/${e.max}</div>',iconSize:[40,28]})}).addTo(map).bindPopup('${e.title}');`)
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
    </script></body></html>
  `;
}

export default function MapScreen() {
  const [filter, setFilter] = useState('All');
  const [joined, setJoined] = useState<string[]>([]);
  const [joining, setJoining] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbEvents, setDbEvents] = useState<any[]>([]);
  const [mapHtml, setMapHtml] = useState('');

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
      setLocation(loc);
      try {
        const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false });
        const mapped = (data || []).map((e: any) => ({
          id: e.id, title: e.title, category: e.emoji, lat: e.lat, lng: e.lng,
          people: e.people, max: e.max_people, now: e.is_now, location: e.location,
        }));
        setDbEvents(mapped);
        // Build the map once from the initial snapshot so joining doesn't reload it.
        setMapHtml(buildMapHtml(loc, mapped));
        // Which events has the current user already joined?
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: parts } = await supabase.from('event_participants').select('event_id').eq('user_id', user.id);
          if (parts) setJoined(parts.map((p: any) => p.event_id));
        }
      } catch (e) {}
      setLoading(false);
    })();
  }, []);
 

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
        Alert.alert('Событие заполнено', 'Все места уже заняты.');
      }
    } finally {
      setJoining(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#F5C400" />
        <Text style={styles.loadingTxt}>Finding your location...</Text>
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
        />
      </View>

      <View style={styles.statsBar}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{events.filter(e => e.now).length}</Text>
          <Text style={styles.statLbl}>Now</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{events.length}</Text>
          <Text style={styles.statLbl}>Nearby</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>147</Text>
          <Text style={styles.statLbl}>People</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filtersContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.ftag, filter === f && styles.ftagActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.ftagTxt, filter === f && styles.ftagTxtActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {filtered.map(event => (
          <View key={event.id} style={styles.card}>
            <View style={styles.cardLeft}>
              <Text style={styles.cardEmoji}>{event.category}</Text>
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{event.title}</Text>
              {event.location ? <Text style={styles.cardLoc} numberOfLines={1}>📍 {event.location}</Text> : null}
              <Text style={styles.cardMeta}>👥 {event.people}/{event.max} · {event.now ? '🟢 Now' : '🕐 Later'}</Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={[styles.joinBtn, joined.includes(event.id) && styles.joinBtnDone]}
                disabled={joining === event.id}
                onPress={() => toggleJoin(event.id)}
              >
                <Text style={[styles.joinTxt, joined.includes(event.id) && styles.joinTxtDone]}>
                  {joining === event.id ? '…' : joined.includes(event.id) ? '✓' : 'Join'}
                </Text>
              </TouchableOpacity>
              {joined.includes(event.id) && (
                <TouchableOpacity style={styles.chatBtn} onPress={() => router.push(`/event/${event.id}` as any)}>
                  <Text style={styles.chatBtnTxt}>💬 Chat</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/create')}>
        <Text style={styles.fabTxt}>✦ Create Event</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingTxt: { color: '#F5C400', fontSize: 16, fontWeight: '600' },
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  mapWrap: { height: 240, marginHorizontal: 12, marginTop: 52, borderRadius: 16, overflow: 'hidden', backgroundColor: '#e5e5df' },
  statsBar: { flexDirection: 'row', marginHorizontal: 12, marginTop: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E5DF', overflow: 'hidden' },
  stat: { flex: 1, padding: 10, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#E5E5DF' },
  statNum: { fontSize: 18, fontWeight: '800', color: '#111' },
  statLbl: { fontSize: 10, color: '#888', fontWeight: '600', textTransform: 'uppercase' },
  filters: { marginTop: 10, maxHeight: 44 },
  filtersContent: { paddingHorizontal: 12, gap: 7 },
  ftag: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E5DF', backgroundColor: '#fff' },
  ftagActive: { backgroundColor: '#111', borderColor: '#111' },
  ftagTxt: { fontSize: 12, fontWeight: '600', color: '#888' },
  ftagTxtActive: { color: '#F5C400' },
  list: { flex: 1, marginTop: 10, paddingHorizontal: 12 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E5E5DF' },
  cardLeft: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F2F2EE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardEmoji: { fontSize: 22 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 3 },
  cardLoc: { fontSize: 12, color: '#888', marginBottom: 3 },
  cardMeta: { fontSize: 12, color: '#888' },
  cardActions: { alignItems: 'flex-end', gap: 6 },
  joinBtn: { backgroundColor: '#111', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, minWidth: 64, alignItems: 'center' },
  joinBtnDone: { backgroundColor: '#F5C400' },
  joinTxt: { fontSize: 13, fontWeight: '700', color: '#F5C400' },
  joinTxtDone: { color: '#111' },
  chatBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E5DF', minWidth: 64, alignItems: 'center' },
  chatBtnTxt: { fontSize: 12, fontWeight: '700', color: '#111' },
  fab: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: '#111', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 50, elevation: 8 },
  fabTxt: { color: '#F5C400', fontSize: 15, fontWeight: '700' },
});