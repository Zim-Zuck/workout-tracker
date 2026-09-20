# Kun Workouts — Offline-First Workout Tracker with a Social Layer (PWA)

A one-handed, offline-first workout logger built for iPhone Safari → Add to Home Screen.
Your workouts live in IndexedDB on the device. An **optional** account adds friends,
challenges and cloud backup on top — the tracker works completely without one.

Features:

- Fast set logging with big touch targets, +/- weight and rep steppers
- Double-progression recommendations with a plain-English explanation
- Automatic PR detection (weight, reps, e1RM, volume)
- Rest timer that survives navigation and iOS background suspension
- Dashboard: weekly volume, per-muscle volume, per-exercise 1RM & top-weight
- Full workout history: filter, edit, delete
- Custom exercise library on top of a 30+ exercise seed set
- JSON export / import backups with schema versioning
- Fully offline after first load (Service Worker + Web App Manifest)
- Dark theme, iOS safe-area handling, screen-reader labels
- **Optional account**: profile, friends, 1v1 "Beat My PR" challenges, friends leaderboard, cloud backup

## Local development

Requirements: [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → ./dist
npm run preview      # serve the production build locally at :4173
```

The Service Worker is only registered in the production build to avoid caching conflicts with Vite HMR. Test the offline experience with `npm run build && npm run preview`, load once with the network on, then toggle Chrome DevTools' *Offline* checkbox (or airplane mode on a phone).

Sample seed data is loaded in `npm run dev` on an empty database so the dashboard has something to render. In production the app starts empty. You can force-reseed from **Settings → Data → Seed sample data** (dev-only button).

## Deploy for free

### Vercel

1. Push this folder to a GitHub repo.
2. Import the repo in Vercel — it auto-detects Vite (`npm run build`, output `dist`).
3. No routing config is needed; the app is a single HTML file.

### GitHub Pages

Because Vite is configured with `base: './'`, the built assets use relative URLs and Pages sub-paths just work.

```bash
npm run build
# push ./dist to the gh-pages branch — e.g. with the `gh-pages` npm CLI:
npx gh-pages -d dist
```

Then in the repo settings enable Pages → Deploy from branch → `gh-pages` / `/ (root)`.

### SPA routing & the Service Worker

The app uses a single route (`/`) and internal tab state, so no SPA rewrite rules are required. The Service Worker (`public/sw.js`) uses **network-first** for HTML (so updates propagate on next launch) and **cache-first** for JS/CSS/icon assets. To force a full refresh after deploy, close and reopen the standalone app.

## Install on iPhone

1. Open the deployed URL in **Safari** (not Chrome — only Safari can install PWAs on iOS).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch the app from the Home Screen icon — it opens standalone, without Safari chrome.
4. Verify offline: turn on Airplane Mode, tap the icon; the app should load and every screen should work.

## The social layer (optional)

Signing in is optional and changes nothing about how workouts are logged. Without an
account — or with no connection — the app behaves exactly as it always did.

### What leaves the device

Only summaries, and only when signed in. All of it is derived in
[`src/services/socialSummary.js`](src/services/socialSummary.js), which is the entire
local→cloud boundary for workout data:

| Published | Never published |
| --- | --- |
| Streak, total workouts, lifetime volume, last workout date | Individual sets, reps, RPE |
| Per-exercise top weight + reps + est. 1RM | Workout notes and names |
| Profile: username, display name, avatar, bio | Custom exercises, settings, rest timer |

Only the ~30 **built-in** exercises are published. Custom exercises get device-random
ids that cannot be matched against another user's, so comparing them would be
meaningless. They still count toward volume and workout totals.

### Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env` and fill in the Project URL and **anon/public** key
   from Project Settings → API. The `service_role` key must never appear in this repo
   or in any client bundle — it bypasses every security policy below.
3. Authentication → Sign In / Providers → Email: enable the email provider and email
   signup. Leave **Confirm email** on for production; turning it off makes local
   testing with multiple accounts much faster.
4. Run each file in `supabase/migrations/` in order, via the Supabase SQL editor.
   Every migration is idempotent and safe to re-run.

Built without `.env`, the app simply runs as the original offline tracker with the
social features absent — `CLOUD_CONFIGURED` is false and no social UI is offered.

### Security model

Read [`supabase/migrations/`](supabase/migrations/) for the authoritative version; in short:

- **Identity and stats are separate tables.** Postgres RLS filters rows, not columns, so
  "a stranger sees your name but not your numbers" cannot be enforced on one table.
  `profiles` is readable by any signed-in user (this is what makes username search work);
  `profile_stats` and `user_lifts` are gated behind `can_view_stats()`, the single
  definition of the friends-only rule.
- **Privacy is all-or-nothing**, defaulting to sharing with accepted friends. One toggle.
- **Every relational write goes through a `SECURITY DEFINER` function**, not a table
  policy: who may accept a friend request, what a crossing request means, when a
  challenge clock starts. `friends_leaderboard` is the one deliberate exception — it is
  `SECURITY INVOKER` so RLS filters it, because as a DEFINER it would have bypassed
  `can_view_stats()` and leaked the numbers of friends who opted out.
- **Notifications have no client insert policy at all.** Only database functions write
  to your inbox, so nobody can spam it except by performing a real action.
- **Challenge progress** is guarded: participants only, active window only, plausible
  values only, monotonic only, and `achieved_at` is always `now()` — you cannot backdate
  a lift into a challenge. Winners are computed from stored progress, never claimed.

**Stated honestly:** the app is local-first, so the phone is the only witness to a lift.
No server can verify that a claimed 110 kg bench happened. The database enforces
ownership, plausibility bounds and no-backdating; beyond that, challenges are between
friends who know each other, and that social trust does the rest. A client-computed
number is not treated as trustworthy anywhere it matters.

### Offline and sync

Finishing a workout never waits on the network. The workout is written to IndexedDB, then
a summary is queued in a local `outbox` store that survives the app being killed. The
queue drains on launch, on the browser's `online` event, and after each workout.

Snapshot writes (stats, lifts) are idempotent upserts, so a queued item is superseded
rather than replayed and a missed sync self-heals. Challenge progress cannot ride the
queue — reporting it needs the list of active challenges, which is a network read — so it
is re-reported on every sync instead, and the server ignores anything that is not an
improvement.

Leaderboards rank by **workouts and streak, never volume**. A volume board rewards
padding out junk sets; consistency can only go up by turning up.

## Data model

All weights are stored internally as kilograms; the user's `kg`/`lbs` preference is display-only, so switching units never corrupts history.

- **Exercise** — `{ id, name, muscleGroups[], equipment, defaultReps: [low, high], defaultRestSec, builtin }`
- **Workout** — `{ id, date, startTime, endTime, name, exercises: [exerciseId], sets: [Set], notes, isActive }`
- **Set** — `{ id, exerciseId, type: 'warmup'|'working'|'drop'|'failure', weightKg, reps, timestamp, completed, rpe?, notes? }`
- **Meta** — `schemaVersion`, `initialized`, `lastCloudBackupAt`
- **Outbox** (local only, v2) — `{ id, kind, payload, createdAt, attempts, lastError }`
- **Social cache** (local only, v2) — last successful read per social screen, for offline render

IndexedDB is at `lift-db` v2. The v2 upgrade only added the two local-only stores above;
neither is exported, so the backup format stays at `schemaVersion: 1` and files written by
either version remain interchangeable.

Export shape:

```json
{
  "app": "lift-workout-tracker",
  "schemaVersion": 1,
  "exportedAt": "…",
  "settings": { … },
  "exercises": [ … ],
  "workouts": [ … ]
}
```

## Progression rules

Double progression. Given a target rep range `[low, high]`:

- All working sets ≥ `high` last session → increase load by one increment (2.5 kg / 5 lb).
- Any working set below `low`, or a `failure`-typed set → repeat the same load; the reason line explains what to hit next time.
- Otherwise → repeat load and aim for the top of the range.

The engine never auto-decreases weight based on a bad session — decisions to deload stay with the lifter.

## Accessibility & UX

- Semantic `<nav>` / `<section>` / `<button>` throughout, labeled controls (`aria-label`) for icon-only buttons.
- Every touch target ≥ 44 px per iOS HIG.
- `env(safe-area-inset-*)` respected top and bottom.
- Numeric keyboards on all number inputs (`inputMode="decimal|numeric"`).
- Rest timer announces via `aria-live="polite"` and vibrates when done (`navigator.vibrate` where available).
