import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, CloudOff, EyeOff, Loader2, Sparkles } from 'lucide-react';
import Segmented from './Segmented.jsx';
import FeedEventCard from './FeedEventCard.jsx';
import { useToast } from './Toast.jsx';
import { fetchFeed, fetchFeedPage, reactToEvent, unreactFromEvent } from '../services/communityApi.js';
import { renderableEvents } from '../services/communityEvents.js';

// The community feed — what the app opens on, and the answer to "what is
// happening on Kun?".
//
// Paged with an explicit button rather than infinite scroll. Infinite scroll on
// a feed this size would mostly serve to hide the end of it, and an end is a
// perfectly good thing for a feed to have: the point is to see what people did,
// not to keep scrolling.
const SCOPES = [
  { value: 'global', label: 'Everyone' },
  { value: 'friends', label: 'Friends' }
];

export default function CommunityFeedPanel({
  onOpenProfile, refreshToken, exercises, profile, onOpenSettings
}) {
  const [scope, setScope] = useState('global');
  const [events, setEvents] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  const exNames = useMemo(() => new Map((exercises || []).map((e) => [e.id, e.name])), [exercises]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFeed(scope);
      setEvents(res.events);
      setCursor(res.nextCursor);
      setStale(!!res.stale);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const loadMore = async () => {
    if (!cursor || paging) return;
    setPaging(true);
    try {
      const res = await fetchFeedPage(scope, cursor);
      // Keyed by id on append, because a new event arriving at the head of the
      // feed between two page requests must not be able to duplicate a row.
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...res.events.filter((e) => !seen.has(e.id))];
      });
      setCursor(res.nextCursor);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setPaging(false);
    }
  };

  const rows = useMemo(() => renderableEvents(events, exNames), [events, exNames]);

  return (
    <div className="space-y-3">
      <Segmented value={scope} onChange={setScope} options={SCOPES} />

      {/* The one place a person finds out they are invisible. Quiet, but always
          present while it is true, and one tap from the switch that changes it —
          a setting you cannot find is not a setting. */}
      {profile && profile.share_activity === false && (
        <button
          onClick={onOpenSettings}
          className="w-full text-left bg-card border border-border rounded-2xl p-3 flex items-start gap-2.5 active:border-accent"
        >
          <EyeOff size={16} className="text-muted shrink-0 mt-0.5" />
          <span className="min-w-0">
            <span className="text-sm block">You are not in the community</span>
            <span className="text-[11px] text-muted block leading-snug mt-0.5">
              You can see everyone here, but your own training is hidden. Tap to change it.
            </span>
          </span>
        </button>
      )}

      {stale && (
        <p className="text-[11px] text-warn flex items-center gap-1.5 px-1">
          <CloudOff size={12} /> Showing the saved feed — you are offline.
        </p>
      )}

      {loading && rows.length === 0 && (
        <div className="flex justify-center py-10">
          <span className="w-5 h-5 rounded-full border-2 border-muted border-t-accent animate-spin" />
        </div>
      )}

      {error && rows.length === 0 && (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <p className="text-sm font-medium">Could not load the community</p>
          <p className="text-xs text-muted mt-1">{error}</p>
          <button onClick={load} className="mt-3 h-10 px-4 rounded-xl border border-border text-sm active:bg-card">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          {scope === 'friends' ? (
            <>
              <Users size={26} className="text-muted mx-auto mb-2" />
              <p className="text-sm font-medium">Nothing from your friends yet</p>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Switch to Everyone to see what the rest of Kun is lifting.
              </p>
            </>
          ) : (
            <>
              <Sparkles size={26} className="text-muted mx-auto mb-2" />
              <p className="text-sm font-medium">Nothing here yet</p>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Finish a workout and you will be the first thing on it.
              </p>
            </>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map(({ ev, described }) => (
            <FeedEventCard
              key={ev.id}
              event={ev}
              described={described}
              onOpenProfile={onOpenProfile}
              onReact={reactToEvent}
              onUnreact={unreactFromEvent}
            />
          ))}
        </ul>
      )}

      {cursor && (
        <button
          onClick={loadMore}
          disabled={paging}
          className="w-full h-11 rounded-xl border border-border text-sm text-muted flex items-center justify-center gap-2 active:bg-card disabled:opacity-50"
        >
          {paging && <Loader2 size={15} className="animate-spin" />}
          {paging ? 'Loading' : 'Show more'}
        </button>
      )}

      <p className="text-[11px] text-muted px-1 leading-relaxed">
        Milestones only — records, streaks and challenges. Your individual sets, reps and
        notes never leave your device.
      </p>
    </div>
  );
}
