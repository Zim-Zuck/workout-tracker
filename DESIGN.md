# Kun Workouts — Design System

**Ambient Glass.** A dark, warm, single-column phone app. Content sits directly on
a maroon-to-black gradient; glass cards group things that belong together and
nothing else. One typeface, two weights, four accent colours, each with exactly
one meaning.

Everything in this document is enforced by code, not by convention:

| Concern | Enforced by |
|---|---|
| Token values | [`src/theme/tokens.js`](src/theme/tokens.js) — the only file with a hex code, px size or duration in it |
| Tailwind classes | [`tailwind.config.js`](tailwind.config.js) — generated *from* tokens.js. Tailwind's default colour, size and radius scales are **replaced**, so `text-blue-500`, `text-sm` and `rounded-lg` do not exist |
| CSS that Tailwind can't express | [`src/index.css`](src/index.css) — reads the CSS custom properties `applyTokens()` writes at boot |
| Components | [`src/ui/`](src/ui) — screens import from `src/ui/index.js`, never deeper |
| Everything above, visually | `npm run dev` → `http://localhost:5173/?gallery=1` |

If you need a value that isn't here, add it to `tokens.js`. A `#` or a `[13px]`
inside a component is a bug.

---

## 1. Colour

### The page

| Token | Value | Use |
|---|---|---|
| `color.gradient` | `#5A1230 → #2A0A18 → #0A0507` at `0% / 30% / 66%` | The ambient background. Painted **once**, on `<html>`, so the browser anchors it to the viewport and composites it once. Never on a card. |
| `bg` | `#0A0507` | The flat colour beneath the gradient; what the eye reads at the bottom of a long scroll. |
| `surface` | `#1B0A12` | A solid surface for things that must stay legible over arbitrary content (the undo toast), and the reduced-transparency fallback for `glass-inset`. |
| `surfaceRaised` | `#2A0F1B` | The reduced-transparency fallback for `glass`. |

### Ink

| Token | Value | Contrast on `#2A0A18` | Use |
|---|---|---|---|
| `ink` | `#F6EEF0` | 15.9:1 | Headlines, values, anything you must read |
| `inkSecondary` | `#D9C7CD` | 11.3:1 | Supporting text, units, dates, targets |
| `inkTertiary` | `#A6959A` | 6.4:1 | 11px uppercase labels, axis ticks, disabled text |

Contrast is measured against `#2A0A18`, the mid gradient stop. All three also
clear AA against the **brightest** point of the gradient (`#5A1230`, the very top
of the viewport, where the wordmark and split pills sit): 11.8 / 8.3 / 4.7.
`inkTertiary` is the floor — nothing dimmer than it may carry text.

### Glass

| Token | Value |
|---|---|
| `glass` | `rgba(255,255,255,.09)` |
| `glassBorder` | `rgba(255,255,255,.16)` — always exactly 1px |
| `glassInset` | `rgba(255,255,255,.055)` |
| `glassInsetBorder` | `rgba(255,255,255,.08)` |
| `glassPressed` | `rgba(255,255,255,.14)` — the pressed state for **any** glass surface |
| `hairline` | `rgba(255,255,255,.10)` — dividers between list rows |

**Two depths only.** `card` sits on the page; `inset` sits inside a card. There
is no third depth, because a card inside a card inside a card is the decoration
this design exists to remove.

Pressed states **lighten**. Darkening on a dark ground reads as the element
disappearing, not as a press.

### The four accents — strict rules

| Token | Value | Means, and means only |
|---|---|---|
| `primary` / `onPrimary` | `#FFFFFF` on `#1A0610` | **The single main action on a screen.** Nothing else in the app is a white pill, which is what makes it findable without reading. Two on one screen means one of them is not primary. |
| `done` | `#4ADE80` | **Completed sets and trained days.** Not "good", not "success", not "online". A ticked set, a green day on the week strip, a finished-workout event in the feed. |
| `pr` | `#FFC46B` | **Personal records. Nothing else, ever.** If you are reaching for gold and it isn't a PR, you want `ink` or `inkSecondary`. |
| `danger` | `#FF8A8A` | **Destructive actions only.** "Remove from workout", "Delete account". Not errors, not warnings, not "over budget". |

There is **no blue**. The old `#3b82f6` accent is retired; `accent` in the
deprecation shim maps to `ink`, deliberately, so nothing inherits it by accident.

### Chart ink

Bars and lines are content, not accents: `data` (`rgba(246,238,240,.28)`) with
the one highlighted value in `dataStrong` or `ink`. A chart never uses `done`,
`pr` or `danger` unless the individual mark *is* a completed day, a PR, or a
deletion.

### ✅ / ❌

✅ Green check on a completed set. ✅ Gold on "New PR · Seated Chest Press".
✅ White pill on the Start button. ✅ Red on "Remove from workout".

❌ Gold on a "+12.5 kg" delta that isn't a PR. ❌ Green on a "Saved" toast.
❌ A white pill on both "Start" and "Repeat". ❌ Red on a rest-timer warning.

---

## 2. Type

**Inter Tight**, loaded from Google Fonts in `index.html` with a full system
fallback stack (`-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui`). It
is not an npm dependency, and the app renders correctly if the font never
arrives. Two weights: **400 regular**, **600 semibold**.

| Class | Size | Line height | Tracking | Use |
|---|---|---|---|---|
| `text-display` | 56 | 1.0 | −0.035em | Session names on the hero (`Pull`). **One per screen, maximum.** |
| `text-title` | 32 | 1.1 | −0.025em | Screen headlines, big stat values, the numbers in a set row |
| `text-body` | 17 | 1.35 | −0.01em | Default reading size: rows, buttons, sentences |
| `text-label` | 13 | 1.3 | 0 | Secondary lines, metadata, targets, feed sentences |
| `text-micro` | 11 | 1.2 | 0.14em | Uppercase eyebrows, axis ticks, the wordmark |

**Rules**
- A screen uses at most **three** of {title, body, label, micro} **plus** display.
- At most **two weights** on a screen.
- Size utilities set size, leading and tracking — **never** weight. Weight is
  always explicit (`font-regular` / `font-semibold`) so the two never fight.
- Numbers that change (weights, reps, counts, durations) get `.tabular`, so a
  ticking timer doesn't reflow.

---

## 3. Spacing, radii, elevation

**8pt grid.** `xxs` (2) and `xs` (4) are the only sub-grid steps, and only for
optical work inside a component — an icon gap, a hairline offset.

`sm 8 · md 12 · base 16 · lg 20 · xl 24 · xxl 32 · 3xl 40 · 4xl 48 · 5xl 56 · 6xl 64`

Page gutter is `base` (16). Tailwind's numeric scale stays available *only* for
sub-pixel optical work (`w-2` status dot, `-space-x-2` stacked avatars).

**Radii** — `device 48 · hero 28 · card 24 · pill 22 · tile 20 · row 16 · control 12 · full`

**Shadows** are soft and directional, never a glow: the light in this design
comes from the glass border, not from a halo.
`hero · card · pill · sheet · none`

---

## 4. Blur — the performance rule

`backdrop-filter` is allowed on **exactly five things**, all of them chrome that
content scrolls underneath, or one hero element per screen:

1. the hero "Next workout" card
2. the sticky session header (added in Phase 2 — same role as the tab bar: it
   carries the rest countdown and Finish while the exercise list moves beneath it)
3. the resume pill
4. bottom sheets
5. the tab bar

That is the whole list, and it is enforceable by grep: `glass-blur` appears in
`GlassCard`, `BottomSheet`, `ResumePill`, `TabBar` and the session header, and
nowhere else.

**Never on a repeated list item.** Every blurred element is its own compositing
layer; a scrolling list of them drops frames on a real phone. Repeated items use
the same fill with no filter (`GlassCard` without `blur`), which is visually
indistinguishable at rest.

Classes: `.glass-blur` (24px / 140% saturate), `.glass-blur-chrome` (18px / 130%,
for the tab bar, which sits over fast-moving content).

The gradient lives on `<html>`, not on a fixed pseudo-element and not via
`background-attachment: fixed`. Both alternatives make the gradient part of the
scrolling paint, which tore visibly under the blurred elements while scrolling.

---

## 5. Motion

Three durations, one curve, **no overshoot**. Anything springy is off-brand.

`fast 150ms · base 200ms · slow 250ms` · `cubic-bezier(0.2, 0.8, 0.2, 1)`

- Colour and opacity changes: `fast`
- Content swaps (the hero crossfading when a split pill changes): `base`
- Position changes (sheets, toasts rising): `slow`

Named animations live in `index.css`: `.anim-fade`, `.anim-rise`, `.anim-sheet`,
`.anim-cheer`, `.skeleton`.

---

## 6. Accessibility

- **Tap targets are ≥ 44pt.** Always. `IconButton` exists so that a 18px glyph
  still gets a 44pt target; `TextLink` sets `min-height` for the same reason.
- **WCAG AA** minimum for all text (see the ink table).
- **Primary actions are thumb-reachable** — bottom-anchored, or on the right of
  a hero card.
- **`prefers-reduced-motion`** → every animation and transition collapses to 1ms;
  crossfades become cuts; skeletons stop shimmering.
- **`prefers-reduced-transparency`** → every `backdrop-filter` is dropped, glass
  becomes `surfaceRaised` / `surface`, and the gradient becomes flat `bg`.
  Nothing in the design depends on seeing through anything.
- **`forced-colors`** → glass surfaces fall back to a `CanvasText` border.
- Sheets trap focus, restore it on close, close on Escape, and are labelled by
  their title.
- Every icon-only control has an `aria-label`. Every toggle reports
  `aria-pressed`. Live regions are `polite`, never `assertive`.

---

## 7. Layout rules

- One column, `max-w-app` (512px), centred.
- **Content sits on the background.** Cards group; they do not decorate. If a
  card contains one thing, it should not be a card.
- **No cards inside cards.** Use `GlassCard variant="inset"` for the one level of
  nesting that exists.
- **Safe areas are respected**: `.safe-top` on the app shell, `.safe-bottom` on
  the tab bar, and `.pb-nav` on scrolling content.
- The header (wordmark + avatar) is its own row and is **never** overlapped by
  the hero card.
- `--chrome-bottom` is the single computed offset for anything floating above the
  bottom chrome. It accounts for the tab bar, the home indicator, and the resume
  pill when one is showing. Never hardcode a bottom offset.
- The soft light blob under the hero in the mockup is a rendering artifact of the
  mockup tool. It is deliberately **not** reproduced.

---

## 8. Components

All in `src/ui/`, all exported from `src/ui/index.js`, all with default, pressed,
disabled, empty and loading states where those states are meaningful.

| Component | Notes |
|---|---|
| `GlassCard` | `variant`: `card` \| `inset` \| `hero`. `blur` only on the four allowed surfaces. `interactive` adds the pressed state and a 44pt floor. |
| `PrimaryButton` / `PrimaryCircleButton` | The white pill / the circular arrow. One per screen. Same rank, different gesture. |
| `SecondaryButton` | Glass. `tone="danger"` for destructive. |
| `TextLink` | Underlined, not coloured — colour carries meaning here and "tappable" isn't one of the meanings. |
| `IconButton` | Guarantees the 44pt target around a small glyph. |
| `Pill` / `StaticPill` | `selected` is the only state that uses the primary fill. There is no coloured *interactive* pill. |
| `SegmentedPills` | Scrolls rather than compressing — a clipped "Challeng…" is worse than a swipe. Arrow-key navigable. |
| `SegmentedTrack` | A track with one white pill inside. Use for **scopes over the same content** (Everyone / Friends); use `SegmentedPills` for **different content**. |
| `SetRow` | **The set number is a prop, not an array index.** See §9. Its five columns come from `--set-grid`, defined once so the header and the rows cannot drift apart. Warm-ups are lettered (`W`/`D`/`F`), not numbered — they don't count toward volume or PRs, so they don't consume a working-set number. |
| `ExerciseCard` | Swipe left reveals **Skip**. Skip ≠ Remove (§9). The `⋮` opens a **bottom sheet**, never a dropdown. |
| `PRBadge` / `PRHighlight` | The only components allowed to use the PR colour. Three typed kinds: Weight / Reps / Volume. |
| `StatBlock` / `StatRow` | The value is loud, the label is quiet. The reverse is how dashboards become unreadable. |
| `WeekStrip` | Trained days filled green; today outlined in `ink` — an untrained today is a Tuesday morning, not a failure. |
| `ResumePill` | Sets `data-resume` on `<body>`, which is how `.pb-nav` and `--chrome-bottom` reserve room for it without any screen knowing it exists. |
| `UndoToast` | **Solid**, not glass: it appears over arbitrary content and has five seconds to be understood. |
| `BottomSheet` / `SheetAction` | The app's one modal surface. Focus-trapped. `SheetAction` takes a `hint` for options that could be confused (Skip vs Remove). |
| `FeedItem` / `FeedGroup` / `NewItemsPill` | Driven entirely by `feedRegistry.js`. |
| `Avatar` | Fallback is an initial on **glass**, not on an accent — identity is not status, and this palette spends its colours on status. |
| `EmptyState` | Every empty state names one action. "No data yet" is a dead end. |
| `TabBar` | Five tabs. See §10. |
| `Skeleton` / `SkeletonText` | One shimmer definition, so every loading state in the app pulses in step. |

### The feed registry

`src/ui/feedRegistry.js` maps `event_type → { icon, tone, prominence }`.

- `tone` resolves to exactly one semantic colour: `pr` (PR events **only**),
  `done` (completed work, streaks), `neutral` (everything else — which is most).
- `prominence` decides **card treatment, not colour**: `normal` is a row on the
  page; `raised` is a bordered glass card, reserved for milestones and streaks,
  which are rare by construction and can afford to be louder.
- Unknown types render via the `fallback` entry rather than leaving a hole.

Adding an event type later is **one entry here plus one sentence in
`services/communityEvents.js`** — no component changes, no new colour, no new
card shape.

---

## 9. Behaviour rules baked into components

**No confirmation dialogs for skip or remove.** A dialog asks you to predict
whether you'll regret something; an undo toast lets you find out and take it
back. 5 seconds, anchored above the bottom chrome, with a real Undo button.

**Skip is not Remove.**
- *Skip* collapses the exercise to a slim row and **costs the user nothing**: no
  effect on streak, volume comparisons or completion. It's recorded so the
  session builder learns to stop suggesting a lift you keep walking past.
- *Remove* deletes the exercise **and any sets logged for it**.
- The sheet spells the difference out in one line, because two destructive-looking
  options side by side without an explanation is a trap.

**The `⋮` menu is a bottom sheet.** The old dropdown rendered directly over the
weight and reps columns it was asking you to make a decision about.

**Set numbers come from a stable order, never an array index.** The pre-redesign
row numbered itself from its position in a list sorted by `timestamp` — a field
that was rewritten every time a set was checked. Ticking a set therefore moved
it, renumbered its neighbours, and on a millisecond tie rendered two rows both
labelled "2", one checked and one not. `SetRow` now takes `number` as a prop and
has no opinion about ordering at all.

---

## 10. Naming decisions

- The fourth tab is **Community** everywhere a person can read it — tab bar,
  screen title, empty states, settings copy. The internal route id stays
  `social`, and so do every prop, state key and cache key, because renaming a
  string the user never sees is churn. *(This supersedes the earlier "use Social
  everywhere" instruction, at the user's direction.)*
- The first tab is **Today**, not "Workout". The question you open a training app
  with is "what am I doing today?", not "start a blank workout".
- Sessions are named by their **split** (`Pull`), never "Afternoon Workout".
  Existing history keeps whatever names it had; where a name is missing, the
  muscle-group summary is the fallback title.

---

## 11. Decisions taken without asking

Recorded here rather than raised as questions, per the brief:

1. **Inter Tight via Google Fonts**, not vendored and not an npm package. Two
   `<link>`s, `display=swap`, full system fallback. Revisit if offline-first
   typography matters more than build simplicity.
2. **A display size of 56px**, not 64. At 64 a five-letter split name
   ("Upper") overflows a 375pt viewport once the page gutter is applied.
3. **Tailwind's default colour / fontSize / borderRadius scales are replaced**,
   not extended. `text-blue-500` and `rounded-lg` genuinely do not exist, so a
   component cannot quietly escape the system. Spacing *is* extended, because
   sub-grid optical work (a 8px status dot, stacked avatar overlap) legitimately
   needs it.
4. **A deprecation shim** maps the old palette (`card`, `border`, `muted`,
   `text`, `accent`, `success`, `warn`) and Tailwind's old size/radius names onto
   the new tokens, so screens not yet restyled stay usable between phases. It is
   clearly marked in `tailwind.config.js` and **is deleted at the end of Phase
   3**, at which point any remaining usage becomes a visible, findable break.
5. **The undo toast is solid, not glass.** Legibility over consistency for
   something with five seconds to be understood.
6. **The gallery is dev-only**, at `?gallery=1`. It is a workbench for the design
   system, not a screen of the app, and it is not in a production bundle.
7. **Inter Tight is vendored**, not fetched from a CDN — this is an offline-first
   PWA, and a typeface that only arrives with a network is a typeface the app
   does not have at the gym. Two subsets (latin, latin-ext) of the variable font
   cover 400–600 in 135 KB, preloaded and precached by the service worker.
8. **The deprecation shim is gone.** Tailwind's palette is now exactly the design
   system's.

### Decisions from Phases 2 and 3

9. **Splits are derived, with a per-exercise override.** Push = Chest /
   Shoulders / Triceps, Pull = Back / Biceps / Rear Delt / Traps / Forearms,
   Legs = Quads / Hamstrings / Glutes / Calves, Upper = Push ∪ Pull, Lower =
   Legs. `Core` belongs to no split: it rides along with whatever you are
   training rather than defining a day. A custom exercise joins automatically;
   `exercise.split` wins when set.
10. **Frequency picks exercises; estimated 1RM only breaks ties.** Raw weight is
    never compared across exercises — 60 kg of lat pulldown and 60 kg of curl are
    not the same claim, and a builder that ranked by kilograms would fill every
    session with leg press. When frequency and 1RM are both silent (a cold
    start), a **focus score** breaks the tie: the lift that most directly trains
    the target muscle wins, which is what surfaces a leg curl for hamstrings
    rather than whatever comes first alphabetically.
11. **The under-trained slot is filled first**, before the 5–6 exercise cap
    applies, so it can never be squeezed out.
12. **Measured pace is clamped to 60–300 s/set.** Outside that band the number
    is not telling us about training — a session left running while somebody
    drove home reads as 900 s/set, and a "~150 min" estimate would be both wrong
    and discouraging.
13. **Replacing an exercise never reassigns logged sets.** If nothing is logged,
    the swap is clean. If sets exist, they stay attributed to the lift actually
    performed, the replacement is added after it, and the replaced lift is
    marked skipped so its card collapses instead of competing for attention.
14. **Cancelling a workout is undoable, not a dialog.** The session leaves the
    database immediately, so a reload cannot resurrect a half-cancelled state,
    and is held in memory for the life of the toast.
15. **Deleting history is undoable too.** It used to be one tap behind a panel
    claiming it could not be undone. It can be.
16. **Volume totals are grouped and whole** (`6,808 kg`); bar loads keep the
    half-kilo and lose the separator. Charts switch to **tonnes** past ~2 t,
    because "20k kg" reads as "twenty kilo kilograms".
17. **A rank is not a personal record.** First place on the leaderboard is ink,
    not gold. `warn` gold was previously doing three unrelated jobs; offline
    notices became tertiary ink and "replace everything on this device" became
    the destructive colour it always was.
18. **`sm` pills are 44pt tall.** The size difference is carried by type and
    padding, not by the target — a filter chip you have to aim at is a filter
    chip people stop using. The same rule widened the per-set `⋯` column from
    32pt to 44pt.
19. **Your own achievements appear in your feed without an account**, attributed
    to "You". A signed-out user still has PRs, and they are still the most
    interesting thing on their own screen.
20. **The split pill follows the rotation until you tap one.** Finishing a Push
    session moves Today to Pull on its own; from your first tap onward the choice
    is yours and nothing moves it again.
21. **The session header is sticky and owns the rest timer.** The floating rest
    bar it replaced overlapped the set rows it was timing.
