# Lift — Offline Workout Tracker (PWA)

A one-handed, offline-first workout logger built for iPhone Safari → Add to Home Screen.
All data is stored locally in IndexedDB. No account, no server, no analytics.

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

## Data model

All weights are stored internally as kilograms; the user's `kg`/`lbs` preference is display-only, so switching units never corrupts history.

- **Exercise** — `{ id, name, muscleGroups[], equipment, defaultReps: [low, high], defaultRestSec, builtin }`
- **Workout** — `{ id, date, startTime, endTime, name, exercises: [exerciseId], sets: [Set], notes, isActive }`
- **Set** — `{ id, exerciseId, type: 'warmup'|'working'|'drop'|'failure', weightKg, reps, timestamp, completed, rpe?, notes? }`
- **Meta** — `schemaVersion`, `initialized`

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
