import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function FeedScreen() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liked, setLiked] = useState<string[]>([]);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const fetchPosts = async () => {
    try {
      const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
      if (data) setPosts(data);
    } catch (e) {}
  };

  useEffect(() => {
    (async () => { await fetchPosts(); setLoading(false); })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  };

  const createPost = async () => {
    if (text.trim().length < 3) return;
    setPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = user ? await supabase.from('profiles').select('name').eq('id', user.id).single() : { data: null };
      await supabase.from('posts').insert({
        user_name: prof?.name || user?.email?.split('@')[0] || 'Anonymous',
        activity: '✍️ New post · just now',
        emoji: '💬',
        bg_color: '#FFF6D6',
        location: '',
        caption: text.trim(),
        likes: 0,
      });
      setText('');
      setWriting(false);
      await fetchPosts();
    } catch (e) {}
    setPosting(false);
  };

  const toggleLike = (id: string) => {
    setLiked(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#F5C400" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Feed</Text>
          <Text style={styles.headerSub}>Activities from your community</Text>
        </View>
        <TouchableOpacity style={styles.writeBtn} onPress={() => setWriting(w => !w)}>
          <Text style={styles.writeBtnTxt}>{writing ? '✕' : '✍️'}</Text>
        </TouchableOpacity>
      </View>

      {writing && (
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            placeholder="What's happening?"
            placeholderTextColor="#aaa"
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity style={[styles.postBtn, (text.trim().length < 3 || posting) && styles.postBtnOff]} disabled={text.trim().length < 3 || posting} onPress={createPost}>
            {posting ? <ActivityIndicator color="#111" /> : <Text style={styles.postBtnTxt}>Post</Text>}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {posts.length === 0 && <Text style={styles.empty}>No posts yet — write the first one!</Text>}
        {posts.map(post => (
          <View key={post.id} style={styles.post}>
            <View style={styles.postHead}>
              <View style={[styles.postAv, { backgroundColor: post.bg_color || '#F2F2EE' }]}>
                <Text style={styles.postAvEmoji}>{post.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.postUser}>{post.user_name}</Text>
                <Text style={styles.postActivity}>{post.activity}</Text>
              </View>
            </View>
            {post.location ? <Text style={styles.postLoc}>{post.location}</Text> : null}
            <Text style={styles.postCaption}>{post.caption}</Text>
            <View style={styles.postActions}>
              <TouchableOpacity onPress={() => toggleLike(post.id)}>
                <Text style={styles.actionTxt}>{liked.includes(post.id) ? '❤️' : '🤍'} {liked.includes(post.id) ? (post.likes || 0) + 1 : (post.likes || 0)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: '#FAFAF7', alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#FAFAF7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingTop: 56 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111' },
  headerSub: { fontSize: 13, color: '#888', marginTop: 2 },
  writeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  writeBtnTxt: { fontSize: 16, color: '#F5C400' },
  composer: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E5DF', padding: 12 },
  composerInput: { minHeight: 60, fontSize: 14, color: '#111', textAlignVertical: 'top' },
  postBtn: { alignSelf: 'flex-end', backgroundColor: '#F5C400', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, marginTop: 8 },
  postBtnOff: { opacity: 0.4 },
  postBtnTxt: { fontSize: 13, fontWeight: '700', color: '#111' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  post: { backgroundColor: '#fff', marginBottom: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E5E5DF', padding: 12 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  postAv: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  postAvEmoji: { fontSize: 20 },
  postUser: { fontSize: 14, fontWeight: '700', color: '#111' },
  postActivity: { fontSize: 11, color: '#888', marginTop: 1 },
  postLoc: { fontSize: 12, color: '#888', marginBottom: 6 },
  postCaption: { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 8 },
  postActions: { flexDirection: 'row', gap: 16 },
  actionTxt: { fontSize: 14, fontWeight: '600', color: '#555' },
});