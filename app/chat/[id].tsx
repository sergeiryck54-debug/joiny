import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { colors, font, gradients, radius } from '../lib/theme';
import { useUnread } from '../lib/unread';

export default function EventChatScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { markRead, setActiveEvent } = useUnread();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState('Event');
  const [emoji, setEmoji] = useState('📍');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('Me');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!id) return;
    let channel: any;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const { data: prof } = await supabase.from('profiles').select('name').eq('id', user.id).single();
          setUserName(prof?.name || user.email?.split('@')[0] || 'Me');
        }
        const { data: ev } = await supabase.from('events').select('title, emoji').eq('id', id).single();
        if (ev) { setTitle(ev.title || 'Event'); setEmoji(ev.emoji || '📍'); }
        const { data: msgs } = await supabase.from('event_messages').select('*').eq('event_id', id).order('created_at', { ascending: true });
        if (msgs) setMessages(msgs);
      } catch (e) {}
      setLoading(false);

      // Live updates: append new messages as they arrive
      channel = supabase
        .channel(`event-chat-${id}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'event_messages', filter: `event_id=eq.${id}` },
          (payload) => {
            setMessages(prev => prev.some(m => m.id === (payload.new as any).id) ? prev : [...prev, payload.new]);
            // Viewing the chat = caught up; keep the read marker ahead of new messages.
            markRead(id);
          })
        .subscribe();
    })();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [id, markRead]);

  // While this chat is open it is "active" (no badge / no buzz), and opening it
  // marks everything read.
  useFocusEffect(useCallback(() => {
    if (!id) return;
    setActiveEvent(id);
    markRead(id);
    return () => setActiveEvent(null);
  }, [id, markRead, setActiveEvent]));

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      const { data } = await supabase.from('event_messages')
        .insert({ event_id: id, user_id: userId, user_name: userName, text: body })
        .select().single();
      if (data) setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data]);
    } catch (e) {
      setText(body); // restore on failure
    }
    setSending(false);
  };

  const renderItem = ({ item }: { item: any }) => {
    const mine = item.user_id === userId;
    return (
      <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
        {mine ? (
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, styles.bubbleMine]}>
            <Text style={[styles.msgTxt, styles.msgTxtMine]}>{item.text}</Text>
          </LinearGradient>
        ) : (
          <View style={[styles.bubble, styles.bubbleTheirs]}>
            <Text style={styles.author}>{item.user_name || 'Someone'}</Text>
            <Text style={styles.msgTxt}>{item.text}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{emoji} {title}</Text>
          <Text style={styles.headerSub}>{t('chat.sub')}</Text>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.brandBlue} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text style={styles.empty}>{t('chat.empty')}</Text>}
        />
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder={t('chat.ph')}
          placeholderTextColor={colors.textFaint}
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnOff]} disabled={!text.trim() || sending} onPress={send}>
          <Text style={styles.sendTxt}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.chatBg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 56, paddingBottom: 14, paddingHorizontal: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#fff', fontSize: 34, lineHeight: 34, marginTop: -4 },
  headerTitle: { color: '#fff', fontSize: 18, fontFamily: font.heading },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: font.medium, marginTop: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 14, paddingBottom: 6, flexGrow: 1 },
  empty: { textAlign: 'center', fontFamily: font.medium, color: colors.textMuted, marginTop: 40 },
  row: { marginBottom: 8, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, ...{ shadowColor: '#142846', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 } },
  author: { fontSize: 11, fontFamily: font.bold, color: colors.chipText, marginBottom: 2 },
  msgTxt: { fontSize: 15, fontFamily: font.medium, color: colors.text, lineHeight: 20 },
  msgTxtMine: { color: '#fff' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, paddingBottom: 24, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: colors.soft2, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, fontFamily: font.medium, color: colors.text },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandBlue, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { opacity: 0.4 },
  sendTxt: { color: '#fff', fontSize: 18 },
});
