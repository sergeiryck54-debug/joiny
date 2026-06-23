import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { colors, font, gradients, radius } from '../lib/theme';

const DURATION = 7000; // auto-advance

export default function StoryScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [story, setStory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;

  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return t('time.now');
    if (mins < 60) return t('time.min', { n: mins });
    return t('time.hour', { n: Math.floor(mins / 60) });
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from('stories').select('*').eq('id', id).single();
      setStory(data);
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (loading || !story) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, { toValue: 1, duration: DURATION, useNativeDriver: false });
    anim.start(({ finished }) => { if (finished) router.back(); });
    return () => anim.stop();
  }, [loading, story, progress]);

  const openEvent = () => { if (story?.event_id) router.replace(`/event/${story.event_id}` as any); };

  if (loading) {
    return <LinearGradient colors={gradients.story} style={styles.center}><ActivityIndicator color={colors.brandTeal} size="large" /></LinearGradient>;
  }
  if (!story) {
    return (
      <LinearGradient colors={gradients.story} style={styles.center}>
        <Text style={styles.gone}>—</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.closeLink}>✕</Text></TouchableOpacity>
      </LinearGradient>
    );
  }

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Pressable style={{ flex: 1 }} onPress={() => router.back()}>
      <LinearGradient colors={gradients.story} style={styles.container}>
        {/* progress */}
        <View style={styles.progressTrack}><Animated.View style={[styles.progressFill, { width }]} /></View>

        {/* header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            {story.avatar_url ? <Image source={{ uri: story.avatar_url }} style={styles.avatarImg} contentFit="cover" /> : <Text style={{ fontSize: 18 }}>🧑</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.author}>{story.user_name || t('common.anon')}</Text>
            <Text style={styles.time}>{timeAgo(story.created_at)}</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></TouchableOpacity>
        </View>

        {/* body */}
        <View style={styles.body}>
          <Text style={styles.emoji}>{story.emoji || '✨'}</Text>
          <Text style={styles.title}>{story.title}</Text>
          {story.event_id && (
            <TouchableOpacity style={styles.eventPill} onPress={openEvent}>
              <Text style={styles.eventPillTxt}>{t('story.openEvent')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  gone: { color: 'rgba(255,255,255,0.5)', fontSize: 40 },
  closeLink: { color: '#fff', fontSize: 22 },
  container: { flex: 1, paddingTop: 50, paddingHorizontal: 16 },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 4 },
  progressFill: { height: 3, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 38, height: 38 },
  author: { color: '#fff', fontSize: 15, fontFamily: font.headingBold },
  time: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: font.medium },
  close: { color: '#fff', fontSize: 24, paddingHorizontal: 4 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 12 },
  emoji: { fontSize: 64 },
  title: { color: '#fff', fontSize: 28, fontFamily: font.heading, textAlign: 'center', lineHeight: 36 },
  eventPill: { marginTop: 6, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11 },
  eventPillTxt: { color: '#fff', fontSize: 14, fontFamily: font.bold },
});
