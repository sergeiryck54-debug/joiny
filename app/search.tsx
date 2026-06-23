import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from './lib/i18n';
import { supabase } from './lib/supabase';
import { colors, font, radius, shadow } from './lib/theme';

const CATEGORIES: { label: string; emoji: string; grad: readonly [string, string] }[] = [
  { label: 'Sport', emoji: '⚽', grad: ['#46D6C6', '#2A86C4'] },
  { label: 'Food', emoji: '🍕', grad: ['#F0A868', '#E06A8C'] },
  { label: 'Music', emoji: '🎸', grad: ['#7E8FE0', '#5BB8C4'] },
  { label: 'Games', emoji: '🎲', grad: ['#9AD8C7', '#3FA8C9'] },
];

export default function SearchScreen() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [requested, setRequested] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setMeId(user.id);
          const { data: me } = await supabase.from('profiles').select('interests').eq('id', user.id).single();
          setInterests(me?.interests || []);
        }
        const [{ data: ev }, { data: profs }] = await Promise.all([
          supabase.from('events').select('id, title, emoji, category, location, people, max_people, is_now, photo_url').order('created_at', { ascending: false }).limit(60),
          supabase.from('profiles').select('id, name, avatar_url, city, interests').limit(60),
        ]);
        setEvents(ev || []);
        setPeople((profs || []).filter((p: any) => p.id !== user?.id));
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  const query = q.trim().toLowerCase();
  const active = query.length > 0 || !!cat;

  const matchedEvents = useMemo(() => events.filter(e => {
    if (cat) return e.category === cat;
    if (!query) return false;
    return (e.title || '').toLowerCase().includes(query) || (e.location || '').toLowerCase().includes(query);
  }), [events, query, cat]);

  const matchedPeople = useMemo(() => {
    if (cat) return [];
    if (!query) return people; // "people nearby" when idle
    return people.filter(p => (p.name || '').toLowerCase().includes(query) || (p.city || '').toLowerCase().includes(query));
  }, [people, query, cat]);

  const sharedCount = (p: any) => (p.interests || []).filter((i: string) => interests.includes(i)).length;

  const addFriend = async (id: string) => {
    if (requested.includes(id) || !meId) return;
    setRequested(prev => [...prev, id]);
    try { await supabase.from('friendships').upsert({ user_id: meId, friend_id: id, status: 'pending' }); }
    catch (e) { setRequested(prev => prev.filter(x => x !== id)); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Text style={styles.backTxt}>‹</Text></TouchableOpacity>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={t('search.ph')}
            placeholderTextColor={colors.textFaint}
            value={q}
            onChangeText={v => { setQ(v); setCat(null); }}
            autoFocus
            returnKeyType="search"
          />
          {(q.length > 0 || cat) ? (
            <TouchableOpacity onPress={() => { setQ(''); setCat(null); }}><Text style={styles.clear}>✕</Text></TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.brandBlue} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          {!active && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('search.categories')}</Text>
              <View style={styles.catGrid}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity key={c.label} style={styles.catTileWrap} activeOpacity={0.85} onPress={() => { setCat(c.label); setQ(''); }}>
                    <LinearGradient colors={c.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.catTile}>
                      <Text style={styles.catEmoji}>{c.emoji}</Text>
                      <Text style={styles.catLabel}>{t('cat.' + c.label)}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {matchedEvents.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('search.eventsFound')}</Text>
              {matchedEvents.map(e => (
                <TouchableOpacity key={e.id} style={styles.row} activeOpacity={0.7} onPress={() => router.push(`/event/${e.id}` as any)}>
                  <View style={styles.rowIcon}>
                    {e.photo_url ? <Image source={{ uri: e.photo_url }} style={styles.rowIconImg} contentFit="cover" /> : <Text style={styles.rowEmoji}>{e.emoji}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{e.title}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>👥 {e.people}/{e.max_people}{e.location ? ` · ${e.location}` : ''}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {matchedPeople.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{active ? t('search.peopleFound') : t('search.peopleNearby')}</Text>
              {matchedPeople.map(p => {
                const shared = sharedCount(p);
                const isReq = requested.includes(p.id);
                return (
                  <View key={p.id} style={styles.row}>
                    <TouchableOpacity style={styles.personMain} activeOpacity={0.7} onPress={() => router.push(`/user/${p.id}` as any)}>
                      <View style={styles.personAv}>
                        {p.avatar_url ? <Image source={{ uri: p.avatar_url }} style={styles.personAvImg} contentFit="cover" /> : <Text style={styles.rowEmoji}>🧑</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{p.name || t('common.anon')}</Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {p.city ? `📍 ${p.city}` : ''}{shared > 0 ? `${p.city ? ' · ' : ''}${t('search.commonInterests', { n: shared })}` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.addBtn, isReq && styles.addBtnOff]} disabled={isReq} onPress={() => addFriend(p.id)}>
                      <Text style={[styles.addTxt, isReq && styles.addTxtOff]}>{isReq ? t('user.requested') : t('user.addFriend')}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {active && matchedEvents.length === 0 && matchedPeople.length === 0 && (
            <Text style={styles.none}>{t('search.none')}</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 54, paddingBottom: 12, paddingHorizontal: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  backBtn: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: colors.text, fontSize: 32, lineHeight: 32, marginTop: -3 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.soft2, borderRadius: radius.pill, paddingHorizontal: 14, height: 44 },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: font.medium, color: colors.text },
  clear: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 4 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 16, marginTop: 18 },
  sectionTitle: { fontSize: 13, fontFamily: font.extrabold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  catTileWrap: { width: '47%', flexGrow: 1, borderRadius: radius.card, ...shadow.card },
  catTile: { height: 96, borderRadius: radius.card, padding: 14, justifyContent: 'space-between' },
  catEmoji: { fontSize: 28 },
  catLabel: { fontSize: 16, fontFamily: font.heading, color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.card, padding: 12, marginBottom: 9, ...shadow.card },
  personMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 46, height: 46, borderRadius: radius.tile, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowIconImg: { width: 46, height: 46 },
  rowEmoji: { fontSize: 22 },
  personAv: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.chipBg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  personAvImg: { width: 46, height: 46 },
  rowTitle: { fontSize: 14, fontFamily: font.headingBold, color: colors.text },
  rowMeta: { fontSize: 12, fontFamily: font.medium, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textFaint },
  addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.tile, backgroundColor: colors.brandBlue },
  addBtnOff: { backgroundColor: colors.soft2 },
  addTxt: { fontSize: 12, fontFamily: font.bold, color: '#fff' },
  addTxtOff: { color: colors.textMuted },
  none: { textAlign: 'center', fontFamily: font.medium, color: colors.textMuted, marginTop: 50 },
});
