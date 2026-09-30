import { useCallback, useEffect, useState } from 'react';
import { Trophy, CloudOff, Info, EyeOff } from 'lucide-react';
import { Avatar } from './AppHeader.jsx';
import Segmented from './Segmented.jsx';
import { fetchLeaderboard } from '../services/challengesApi.js';
import { fetchGlobalLeaderboard } from '../services/communityApi.js';
import { useToast } from './Toast.jsx';

// Leaderboards, ranked by consistency rather than volume.
//
// There is no volume board on purpose. Ranking by kilograms moved pays people to
// do twenty sets of light curls, which is worse training and a worse product.
// Workouts and streaks can only go up by actually turning up.
//
// TWO SCOPES, TWO FUNCTIONS, ON PURPOSE
// Everyone calls global_leaderboard(); Friends calls friends_leaderboard(). They
// are not one function with an argument, because the friends board is SECURITY
// INVOKER precisely so that row-level security hides the numbers of friends who
// turned stat sharing off. Routing it through the global function — which is
// SECURITY DEFINER — would run it with elevated rights and quietly undo that.
// The switch is here in the UI, where it costs nothing.
const SCOPES = [
  { value: 'global', label: 'Everyone' },
  { value: 'friends', label: 'Friends' }
];

const METRICS = [
  { value: 'workouts', label: 'Workouts' },
  { value: 'streak', label: 'Streak' },
  { value: 'this_week', label: 'This week' }
];

export default function LeaderboardPanel({ onOpenProfile, refreshToken, profile, onOpenSettings }) {
  const [scope, setScope] = useState('global');
  const [metric, setMetric] = useState('workouts');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = scope === 'global'
        ? await fetchGlobalLeaderboard(metric)
        : await fetchLeaderboard(metric);
      setRows(res.rows);
      setStale(!!res.stale);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [scope, metric, toast]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const valueFor = (r) =>
    metric === 'streak' ? `${r.streak_weeks}w`
    : metric === 'this_week' ? r.this_week
    : r.workouts;

  // The global board carries a real rank, so someone sitting at 214th sees 214
  // rather than the position of their row on screen. The friends board has no
  // rank column and never needed one — its list is the whole circle.
  const placeFor = (r, i) => (scope === 'global' && r.rank ? r.rank : i + 1);

  const hidden = scope === 'global' && profile && profile.share_activity === false;

  return (
    <div className="space-y-3">
      <Segmented value={scope} onChange={setScope} options={SCOPES} />
      <Segmented value={metric} onChange={setMetric} options={METRICS} />

      {/* Absent from the global board is a confusing thing to be without being
          told why. */}
      {hidden && (
        <button
          onClick={onOpenSettings}
          className="w-full text-left bg-card border border-border rounded-2xl p-3 flex items-start gap-2.5 active:border-accent"
        >
          <EyeOff size={16} className="text-muted shrink-0 mt-0.5" />
          <span className="min-w-0">
            <span className="text-sm block">You are not on this board</span>
            <span className="text-[11px] text-muted block leading-snug mt-0.5">
              Community sharing is off, so your totals are hidden. Tap to change it.
            </span>
          </span>
        </button>
      )}

      {stale && (
        <p className="text-[11px] text-warn flex items-center gap-1.5 px-1">
          <CloudOff size={12} /> Showing the saved board — you are offline.
        </p>
      )}

      {loading && rows.length === 0 && (
        <div className="flex justify-center py-10">
          <span className="w-5 h-5 rounded-full border-2 border-muted border-t-accent animate-spin" />
        </div>
      )}

      {!loading && rows.length <= 1 && (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <Trophy size={26} className="text-muted mx-auto mb-2" />
          <p className="text-sm font-medium">Just you so far</p>
          <p className="text-xs text-muted mt-1">
            {scope === 'friends'
              ? 'Add friends and you will all show up here.'
              : 'Nobody else has published a workout yet.'}
          </p>
        </div>
      )}

      {rows.length > 1 && (
        <ul className="bg-surface border border-border rounded-2xl p-3 divide-y divide-border">
          {rows.map((r, i) => (
            <li key={r.user_id}>
              <button
                onClick={() => !r.is_me && onOpenProfile?.(r.user_id)}
                disabled={r.is_me}
                className="w-full py-2.5 flex items-center gap-3 text-left active:opacity-70 disabled:active:opacity-100"
              >
                <span className={`min-w-[24px] text-center text-sm font-bold tabular-nums shrink-0 ${
                  placeFor(r, i) === 1 ? 'text-warn' : 'text-muted'
                }`}>
                  {placeFor(r, i)}
                </span>
                <Avatar profile={r} size={34} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${r.is_me ? 'font-bold' : 'font-medium'}`}>
                    {r.display_name}{r.is_me && <span className="text-muted font-normal"> · you</span>}
                  </div>
                  <div className="text-[11px] text-muted truncate">@{r.username}</div>
                </div>
                <span className="text-base font-bold tabular-nums shrink-0">{valueFor(r)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted px-1 flex items-start gap-1.5 leading-relaxed">
        <Info size={12} className="mt-0.5 shrink-0" />
        Ranked by how often you train, not by total weight moved — a volume board
        would just reward padding out junk sets.
      </p>
    </div>
  );
}
