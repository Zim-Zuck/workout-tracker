import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, CloudOff, Swords, Users } from 'lucide-react';
import { Avatar } from './AppHeader.jsx';
import { fetchCommunityWeek } from '../services/communityApi.js';
import { buildCommunityWeek } from '../services/communityWeek.js';
import { currentWeekKey } from '../services/weeklySummary.js';
import { formatWeight } from '../utils/units.js';

// The community's week.
//
// Deliberately a different shape from the friends recap next door. That one is a
// story about five people, ranked on the device, with shareable cards. This is a
// noticeboard: how many people trained, who did the most, and where you came in.
// A community of two hundred has no story arc, and pretending otherwise would
// mean shipping everyone's week to everyone's phone to find one.
export default function CommunityWeekPanel({ onOpenProfile, refreshToken }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState(null);

  const week = currentWeekKey();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCommunityWeek(week);
      setPayload(res.payload);
      setStale(!!res.stale);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const wk = useMemo(() => (payload ? buildCommunityWeek(payload) : null), [payload]);

  if (loading && !wk) {
    return (
      <div className="flex justify-center py-10">
        <span className="w-5 h-5 rounded-full border-2 border-muted border-t-accent animate-spin" />
      </div>
    );
  }

  if (error && !wk) {
    return (
      <Card>
        <p className="text-label font-semibold">Could not load the community week</p>
        <p className="text-label text-ink-tertiary mt-1">{error}</p>
        <button onClick={load} className="mt-3 h-10 px-4 rounded-row border border-glass-border text-label active:bg-glass-inset">
          Try again
        </button>
      </Card>
    );
  }

  if (!wk) return null;

  return (
    <div className="space-y-3">
      <section className="bg-glass border border-glass-border rounded-card p-4">
        <div className="flex items-center gap-1.5 text-micro tracking-normal tracking-[0.18em] font-semibold text-ink-tertiary">
          <CalendarRange size={12} /> KUN THIS WEEK
        </div>
        <h2 className="text-title font-semibold leading-tight mt-1">{wk.rangeLabel}</h2>

        {!wk.hasData ? (
          <p className="text-label text-ink-tertiary mt-2 leading-relaxed">
            Nobody has logged a session yet this week. Be the first.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-2 mt-3">
            {wk.stats.map((s) => (
              <div key={s.id} className="rounded-row bg-glass-inset border border-glass-border p-2.5">
                <dd className="text-body font-semibold tabular-nums leading-tight">{s.value}</dd>
                <dt className="text-micro tracking-normal text-ink-tertiary leading-snug">{s.label}</dt>
              </div>
            ))}
          </dl>
        )}

        {/* Said plainly rather than left as a gap. A missing number that nobody
            explains reads as a bug. */}
        {wk.volumeWithheld && (
          <p className="text-micro tracking-normal text-ink-tertiary mt-2 leading-relaxed">
            Total weight lifted appears once {wk.minAggregateUsers} or more people have trained in a
            week — below that it would give away an individual's numbers.
          </p>
        )}
      </section>

      {wk.me && (
        <section className="bg-glass border border-focus/40 rounded-card p-3">
          <h3 className="text-label font-semibold mb-2">Your week</h3>
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Sessions" value={String(wk.me.workouts)} />
            <Mini label="Records" value={String(wk.me.prs)} />
            <Mini label="Volume" value={formatWeight(wk.me.volumeKg, { group: true, withUnit: false })} />
          </div>
          {wk.me.rank && (
            <p className="text-micro tracking-normal text-ink-tertiary mt-2 text-center">
              {wk.me.rank === 1
                ? `Most sessions of anyone training this week.`
                : `${ordinal(wk.me.rank)} on sessions out of ${wk.me.ofPeople} people training.`}
            </p>
          )}
        </section>
      )}

      {wk.boards.map((b) => (
        <section key={b.id} className="bg-glass border border-glass-border rounded-card p-3">
          <h3 className="text-label font-semibold mb-1 flex items-center gap-1.5">
            <span aria-hidden="true">{b.emoji}</span> {b.title}
          </h3>
          <ul className="divide-y divide-hairline">
            {b.rows.map((r, i) => (
              <li key={r.user_id}>
                <button
                  onClick={() => onOpenProfile?.(r.user_id)}
                  className="w-full py-2.5 flex items-center gap-3 text-left active:opacity-70"
                >
                  <span className={`w-5 text-center text-label font-semibold tabular-nums shrink-0 ${
                    i === 0 ? 'text-ink-secondary' : 'text-ink-tertiary'
                  }`}>
                    {i + 1}
                  </span>
                  <Avatar profile={r} size={30} />
                  <div className="flex-1 min-w-0">
                    <div className="text-label font-semibold truncate">{r.display_name}</div>
                    <div className="text-micro tracking-normal text-ink-tertiary truncate">@{r.username}</div>
                  </div>
                  <span className="text-label font-semibold tabular-nums shrink-0">{r.value}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {(wk.challenges.created > 0 || wk.challenges.completed > 0) && (
        <section className="bg-glass border border-glass-border rounded-card p-3 flex items-center gap-3">
          <Swords size={18} className="text-ink shrink-0" />
          <p className="text-label">
            {wk.challenges.created > 0 && (
              <>{wk.challenges.created} challenge{wk.challenges.created === 1 ? '' : 's'} started</>
            )}
            {wk.challenges.created > 0 && wk.challenges.completed > 0 && ' · '}
            {wk.challenges.completed > 0 && (
              <>{wk.challenges.completed} settled</>
            )}
          </p>
        </section>
      )}

      {stale && (
        <p className="text-micro tracking-normal text-ink-secondary flex items-center gap-1.5 px-1">
          <CloudOff size={12} /> Showing the saved week — you are offline.
        </p>
      )}

      <p className="text-micro tracking-normal text-ink-tertiary px-1 flex items-start gap-1.5 leading-relaxed">
        <Users size={12} className="mt-0.5 shrink-0" />
        Built from the weekly totals of people who turned community sharing on.
      </p>
    </div>
  );
}

function Card({ children }) {
  return <div className="bg-glass border border-glass-border rounded-card p-4">{children}</div>;
}

function Mini({ label, value }) {
  return (
    <div className="rounded-row bg-glass-inset border border-glass-border p-2 text-center">
      <p className="text-body font-semibold tabular-nums leading-tight">{value}</p>
      <p className="text-micro tracking-normal text-ink-tertiary">{label}</p>
    </div>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
