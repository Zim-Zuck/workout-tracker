import { useEffect, useState } from 'react';
import { Bell, UserPlus, UserCheck, Swords, Trophy, Flag, CloudOff } from 'lucide-react';
import { Avatar } from './AppHeader.jsx';
import { listNotifications, markNotificationsRead } from '../services/friendsApi.js';
import { relativeDay } from '../utils/date.js';

// Your inbox: things that concern you, not a feed of everything everyone did.
//
// Deliberately not an activity feed. With three friends a feed looks dead, and a
// feed invites posting — this product is about training, not posts.
const META = {
  friend_request:     { icon: UserPlus,  tone: 'text-accent',  text: (n) => `${name(n)} sent you a friend request` },
  friend_accepted:    { icon: UserCheck, tone: 'text-success', text: (n) => `${name(n)} accepted your friend request` },
  challenge_received: { icon: Swords,    tone: 'text-accent',  text: (n) => `${name(n)} challenged you to beat ${n.payload?.target_label || 'their PR'}` },
  challenge_accepted: { icon: Swords,    tone: 'text-accent',  text: (n) => `${name(n)} accepted your challenge` },
  challenge_declined: { icon: Flag,      tone: 'text-muted',   text: (n) => `${name(n)} declined your challenge` },
  challenge_beaten:   { icon: Trophy,    tone: 'text-warn',    text: (n) => `${name(n)} beat your ${n.payload?.exercise_label || 'PR'}` },
  challenge_ended:    { icon: Trophy,    tone: 'text-warn',    text: (n) => n.payload?.won ? 'You won your challenge' : 'A challenge you were in has ended' }
};

function name(n) {
  return n.actor?.display_name || n.actor?.username || 'Someone';
}

export default function NotificationsPanel({ onOpenProfile, onRead, refreshToken }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await listNotifications();
      if (cancelled) return;
      setRows(res.rows);
      setStale(!!res.stale);
      setLoading(false);

      // Opening the inbox is what marks it read — the badge should clear when
      // you have actually looked, not when a background poll happens to run.
      const unread = res.rows.filter((r) => !r.read_at).map((r) => r.id);
      if (unread.length) {
        await markNotificationsRead(unread);
        onRead?.();
      }
    })();
    return () => { cancelled = true; };
  }, [refreshToken, onRead]);

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <span className="w-5 h-5 rounded-full border-2 border-muted border-t-accent animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <Bell size={28} className="text-muted mx-auto mb-3" />
        <p className="text-sm font-medium">Nothing yet</p>
        <p className="text-xs text-muted mt-1">
          Friend requests and challenge results show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {stale && (
        <p className="text-[11px] text-warn flex items-center gap-1.5 px-1">
          <CloudOff size={12} /> Showing saved notifications — you are offline.
        </p>
      )}
      <ul className="bg-surface border border-border rounded-2xl p-3 divide-y divide-border">
        {rows.map((n) => {
          const meta = META[n.type] || { icon: Bell, tone: 'text-muted', text: () => 'Activity' };
          const Icon = meta.icon;
          return (
            <li key={n.id}>
              <button
                onClick={() => n.actor_id && onOpenProfile?.(n.actor_id)}
                disabled={!n.actor_id}
                className="w-full py-2.5 flex items-start gap-3 text-left active:opacity-70 disabled:active:opacity-100"
              >
                {n.actor ? (
                  <Avatar profile={n.actor} size={34} />
                ) : (
                  <span className="w-[34px] h-[34px] rounded-full bg-card border border-border flex items-center justify-center shrink-0">
                    <Icon size={15} className={meta.tone} />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{meta.text(n)}</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {relativeDay(new Date(n.created_at).getTime())}
                  </p>
                </div>
                {!n.read_at && <span className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0" aria-label="Unread" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
