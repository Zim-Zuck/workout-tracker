import { useCallback, useEffect, useState } from 'react';
import { Trophy, CloudOff, Info } from 'lucide-react';
import { Avatar } from './AppHeader.jsx';
import { Segmented } from '../pages/Social.jsx';
import { fetchLeaderboard } from '../services/challengesApi.js';
import { useToast } from './Toast.jsx';

// Friends-only leaderboard, ranked by consistency rather than volume.
//
// There is no volume board on purpose. Ranking by kilograms moved pays people to
// do twenty sets of light curls, which is worse training and a worse product.
// Workouts and streaks can only go up by actually turning up.
const METRICS = [
  { value: 'workouts', label: 'Workouts' },
  { value: 'streak', label: 'Streak' },
  { value: 'this_week', label: 'This week' }
];

export default function LeaderboardPanel({ onOpenProfile, refreshToken }) {
  const [metric, setMetric] = useState('workouts');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLeaderboard(metric);
      setRows(res.rows);
      setStale(!!res.stale);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [metric, toast]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const valueFor = (r) =>
    metric === 'streak' ? `${r.streak_weeks}w`
    : metric === 'this_week' ? r.this_week
    : r.workouts;

  return (
    <div className="space-y-3">
      <Segmented value={metric} onChange={setMetric} options={METRICS} />

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
          <p className="text-xs text-muted mt-1">Add friends and you will all show up here.</p>
        </div>
      )}

      {rows.length > 1 && (
        <ul className="bg-surface border border-border rounded-2xl p-3 divide-y divide-border">
          {rows.map((r, i) => (
            <li key={r.user_id}>
              <button
                onClick={() => !r.is_me && onOpenProfile?.(r.user_id)}
                disabled={r.is_me}
                className={`w-full py-2.5 flex items-center gap-3 text-left active:opacity-70 disabled:active:opacity-100 ${
                  r.is_me ? 'opacity-100' : ''
                }`}
              >
                <span className={`w-6 text-center text-sm font-bold tabular-nums shrink-0 ${
                  i === 0 ? 'text-warn' : 'text-muted'
                }`}>
                  {i + 1}
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
