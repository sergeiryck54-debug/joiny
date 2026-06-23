import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from './lib/i18n';
import { captureMedia, MediaKind, moderateImageBase64, PickedMedia, pickMedia, uploadMedia } from './lib/photos';
import { supabase } from './lib/supabase';
import { colors, font, radius, shadow } from './lib/theme';

const EMOJIS = ['✨', '🏃', '☕', '🎸', '🍕', '🎲', '🌅', '🎉', '📸', '🐕', '⚽', '🧘'];

export default function CreateStoryScreen() {
  const { t } = useI18n();
  const [emoji, setEmoji] = useState('✨');
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);
  const [myEvents, setMyEvents] = useState<any[]>([]);
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<{ id: string; name: string; avatar_url: string } | null>(null);

  const fromCamera = (kind: MediaKind) => async () => {
    try { const m = await captureMedia(kind); if (m) setMedia(m); }
    catch (e) { Alert.alert(t('media.fail'), t('common.tryAgain')); }
  };
  const fromGallery = async () => {
    try { const list = await pickMedia(1, true); if (list.length) setMedia(list[0]); }
    catch (e) { Alert.alert(t('media.fail'), t('common.tryAgain')); }
  };
  const pickStoryMedia = () => {
    Alert.alert(t('media.addTitle'), undefined, [
      { text: t('media.camera'), onPress: () => Alert.alert(t('media.cameraTitle'), undefined, [
        { text: t('media.photo'), onPress: fromCamera('image') },
        { text: t('media.video'), onPress: fromCamera('video') },
        { text: t('common.cancel'), style: 'cancel' },
      ]) },
      { text: t('media.gallery'), onPress: fromGallery },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

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
    let media_url: string | null = null;
    if (media) {
      const mod = await moderateImageBase64(media.base64);
      if (mod.status === 'unavailable') { Alert.alert(t('media.unavailableTitle'), t('media.unavailableShort')); setSaving(false); return; }
      if (mod.status === 'blocked') { Alert.alert(t('media.rejectedTitle'), t('media.rejected', { n: 1 })); setSaving(false); return; }
      try { media_url = await uploadMedia('event-photos', `${profile.id}/story_${Date.now()}`, media); }
      catch (e) { Alert.alert(t('media.fail'), t('common.tryAgain')); setSaving(false); return; }
    }
    try {
      await supabase.from('stories').insert({
        user_id: profile.id, user_name: profile.name, avatar_url: profile.avatar_url || null,
        emoji, title: title.trim(), event_id: eventId, media_url,
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

        <Text style={[styles.label, { marginTop: 22 }]}>{t('create.photos')}</Text>
        {media ? (
          <View style={styles.mediaWrap}>
            {media.base64
              ? <Image source={{ uri: `data:image/jpeg;base64,${media.base64}` }} style={styles.mediaThumb} contentFit="cover" />
              : <View style={[styles.mediaThumb, styles.mediaVideoFallback]}><Text style={{ fontSize: 36 }}>🎬</Text></View>}
            {media.type === 'video' && <View style={styles.playBadge}><Text style={styles.playBadgeTxt}>▶</Text></View>}
            <TouchableOpacity style={styles.mediaX} onPress={() => setMedia(null)}><Text style={styles.mediaXTxt}>✕</Text></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.mediaAdd} onPress={pickStoryMedia} activeOpacity={0.8}>
            <Text style={styles.mediaAddPlus}>＋</Text>
            <Text style={styles.mediaAddSub}>{t('media.addTitle')}</Text>
          </TouchableOpacity>
        )}

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
  mediaAdd: { height: 110, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.textFaint, borderStyle: 'dashed', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 4 },
  mediaAddPlus: { fontSize: 30, color: colors.textMuted },
  mediaAddSub: { fontSize: 12, fontFamily: font.semibold, color: colors.textMuted },
  mediaWrap: { width: 120, height: 120, borderRadius: radius.card, overflow: 'hidden' },
  mediaThumb: { width: 120, height: 120 },
  mediaVideoFallback: { backgroundColor: colors.navy2, alignItems: 'center', justifyContent: 'center' },
  playBadge: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playBadgeTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 30, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  mediaX: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(22,38,62,0.75)', alignItems: 'center', justifyContent: 'center' },
  mediaXTxt: { color: '#fff', fontSize: 12, fontFamily: font.bold },
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
