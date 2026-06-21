import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function EventChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
          })
        .subscribe();
    })();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [id]);

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
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          {!mine && <Text style={styles.author}>{item.user_name || 'Someone'}</Text>}
          <Text style={[styles.msgTxt, mine && styles.msgTxtMine]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{emoji} {title}</Text>
          <Text style={styles.headerSub}>Event chat · participants only</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2FB6A8" />
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
          ListEmptyComponent={<Text style={styles.empty}>No messages yet — say hi 👋</Text>}
        />
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Message…"
          placeholderTextColor="#aaa"
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
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#16263F', paddingTop: 56, paddingBottom: 14, paddingHorizontal: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#fff', fontSize: 34, lineHeight: 34, marginTop: -4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 14, paddingBottom: 6, flexGrow: 1 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  row: { marginBottom: 8, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  bubbleMine: { backgroundColor: '#2FB6A8', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E5DF', borderBottomLeftRadius: 4 },
  author: { fontSize: 11, fontWeight: '700', color: '#1E8C80', marginBottom: 2 },
  msgTxt: { fontSize: 15, color: '#222', lineHeight: 20 },
  msgTxtMine: { color: '#16263F' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#E5E5DF', backgroundColor: '#fff' },
  input: { flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: '#F2F2EE', borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: '#16263F' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#16263F', alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { opacity: 0.4 },
  sendTxt: { color: '#2FB6A8', fontSize: 18 },
});
