import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, CloudOff, Sparkles, Users, ChevronRight, Share2, Download } from 'lucide-react';
import { Avatar } from './AppHeader.jsx';
import { useToast } from './Toast.jsx';
import RecapCards from './RecapCards.jsx';
import { DRAWERS } from '../utils/recapCanvas.js';
import { canShareFiles, shareImage, recapShareText } from '../utils/shareImage.js';
import { fetchWeeklyRecap, getRecentlyShown, rememberShown } from '../services/recapApi.js';
import { buildWeeklyRecap, namesOf } from '../services/weeklyRecap.js';
import { currentWeekKey } from '../services/weeklySummary.js';
import { formatWeight } from '../utils/units.js';

// "This Week" — the live view of the circle's week, and the door to the three
// recap cards.
//
// The in-app screen and the exported cards read from ONE engine
// (buildWeeklyRecap), so what a person sees here and what they share are never
// two different versions of the week.
export default function WeeklyRecapPanel({ onOpenProfile, refreshToken, unit = 'kg' }) {
  const [payload, setPayload] = useState(null);
  const [recentIds, setRecentIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState(null);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const toast = useToast();

  const week = currentWeekKey();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, recent] = await Promise.all([fetchWeeklyRecap(week), getRecentlyShown(week)]);
      setPayload(res.payload);
      setRecentIds(recent);
      setStale(!!res.stale);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const recap = useMemo(
    () => (payload ? buildWeeklyRecap({ payload, unit, recentIds }) : null),
    [payload, unit, recentIds]
  );

  // Recorded when the recap is actually looked at or sent. Damping a statistic
  // the user never saw would rotate the recap against itself.
  const markSeen = () => {
    if (recap?.shownIds?.length) rememberShown(week, recap.shownIds).catch(() => {});
  };

  const openCards = () => {
    setCardsOpen(true);
    markSeen();
  };

  // Share straight from the Social tab, without opening the viewer first.
  //
  // This is the shortest path through the loop the whole feature exists for:
  // train, see the recap, send it to the group chat, someone asks what app
  // that is. Making people open a viewer and find a button inside it put two
  // taps in front of the only step that brings anyone new in.
  //
  // Chapter one is what gets sent: it is the one card that reads at a glance in
  // a chat thread. The other two are one swipe away inside the viewer.
  const shareHero = async () => {
    if (!recap?.hasData || sharing) return;
    setSharing(true);
    try {
      // Painted into a detached canvas — this never needs to be on screen, and
      // rendering it off-screen means the share sheet opens on the same tap
      // rather than after a visible card mounts.
      const canvas = document.createElement('canvas');
      const png = DRAWERS.wrapped(canvas, recap);
      if (!png) throw new Error('This card could not be prepared on this device.');
      const result = await shareImage(png, `kun-this-week-${recap.weekKey}.png`, {
        title: 'This Week — Kun Workouts',
        text: recapShareText('The Week', recap.rangeLabel)
      });
      markSeen();
      // A dismissed share sheet is the user changing their mind, not an event.
      if (result === 'saved') toast('Saved to your device', { tone: 'success' });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setSharing(false);
    }
  };

  if (loading && !recap) {
    return (
      <div className="flex justify-center py-10">
        <span className="w-5 h-5 rounded-full border-2 border-muted border-t-accent animate-spin" />
      </div>
    );
  }

  if (error && !recap) {
    return (
      <Card>
        <p className="text-sm font-medium">Could not load this week</p>
        <p className="text-xs text-muted mt-1">{error}</p>
        <button onClick={load} className="mt-3 h-10 px-4 rounded-xl border border-border text-sm active:bg-card">
          Try again
        </button>
      </Card>
    );
  }

  if (!recap) return null;

  // A circle of one. The recap is about comparison, so rather than showing a
  // person a leaderboard they have already won, point them at the thing that
  // would make it work.
  if (recap.members.length < 2) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Users size={16} className="text-accent" />
          <p className="text-sm font-medium">Your week, on your own</p>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Add a friend and every Monday you both get a recap of the week — who moved the most,
          who set the most records, and a few things neither of you expected.
        </p>
      </Card>
    );
  }

  const sorted = [...recap.members].sort((a, b) => b.vol - a.vol || b.workouts - a.workouts);
  const leader = recap.hero?.groups?.[0];

  return (
    <div className="space-y-3">
      <section className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="p-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] tracking-[0.18em] font-semibold text-muted">
                <CalendarRange size={12} /> THIS WEEK
              </div>
              <h2 className="text-2xl font-bold leading-tight mt-1">{recap.rangeLabel}</h2>
            </div>
            {recap.awards.length > 0 && (
              <span className="shrink-0 mt-1 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-accent/15 border border-accent/30 text-[11px] font-semibold text-accent">
                <Sparkles size={12} />
                {recap.awards.length} award{recap.awards.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {/* The teaser. Enough to make you want the cards, not enough to
              replace them — the point of the feature is the reveal. */}
          <p className="text-xs text-muted mt-2 leading-relaxed">
            {recap.hasData && leader
              ? `${namesOf(leader.members, 2)} leads on ${recap.hero.category.label.replace(/^Most /, '').replace(/^Biggest /, '')}. ${recap.totals.people} of ${recap.totals.members} have trained.`
              : 'Nobody has logged a session yet. Be the first and the week is yours.'}
          </p>
        </div>

        {recap.hasData && (
          <ul className="px-4 pb-1 divide-y divide-border">
            {sorted.slice(0, 6).map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => !m.is_me && onOpenProfile?.(m.id)}
                  disabled={m.is_me}
                  className="w-full py-2.5 flex items-center gap-3 text-left active:opacity-70 disabled:active:opacity-100"
                >
                  <Avatar profile={m} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${m.is_me ? 'font-bold' : 'font-medium'}`}>
                      {m.display_name}
                      {m.is_me && <span className="text-muted font-normal"> · you</span>}
                    </div>
                    <div className="text-[11px] text-muted truncate">
                      {/* Someone who has not trained is shown as waiting, not
                          as losing. They have six days left. */}
                      {m.trained
                        ? `${m.workouts} session${m.workouts === 1 ? '' : 's'}${m.prs > 0 ? ` · ${m.prs} PR${m.prs === 1 ? '' : 's'}` : ''}`
                        : 'Yet to train this week'}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0 text-muted">
                    {m.trained ? formatWeight(m.vol, unit, { group: true }) : '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {sorted.length > 6 && (
          <p className="px-4 pb-2 text-[11px] text-muted">+{sorted.length - 6} more in the recap</p>
        )}

        {/* Split action: viewing and sharing are both one tap, and neither is
            hidden behind the other. */}
        <div className="flex border-t border-border">
          <button
            onClick={openCards}
            className="flex-1 h-12 bg-accent text-white font-semibold flex items-center justify-center gap-2 active:opacity-80"
          >
            View the recap <ChevronRight size={18} />
          </button>
          {recap.hasData && (
            <button
              onClick={shareHero}
              disabled={sharing}
              aria-label={canShareFiles() ? 'Share this week' : 'Save this week as an image'}
              className="w-[92px] h-12 bg-accent/15 text-accent font-semibold border-l border-accent/30 flex items-center justify-center gap-1.5 active:opacity-70 disabled:opacity-50"
            >
              {sharing
                ? <span className="w-4 h-4 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
                : <>{canShareFiles() ? <Share2 size={16} /> : <Download size={16} />} <span className="text-[13px]">{canShareFiles() ? 'Share' : 'Save'}</span></>}
            </button>
          )}
        </div>
      </section>

      {stale && (
        <p className="text-[11px] text-warn flex items-center gap-1.5 px-1">
          <CloudOff size={12} /> Showing the saved week — you are offline.
        </p>
      )}

      <p className="text-[11px] text-muted px-1 leading-relaxed">
        Built from weekly totals your friends chose to share. Nobody sees your individual sets,
        reps or notes — those never leave your device.
      </p>

      <RecapCards open={cardsOpen} recap={recap} onClose={() => setCardsOpen(false)} />
    </div>
  );
}

function Card({ children }) {
  return <div className="bg-surface border border-border rounded-2xl p-4">{children}</div>;
}
