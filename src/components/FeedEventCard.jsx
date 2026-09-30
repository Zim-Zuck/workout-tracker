import { useState } from 'react';
import { Avatar } from './AppHeader.jsx';
import { REACTIONS } from '../services/communityEvents.js';
import { relativeDay } from '../utils/date.js';

// One line of community activity.
//
// Event-first, not person-first. The headline carries the achievement and the
// name is inside it, rather than a byline on top with the content underneath —
// that layout is what makes a social network look like a social network, and
// this is a training app. A card is meant to be readable in the two seconds
// between sets.
//
// The three reactions are always all visible, with yours highlighted. A picker
// that opens on tap would be one tap cheaper to ignore and one tap more
// expensive to use, and a single hard-coded reaction would have made the other
// two dead columns in the database.
export default function FeedEventCard({ event, described, onOpenProfile, onReact, onUnreact }) {
  // Held locally so a tap lands instantly. The server is idempotent on both
  // calls — reacting twice cannot double the count and unreacting twice cannot
  // push it below zero — so an optimistic update that loses a race self-corrects
  // on the next load rather than corrupting anything.
  const [mine, setMine] = useState(event.my_reaction || null);
  const [count, setCount] = useState(Number(event.reaction_count) || 0);
  const [busy, setBusy] = useState(false);

  const actor = {
    display_name: event.actor_display_name,
    username: event.actor_username,
    avatar_url: event.actor_avatar_url
  };

  const toggle = async (kind) => {
    if (busy) return;
    setBusy(true);
    const prevMine = mine;
    const prevCount = count;

    try {
      if (mine === kind) {
        setMine(null);
        setCount((c) => Math.max(c - 1, 0));
        await onUnreact(event.id);
      } else {
        // Swapping which reaction you left is not a new reaction: the count
        // only moves when you had none before.
        setMine(kind);
        if (!prevMine) setCount((c) => c + 1);
        await onReact(event.id, kind);
      }
    } catch {
      setMine(prevMine);
      setCount(prevCount);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="bg-surface border border-border rounded-2xl p-3">
      <div className="flex items-start gap-3">
        <button
          onClick={() => !event.is_me && onOpenProfile?.(event.actor_id)}
          disabled={event.is_me}
          aria-label={event.is_me ? undefined : `Open ${actor.display_name || actor.username}'s profile`}
          className="shrink-0 active:opacity-70 disabled:active:opacity-100"
        >
          <Avatar profile={actor} size={36} />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug">
            <span aria-hidden="true">{described.emoji} </span>
            {described.headline}
          </p>

          {described.detail && (
            <p className={`text-base font-bold tabular-nums mt-0.5 ${toneClass(described.tone)}`}>
              {described.detail}
            </p>
          )}

          <div className="flex items-center gap-1 mt-2">
            {REACTIONS.map((r) => {
              const on = mine === r.kind;
              return (
                <button
                  key={r.kind}
                  onClick={() => toggle(r.kind)}
                  disabled={busy}
                  aria-pressed={on}
                  aria-label={r.label}
                  className={`h-8 w-8 rounded-lg border text-sm flex items-center justify-center transition-colors ${
                    on ? 'border-accent bg-accent/15' : 'border-border active:bg-card'
                  } ${busy ? 'opacity-60' : ''}`}
                >
                  <span aria-hidden="true">{r.emoji}</span>
                </button>
              );
            })}

            {count > 0 && (
              <span className="text-[11px] text-muted tabular-nums ml-1">{count}</span>
            )}

            <span className="text-[11px] text-muted ml-auto shrink-0">
              {relativeDay(new Date(event.created_at).getTime())}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function toneClass(tone) {
  if (tone === 'accent') return 'text-accent';
  if (tone === 'success') return 'text-success';
  if (tone === 'warn') return 'text-warn';
  return 'text-text';
}
