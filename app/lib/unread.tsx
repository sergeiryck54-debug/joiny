import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';

export type UnreadItem = {
  event_id: string;
  title: string;
  emoji: string;
  unread: number;
  last_at: string;
};

type Ctx = {
  items: UnreadItem[];                  // events that currently have unread messages
  counts: Record<string, number>;       // event_id -> unread count
  total: number;                        // sum of all unread messages
  refresh: () => Promise<void>;
  markRead: (eventId: string) => Promise<void>;
  setActiveEvent: (eventId: string | null) => void;
};

const UnreadContext = createContext<Ctx>({
  items: [], counts: {}, total: 0,
  refresh: async () => {}, markRead: async () => {}, setActiveEvent: () => {},
});

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string>('');
  const [items, setItems] = useState<UnreadItem[]>([]);
  const itemsRef = useRef<UnreadItem[]>([]);
  const activeEventRef = useRef<string | null>(null);

  useEffect(() => { itemsRef.current = items; }, [items]);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('unread_counts');
      if (error) return;
      setItems((data || []) as UnreadItem[]);
    } catch {}
  }, []);

  // Mark a chat read: optimistically clear its badge, then persist the marker.
  const markRead = useCallback(async (eventId: string) => {
    setItems(prev => prev.filter(i => i.event_id !== eventId));
    try { await supabase.rpc('mark_event_read', { p_event_id: eventId }); } catch {}
  }, []);

  // The chat screen that is currently open — its incoming messages don't count
  // as unread and shouldn't buzz.
  const setActiveEvent = useCallback((eventId: string | null) => {
    activeEventRef.current = eventId;
  }, []);

  // Track who is signed in. Drives the realtime subscriptions below.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => { if (mounted) setUserId(data.user?.id || ''); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id || '');
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // (Re)build the realtime subscriptions whenever the signed-in user changes.
  useEffect(() => {
    if (!userId) { setItems([]); return; }
    let msgChannel: any;
    let frChannel: any;

    refresh();

    // New chat messages across every event the user joined (RLS only delivers
    // messages from events where the user is a participant).
    msgChannel = supabase
      .channel('global-event-messages')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_messages' },
        (payload) => {
          const m = payload.new as any;
          if (!m || m.user_id === userId) return;              // ignore my own
          if (activeEventRef.current === m.event_id) return;   // chat is open → not unread
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          const inList = itemsRef.current.some(i => i.event_id === m.event_id);
          if (inList) {
            setItems(prev => prev.map(i =>
              i.event_id === m.event_id
                ? { ...i, unread: i.unread + 1, last_at: m.created_at }
                : i));
          } else {
            // First unread for this event — pull its title/emoji from the server.
            refresh();
          }
        })
      .subscribe();

    // Incoming friend requests → a gentle notification buzz.
    frChannel = supabase
      .channel('global-friendships')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friendships' },
        (payload) => {
          const f = payload.new as any;
          if (f && f.friend_id === userId && f.status === 'pending') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
        })
      .subscribe();

    return () => {
      if (msgChannel) supabase.removeChannel(msgChannel);
      if (frChannel) supabase.removeChannel(frChannel);
    };
  }, [userId, refresh]);

  const counts = useMemo(
    () => Object.fromEntries(items.map(i => [i.event_id, i.unread])),
    [items]);
  const total = useMemo(() => items.reduce((s, i) => s + i.unread, 0), [items]);

  return (
    <UnreadContext.Provider value={{ items, counts, total, refresh, markRead, setActiveEvent }}>
      {children}
    </UnreadContext.Provider>
  );
}

export const useUnread = () => useContext(UnreadContext);
