import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

const ALL_INTERESTS = ['⚽ Sport', '🎸 Music', '🏃 Running', '📸 Photo', '🐕 Dog Walks', '🎲 Board Games', '🍕 Food', '📚 Books', '🧘 Yoga', '🎨 Art'];

export default function ProfileScreen() {
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [myEvents, setMyEvents] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
          }
          const { data: evts } = await supabase.from('events').select('*').order('created_at', { ascending: false }).limit(10);
          if (evts) setMyEvents(evts);
        }
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

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

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#F5C400" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>🧑</Text>
        </View>
        {editing ? (
          <>
            <TextInput style={styles.editInput} placeholder="Your name" placeholderTextColor="rgba(255,255,255,0.3)" value={name} onChangeText={setName} />
            <TextInput style={styles.editInput} placeholder="Bio" placeholderTextColor="rgba(255,255,255,0.3)" value={bio} onChangeText={setBio} />
            <TextInput style={styles.editInput} placeholder="City" placeholderTextColor="rgba(255,255,255,0.3)" value={city} onChangeText={setCity} />
            <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
              {saving ? <ActivityIndicator color="#111" /> : <Text style={styles.saveBtnTxt}>Save</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.name}>{name || 'Set your name'}</Text>
            <Text style={styles.bio}>{bio || 'Add a short bio'}</Text>
            <Text style={styles.location}>📍 {city || 'Your city'} · {email}</Text>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editTxt}>✏ Edit Profile</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statN}>{myEvents.length}</Text>
          <Text style={styles.statL}>Events</Text>
        </View>
        <View style={[styles.stat, styles.statBorder]}>
          <Text style={styles.statN}>{interests.length}</Text>
          <Text style={styles.statL}>Interests</Text>
        </View>
        <View style={[styles.stat, styles.statBorder]}>
          <Text style={styles.statN}>—</Text>
          <Text style={styles.statL}>Friends</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Interests</Text>
        <View style={styles.tagsWrap}>
          {ALL_INTERESTS.map(tag => (
            <TouchableOpacity
              key={tag}
              style={[styles.tag, interests.includes(tag) && styles.tagOn]}
              onPress={() => { toggleInterest(tag); }}
            >
              <Text style={[styles.tagTxt, interests.includes(tag) && styles.tagTxtOn]}>{tag}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.saveInterests} onPress={saveProfile} disabled={saving}>
          <Text style={styles.saveInterestsTxt}>{saving ? 'Saving...' : 'Save interests'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Events</Text>
        {myEvents.length === 0 && <Text style={styles.empty}>No events yet — create one!</Text>}
        {myEvents.map(e => (
          <View key={e.id} style={styles.eventCard}>
            <Text style={styles.eventEmoji}>{e.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>{e.title}</Text>
              {e.location ? <Text style={styles.eventMeta} numberOfLines={1}>📍 {e.location}</Text> : null}
              <Text style={styles.eventMeta}>👥 {e.people}/{e.max_people} · {e.is_now ? '🟢 Now' : '🕐 Later'}</Text>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.signOut} onPress={async () => { await supabase.auth.signOut({ scope: 'global' }); router.replace('/'); }}>
        <Text style={styles.signOutTxt}>Sign Out</Text>
      </TouchableOpacity>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: '#FAFAF7', alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  hero: { backgroundColor: '#111110', padding: 28, paddingTop: 64, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F5C400', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarEmoji: { fontSize: 36 },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  bio: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 4 },
  location: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16 },
  editBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.1)' },
  editTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  editInput: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 12, fontSize: 14, color: '#fff', marginBottom: 8, width: '100%' },
  saveBtn: { backgroundColor: '#F5C400', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  saveBtnTxt: { fontSize: 14, fontWeight: '700', color: '#111' },
  stats: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E5E5DF', overflow: 'hidden' },
  stat: { flex: 1, padding: 14, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1, borderLeftColor: '#E5E5DF' },
  statN: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 2 },
  statL: { fontSize: 10, color: '#888', fontWeight: '600', textTransform: 'uppercase' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111', marginBottom: 12 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E5DF' },
  tagOn: { backgroundColor: '#111', borderColor: '#111' },
  tagTxt: { fontSize: 12, fontWeight: '600', color: '#111' },
  tagTxtOn: { color: '#F5C400' },
  saveInterests: { marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#111', alignItems: 'center' },
  saveInterestsTxt: { fontSize: 13, fontWeight: '700', color: '#F5C400' },
  empty: { fontSize: 13, color: '#888' },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E5DF' },
  eventEmoji: { fontSize: 24 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  eventMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  signOut: { marginHorizontal: 16, marginTop: 20, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5DF', alignItems: 'center' },
  signOutTxt: { fontSize: 14, fontWeight: '700', color: '#888' },
});