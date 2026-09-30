import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchFeed, fetchFeedPage, reactToEvent, unreactFromEvent } from '../services/communityApi.js';
import { isOnline } from '../services/supabase.js';

// The community feed, kept fresh.
//
// Polling, not a realtime subscription: services/supabase.js deliberately keeps
// realtime off, and for a feed of this size and pace a 45-second poll while the
// tab is in front costs less — in battery, in connections and in code — than a
// socket. If this ever needs to be instant, the swap is inside this hook.
//
// NEW ITEMS NEVER MOVE THE PAGE. A poll that found something does not splice it
// into the list; it parks it behind a "N new" pill and waits to be asked. The
// row you are reading stays under your thumb.
const POLL_MS = 45000;

export function useFeed(scope = 'global', { enabled = true, refreshToken = 0 } = {}) {
  const [events, setEvents] = useState([]);
  const [pending, setPending] = useState([]);   // fetched, not yet shown
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paging, setPaging] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState(null);
  const seen = useRef(new Set());

  const ingest = useCallback((incoming, { replace }) => {
    if (replace) {
      seen.current = new Set(incoming.map((e) => String(e.id)));
      setEvents(incoming);
      setPending([]);
      return;
    }
    const fresh = incoming.filter((e) => !seen.current.has(String(e.id)));
    if (!fresh.length) return;
    for (const e of fresh) seen.current.add(String(e.id));
    setPending((p) => [...fresh, ...p]);
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) { setLoading(false); return; }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetchFeed(scope);
      if (silent) ingest(res.events, { replace: false });
      else { ingest(res.events, { replace: true }); setCursor(res.nextCursor); }
      setStale(!!res.stale);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [scope, enabled, ingest]);

  // Reset completely when the scope changes — Everyone and Friends are
  // different lists, and carrying a cursor across them would page the wrong one.
  useEffect(() => {
    seen.current = new Set();
    setEvents([]); setPending([]); setCursor(null);
    load();
  }, [load, refreshToken]);

  // Poll only while the tab is actually in front. A backgrounded PWA polling
  // every 45s is a battery complaint waiting to happen.
  useEffect(() => {
    if (!enabled) return;
    let timer = null;
    const tick = () => { if (!document.hidden && isOnline()) load({ silent: true }); };
    const start = () => { stop(); timer = setInterval(tick, POLL_MS); };
    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { tick(); start(); }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', tick);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('online', tick); };
  }, [load, enabled]);

  // Show what the poll found, at the moment the user asks for it.
  const showPending = useCallback(() => {
    setEvents((cur) => [...pending, ...cur]);
    setPending([]);
  }, [pending]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load({ silent: false }); } finally { setRefreshing(false); }
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || paging) return;
    setPaging(true);
    try {
      const res = await fetchFeedPage(scope, cursor);
      setEvents((prev) => {
        // Keyed by id on append: an event arriving at the head between two page
        // requests must not be able to duplicate a row further down.
        const have = new Set(prev.map((e) => String(e.id)));
        const add = res.events.filter((e) => !have.has(String(e.id)));
        for (const e of add) seen.current.add(String(e.id));
        return [...prev, ...add];
      });
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setPaging(false);
    }
  }, [cursor, paging, scope]);

  // Reactions update optimistically. Both RPCs are idempotent server-side, so a
  // tap that loses a race self-corrects on the next poll rather than corrupting
  // a count.
  const react = useCallback(async (eventId, kind = 'fire') => {
    const apply = (list) => list.map((e) => {
      if (String(e.id) !== String(eventId)) return e;
      const mine = !!e.my_reaction;
      return {
        ...e,
        my_reaction: mine ? null : kind,
        reaction_count: Math.max(0, (Number(e.reaction_count) || 0) + (mine ? -1 : 1))
      };
    });
    const target = events.find((e) => String(e.id) === String(eventId));
    if (!target || target.local) return;   // you cannot cheer your own unpublished PR
    const wasMine = !!target.my_reaction;
    setEvents(apply);
    try {
      if (wasMine) await unreactFromEvent(eventId);
      else await reactToEvent(eventId, kind);
    } catch {
      setEvents(apply); // put it back
    }
  }, [events]);

  return {
    events, pendingCount: pending.length, showPending,
    loading, refreshing, paging, stale, error,
    hasMore: !!cursor,
    refresh, loadMore, react, reload: load
  };
}
