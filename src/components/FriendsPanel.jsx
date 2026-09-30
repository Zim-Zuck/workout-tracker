import { useCallback, useEffect, useState } from 'react';
import { Search, UserPlus, Check, X, Clock, CloudOff, ChevronRight } from 'lucide-react';
import { Avatar } from './AppHeader.jsx';
import { useToast } from './Toast.jsx';
import {
  searchUsers, sendFriendRequest, respondToRequest, listFriendships
} from '../services/friendsApi.js';
import { relativeDay } from '../utils/date.js';
import { isOnline } from '../services/supabase.js';

// Friends: incoming requests first, then friends, then outgoing.
//
// Search is a separate mode rather than a permanent field, because the common
// case by far is "look at my friends", not "find someone new".
export default function FriendsPanel({ onOpenProfile, myId, refreshToken, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [searching, setSearching] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFriendships();
      setRows(res.rows);
      setStale(res.stale);
      setCachedAt(res.cachedAt);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const incoming = rows.filter((r) => r.direction === 'incoming');
  const friends = rows.filter((r) => r.direction === 'friend');
  const outgoing = rows.filter((r) => r.direction === 'outgoing');

  const respond = async (otherId, accept) => {
    try {
      await respondToRequest(otherId, accept);
      toast(accept ? 'Friend added' : 'Request declined', { tone: accept ? 'success' : undefined });
      await load();
      onChanged?.();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  if (searching) {
    return <UserSearch onClose={() => { setSearching(false); load(); }} onChanged={onChanged} />;
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setSearching(true)}
        className="w-full h-tap rounded-row bg-glass-inset border border-glass-border flex items-center gap-2 px-3 text-label text-ink-tertiary active:border-focus"
      >
        <Search size={16} /> Find someone by username
      </button>

      {stale && (
        <p className="text-micro tracking-normal text-ink-secondary flex items-center gap-1.5 px-1">
          <CloudOff size={12} />
          Showing saved list{cachedAt ? ` from ${relativeDay(cachedAt).toLowerCase()}` : ''} — you are offline.
        </p>
      )}

      {loading && rows.length === 0 && (
        <div className="flex justify-center py-10">
          <span className="w-5 h-5 rounded-full border-2 border-muted border-t-accent animate-spin" />
        </div>
      )}

      {incoming.length > 0 && (
        <Group title={`Friend requests (${incoming.length})`}>
          {incoming.map((r) => (
            <li key={r.other_id} className="py-2.5 flex items-center gap-3">
              <Avatar profile={r} size={38} />
              <div className="flex-1 min-w-0">
                <div className="text-label font-semibold truncate">{r.display_name}</div>
                <div className="text-label text-ink-tertiary truncate">@{r.username}</div>
              </div>
              <button
                onClick={() => respond(r.other_id, true)}
                aria-label={`Accept ${r.display_name}`}
                className="w-10 h-10 rounded-row bg-done text-on-primary flex items-center justify-center active:opacity-80"
              >
                <Check size={18} />
              </button>
              <button
                onClick={() => respond(r.other_id, false)}
                aria-label={`Decline ${r.display_name}`}
                className="w-10 h-10 rounded-row border border-glass-border text-ink-tertiary flex items-center justify-center active:bg-glass-inset"
              >
                <X size={18} />
              </button>
            </li>
          ))}
        </Group>
      )}

      <Group title={friends.length ? `Friends (${friends.length})` : 'Friends'}>
        {friends.length === 0 && !loading && (
          <li className="py-6 text-center text-label text-ink-tertiary">
            No friends yet. Search for someone by their username to add them.
          </li>
        )}
        {friends.map((r) => (
          <li key={r.other_id}>
            <button
              onClick={() => onOpenProfile(r.other_id)}
              className="w-full py-2.5 flex items-center gap-3 text-left active:opacity-70"
            >
              <Avatar profile={r} size={38} />
              <div className="flex-1 min-w-0">
                <div className="text-label font-semibold truncate">{r.display_name}</div>
                <div className="text-label text-ink-tertiary truncate">
                  {r.total_workouts != null
                    ? `${r.total_workouts} workouts${r.streak_weeks ? ` · ${r.streak_weeks}w streak` : ''}`
                    : `@${r.username}`}
                </div>
              </div>
              <ChevronRight size={18} className="text-ink-tertiary shrink-0" />
            </button>
          </li>
        ))}
      </Group>

      {outgoing.length > 0 && (
        <Group title="Sent">
          {outgoing.map((r) => (
            <li key={r.other_id} className="py-2.5 flex items-center gap-3">
              <Avatar profile={r} size={38} />
              <div className="flex-1 min-w-0">
                <div className="text-label font-semibold truncate">{r.display_name}</div>
                <div className="text-label text-ink-tertiary truncate">@{r.username}</div>
              </div>
              <span className="text-label text-ink-tertiary flex items-center gap-1 shrink-0">
                <Clock size={13} /> Pending
              </span>
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }) {
  return (
    <section className="bg-glass border border-glass-border rounded-card p-3">
      <h3 className="text-label font-semibold mb-1">{title}</h3>
      <ul className="divide-y divide-hairline">{children}</ul>
    </section>
  );
}

// Exact-username-prefix search. No browsing a directory of strangers: you have
// to know who you are looking for.
function UserSearch({ onClose, onChanged }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setSearched(false); setError(null); return; }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchUsers(term);
        if (cancelled) return;
        setResults(rows);
        setError(null);
      } catch (err) {
        if (!cancelled) { setError(err.message); setResults([]); }
      } finally {
        if (!cancelled) { setBusy(false); setSearched(true); }
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const add = async (row) => {
    try {
      const res = await sendFriendRequest(row.id);
      const status = res?.status;
      setResults((rs) => rs.map((r) => (
        r.id === row.id
          ? { ...r, relationship: status === 'accepted' ? 'friends' : 'requested' }
          : r
      )));
      toast(
        status === 'accepted' ? `You and ${row.display_name} are now friends`
        : status === 'already_friends' ? 'Already friends'
        : status === 'already_pending' ? 'Request already sent'
        : `Request sent to ${row.display_name}`,
        { tone: 'success' }
      );
      onChanged?.();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Search by username"
            className="w-full h-tap pl-9 pr-3 rounded-row bg-glass-inset border border-glass-border outline-none focus:border-focus text-label"
          />
        </div>
        <button onClick={onClose} className="h-tap px-3 text-label text-ink-tertiary active:text-ink">Done</button>
      </div>

      {!isOnline() && (
        <p className="text-label text-ink-secondary px-1 flex items-center gap-1.5">
          <CloudOff size={12} /> Search needs a connection.
        </p>
      )}
      {error && <p className="text-label text-danger px-1">{error}</p>}

      {busy && (
        <div className="flex justify-center py-6">
          <span className="w-5 h-5 rounded-full border-2 border-muted border-t-accent animate-spin" />
        </div>
      )}

      {!busy && searched && results.length === 0 && !error && (
        <p className="text-center text-label text-ink-tertiary py-8">
          No one with that username.<br />
          <span className="text-label">Usernames have to match exactly from the start.</span>
        </p>
      )}

      {results.length > 0 && (
        <ul className="bg-glass border border-glass-border rounded-card p-3 divide-y divide-hairline">
          {results.map((r) => (
            <li key={r.id} className="py-2.5 flex items-center gap-3">
              <Avatar profile={r} size={38} />
              <div className="flex-1 min-w-0">
                <div className="text-label font-semibold truncate">{r.display_name}</div>
                <div className="text-label text-ink-tertiary truncate">@{r.username}</div>
              </div>
              <RelationshipButton row={r} onAdd={() => add(r)} />
            </li>
          ))}
        </ul>
      )}

      {q.trim().length < 2 && (
        <p className="text-center text-label text-ink-tertiary py-8 px-6 leading-relaxed">
          Type at least 2 characters of someone's username.
          People can only be found by username, never by browsing.
        </p>
      )}
    </div>
  );
}

function RelationshipButton({ row, onAdd }) {
  if (row.relationship === 'self') {
    return <span className="text-label text-ink-tertiary shrink-0">You</span>;
  }
  if (row.relationship === 'friends') {
    return <span className="text-label text-done flex items-center gap-1 shrink-0"><Check size={13} /> Friends</span>;
  }
  if (row.relationship === 'requested') {
    return <span className="text-label text-ink-tertiary flex items-center gap-1 shrink-0"><Clock size={13} /> Sent</span>;
  }
  return (
    <button
      onClick={onAdd}
      className="h-9 px-3 rounded-control bg-primary text-on-primary text-label font-semibold flex items-center gap-1.5 active:opacity-80 shrink-0"
    >
      <UserPlus size={14} /> {row.relationship === 'incoming' ? 'Accept' : 'Add'}
    </button>
  );
}
