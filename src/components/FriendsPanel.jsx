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
        className="w-full h-11 rounded-xl bg-card border border-border flex items-center gap-2 px-3 text-sm text-muted active:border-accent"
      >
        <Search size={16} /> Find someone by username
      </button>

      {stale && (
        <p className="text-[11px] text-warn flex items-center gap-1.5 px-1">
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
                <div className="text-sm font-medium truncate">{r.display_name}</div>
                <div className="text-xs text-muted truncate">@{r.username}</div>
              </div>
              <button
                onClick={() => respond(r.other_id, true)}
                aria-label={`Accept ${r.display_name}`}
                className="w-10 h-10 rounded-xl bg-success text-white flex items-center justify-center active:opacity-80"
              >
                <Check size={18} />
              </button>
              <button
                onClick={() => respond(r.other_id, false)}
                aria-label={`Decline ${r.display_name}`}
                className="w-10 h-10 rounded-xl border border-border text-muted flex items-center justify-center active:bg-card"
              >
                <X size={18} />
              </button>
            </li>
          ))}
        </Group>
      )}

      <Group title={friends.length ? `Friends (${friends.length})` : 'Friends'}>
        {friends.length === 0 && !loading && (
          <li className="py-6 text-center text-sm text-muted">
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
                <div className="text-sm font-medium truncate">{r.display_name}</div>
                <div className="text-xs text-muted truncate">
                  {r.total_workouts != null
                    ? `${r.total_workouts} workouts${r.streak_weeks ? ` · ${r.streak_weeks}w streak` : ''}`
                    : `@${r.username}`}
                </div>
              </div>
              <ChevronRight size={18} className="text-muted shrink-0" />
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
                <div className="text-sm font-medium truncate">{r.display_name}</div>
                <div className="text-xs text-muted truncate">@{r.username}</div>
              </div>
              <span className="text-xs text-muted flex items-center gap-1 shrink-0">
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
    <section className="bg-surface border border-border rounded-2xl p-3">
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <ul className="divide-y divide-border">{children}</ul>
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
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Search by username"
            className="w-full h-11 pl-9 pr-3 rounded-xl bg-card border border-border outline-none focus:border-accent text-sm"
          />
        </div>
        <button onClick={onClose} className="h-11 px-3 text-sm text-muted active:text-text">Done</button>
      </div>

      {!isOnline() && (
        <p className="text-xs text-warn px-1 flex items-center gap-1.5">
          <CloudOff size={12} /> Search needs a connection.
        </p>
      )}
      {error && <p className="text-xs text-danger px-1">{error}</p>}

      {busy && (
        <div className="flex justify-center py-6">
          <span className="w-5 h-5 rounded-full border-2 border-muted border-t-accent animate-spin" />
        </div>
      )}

      {!busy && searched && results.length === 0 && !error && (
        <p className="text-center text-sm text-muted py-8">
          No one with that username.<br />
          <span className="text-xs">Usernames have to match exactly from the start.</span>
        </p>
      )}

      {results.length > 0 && (
        <ul className="bg-surface border border-border rounded-2xl p-3 divide-y divide-border">
          {results.map((r) => (
            <li key={r.id} className="py-2.5 flex items-center gap-3">
              <Avatar profile={r} size={38} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.display_name}</div>
                <div className="text-xs text-muted truncate">@{r.username}</div>
              </div>
              <RelationshipButton row={r} onAdd={() => add(r)} />
            </li>
          ))}
        </ul>
      )}

      {q.trim().length < 2 && (
        <p className="text-center text-xs text-muted py-8 px-6 leading-relaxed">
          Type at least 2 characters of someone's username.
          People can only be found by username, never by browsing.
        </p>
      )}
    </div>
  );
}

function RelationshipButton({ row, onAdd }) {
  if (row.relationship === 'self') {
    return <span className="text-xs text-muted shrink-0">You</span>;
  }
  if (row.relationship === 'friends') {
    return <span className="text-xs text-success flex items-center gap-1 shrink-0"><Check size={13} /> Friends</span>;
  }
  if (row.relationship === 'requested') {
    return <span className="text-xs text-muted flex items-center gap-1 shrink-0"><Clock size={13} /> Sent</span>;
  }
  return (
    <button
      onClick={onAdd}
      className="h-9 px-3 rounded-lg bg-accent text-white text-xs font-semibold flex items-center gap-1.5 active:opacity-80 shrink-0"
    >
      <UserPlus size={14} /> {row.relationship === 'incoming' ? 'Accept' : 'Add'}
    </button>
  );
}
