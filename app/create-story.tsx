import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from './lib/i18n';
import { supabase } from './lib/supabase';
import { colors, font, radius, shadow } from './lib/theme';

const EMOJIS = ['✨', '🏃', '☕', '🎸', '🍕', '🎲', '🌅', '🎉', '📸', '🐕', '⚽', '🧘'];

export default function CreateStoryScreen() {
  const { t } = useI18n();
  const [emoji, setEmoji] = useState('✨');
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);
  const [myEvents, setMyEvents] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<{ id: string; name: string; avatar_url: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('id, name, avatar_url').eq('id', user.id).single();
      setProfile({ id: user.id, name: prof?.name || user.email?.split('@')[0] || 'Me', avatar_url: prof?.avatar_url || '' });
      const { data: ev } = await supabase.from('events').select('id, title, emoji').eq('creator_id', user.id).order('created_at', { ascending: false }).limit(20);
      setMyEvents(ev || []);
    })();
  }, []);

  const canPublish = title.trim().length > 2 && !!profile;

  const publish = async () => {
    if (!canPublish || !profile) return;
    setSaving(true);
    try {
      await supabase.from('stories').insert({
        user_id: profile.id, user_name: profile.name, avatar_url: profile.avatar_url || null,
        emoji, title: title.trim(), event_id: eventId,
      });
      router.back();
    } catch (e) { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.x}><Text style={styles.xTxt}>✕</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>{t('story.create')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* preview */}
        <View style={styles.preview}>
          <Text style={styles.previewEmoji}>{emoji}</Text>
          <Text style={styles.previewTitle}>{title.trim() || t('story.titlePh')}</Text>
        </View>

        <Text style={styles.label}>{t('story.pickVibe')}</Text>
        <View style={styles.emojiGrid}>
          {EMOJIS.map(e => (
            <TouchableOpacity key={e} style={[styles.emojiBtn, emoji === e && styles.emojiBtnOn]} onPress={() => setEmoji(e)}>
              <Text style={styles.emojiBtnTxt}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: 22 }]}>{t('story.titleLabel')}</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={t('story.titlePh')} placeholderTextColor={colors.textFaint} maxLength={80} />

        {myEvents.length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: 22 }]}>{t('story.linkEvent')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <TouchableOpacity style={[styles.evChip, !eventId && styles.evChipOn]} onPress={() => setEventId(null)}>
                <Text style={[styles.evChipTxt, !eventId && styles.evChipTxtOn]}>{t('story.noEvent')}</Text>
              </TouchableOpacity>
              {myEvents.map(ev => (
                <TouchableOpacity key={ev.id} style={[styles.evChip, eventId === ev.id && styles.evChipOn]} onPress={() => setEventId(ev.id)}>
                  <Text style={[styles.evChipTxt, eventId === ev.id && styles.evChipTxtOn]} numberOfLines={1}>{ev.emoji} {ev.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <TouchableOpacity style={[styles.publish, !canPublish && styles.publishOff]} disabled={!canPublish || saving} onPress={publish}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishTxt}>{t('story.publish')}</Text>}
        </TouchableOpacity>
        <Text style={styles.note}>{t('story.expires')}</Text>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 54, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  x: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  xTxt: { fontSize: 20, color: colors.text },
  headerTitle: { fontSize: 18, fontFamily: font.heading, color: colors.text },
  form: { flex: 1, padding: 18 },
  preview: { alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.card, paddingVertical: 28, marginBottom: 22, ...shadow.card },
  previewEmoji: { fontSize: 56 },
  previewTitle: { fontSize: 18, fontFamily: font.headingBold, color: colors.text, textAlign: 'center', paddingHorizontal: 20 },
  label: { fontSize: 11, fontFamily: font.bold, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: { width: 48, height: 48, borderRadius: radius.tile, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center' },
  emojiBtnOn: { borderColor: colors.brandBlue, backgroundColor: colors.chipBg },
  emojiBtnTxt: { fontSize: 24 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, padding: 14, fontSize: 15, fontFamily: font.medium, color: colors.text, ...shadow.card },
  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  evChip: { maxWidth: 200, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.chip, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.hairline },
  evChipOn: { backgroundColor: colors.brandBlue, borderColor: colors.brandBlue },
  evChipTxt: { fontSize: 13, fontFamily: font.semibold, color: colors.textSub },
  evChipTxtOn: { color: '#fff' },
  publish: { backgroundColor: colors.brandBlue, padding: 16, borderRadius: radius.cta, alignItems: 'center', marginTop: 26, ...shadow.cta },
  publishOff: { opacity: 0.4 },
  publishTxt: { fontSize: 16, fontFamily: font.extrabold, color: '#fff' },
  note: { textAlign: 'center', fontSize: 12, fontFamily: font.medium, color: colors.textFaint, marginTop: 12 },
});
