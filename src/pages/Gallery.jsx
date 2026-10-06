import { useState } from 'react';
import { ArrowRight, ArrowUp, ArrowDown, Repeat, SkipForward, Trash2, Users, Swords, Plus } from 'lucide-react';
import {
  GlassCard, Skeleton, SkeletonText,
  PrimaryButton, PrimaryCircleButton, SecondaryButton, TextLink, IconButton,
  Pill, StaticPill, SegmentedPills, SegmentedTrack,
  Avatar, PRBadge, PRHighlight, StatBlock, StatRow,
  WeekStrip, EmptyState, BottomSheet, SheetAction,
  useUndoToast, TabBar, ResumePill, SetRow, SetRowHeader, ExerciseCard,
  FeedItem, FeedAcceptAction, FeedGroup, NewItemsPill
} from '../ui/index.js';
import AchievementsRow from '../components/AchievementsRow.jsx';
import { AreaChart, RadarChart, DonutChart } from '../components/Chart.jsx';
import { color, text, space, radius, motion, blur, layout } from '../theme/tokens.js';

// The component gallery. Every shared component, in every state, on the real
// background, at phone width.
//
// It exists so a change to a token can be checked against the whole system in
// one scroll instead of by walking five screens, and so "does the disabled state
// exist?" has an answer you can look at. Dev-only: reached at ?gallery=1, never
// bundled into a tab.
export default function Gallery() {
  const undo = useUndoToast();
  const [split, setSplit] = useState('pull');
  const [scope, setScope] = useState('everyone');
  const [sheet, setSheet] = useState(false);
  const [checked, setChecked] = useState({ 1: true });
  const [resume, setResume] = useState(true);
  const [tab, setTab] = useState('today');

  const demoSets = [
    { id: 's0', type: 'warmup',  weightKg: 40, reps: 10, completed: true },
    { id: 's1', type: 'working', weightKg: 60, reps: 10, completed: true },
    { id: 's2', type: 'working', weightKg: 60, reps: 9,  completed: false },
    { id: 's3', type: 'failure', weightKg: 60, reps: 6,  completed: false }
  ];

  return (
    <div className="min-h-screen safe-top">
      <div className="max-w-app mx-auto px-base pb-nav">
        <header className="h-header flex items-center justify-between">
          <span className="text-micro font-semibold uppercase text-ink-secondary">KUN WORKOUTS · GALLERY</span>
          <Avatar profile={{ display_name: 'Kunashe' }} />
        </header>

        {/* ---------------- Tokens ---------------- */}
        <Section title="Colour" note="Four accents, one meaning each. There is no blue.">
          <div className="grid grid-cols-2 gap-sm">
            <Swatch name="bg" value={color.bg} note="page base" />
            <Swatch name="surface" value={color.surface} note="reduced-transparency fallback" />
            <Swatch name="ink" value={color.ink} note="headlines, values" />
            <Swatch name="inkSecondary" value={color.inkSecondary} note="supporting text" />
            <Swatch name="inkTertiary" value={color.inkTertiary} note="11px labels" />
            <Swatch name="glass" value={color.glass} note="+1px border @ .16" />
            <Swatch name="primary" value={color.primary} note="MAIN ACTION ONLY" />
            <Swatch name="done" value={color.done} note="completed sets, trained days" />
            <Swatch name="pr" value={color.pr} note="PRs ONLY" />
            <Swatch name="danger" value={color.danger} note="destructive only" />
          </div>
          <p className="text-label font-regular text-ink-secondary mt-md">
            Gradient {color.gradient.join(' → ')}
          </p>
        </Section>

        <Section title="Type" note="Inter Tight · 400 / 600 · max 3 sizes + display per screen.">
          <GlassCard className="p-base flex flex-col gap-md">
            <p className="text-display font-semibold">Pull</p>
            <p className="text-title font-semibold">6,410 kg</p>
            <p className="text-body font-regular">Wide-Grip Lat Pulldown</p>
            <p className="text-label font-regular text-ink-secondary">5 exercises · 14 sets · ~55 min</p>
            <p className="text-micro font-semibold uppercase text-ink-tertiary">Last session</p>
          </GlassCard>
          <TokenTable rows={Object.entries(text).map(([k, v]) => [k, `${v.size}px / ${v.weight} / ${v.tracking}`])} />
        </Section>

        <Section title="Radii, spacing, motion">
          <TokenTable rows={[
            ...Object.entries(radius).map(([k, v]) => [`radius.${k}`, `${v}px`]),
            ...Object.entries(space).map(([k, v]) => [`space.${k}`, `${v}px`]),
            ...Object.entries(motion).map(([k, v]) => [`motion.${k}`, v]),
            ['blur.glass', blur.glass],
            ['layout.tapMin', `${layout.tapMin}px`]
          ]} />
        </Section>

        {/* ---------------- Components ---------------- */}
        <Section title="GlassCard" note="Two depths. Blur on the hero only.">
          <GlassCard variant="hero" blur className="p-lg">hero · blurred · shadow-hero</GlassCard>
          <GlassCard className="p-base mt-sm">card · the default grouping surface</GlassCard>
          <GlassCard variant="inset" className="p-base mt-sm">inset · a row inside a card</GlassCard>
          <GlassCard interactive className="p-base mt-sm">interactive · press to lighten</GlassCard>
          <GlassCard disabled className="p-base mt-sm">disabled</GlassCard>
          <GlassCard loading className="p-base mt-sm"><SkeletonText lines={2} /></GlassCard>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-sm">
            <PrimaryButton>Start</PrimaryButton>
            <PrimaryButton loading>Start</PrimaryButton>
            <PrimaryButton disabled>Start</PrimaryButton>
            <PrimaryCircleButton icon={ArrowRight} label="Start workout" size={64} />
          </div>
          <div className="flex flex-wrap items-center gap-sm mt-sm">
            <SecondaryButton>Repeat</SecondaryButton>
            <SecondaryButton loading>Repeat</SecondaryButton>
            <SecondaryButton disabled>Repeat</SecondaryButton>
            <SecondaryButton tone="danger" icon={Trash2}>Delete</SecondaryButton>
          </div>
          <div className="flex flex-wrap items-center gap-sm mt-sm">
            <TextLink>Start empty workout</TextLink>
            <TextLink disabled>Disabled link</TextLink>
            <IconButton icon={Plus} label="Add" />
          </div>
        </Section>

        <Section title="Pills and segments">
          <SegmentedPills
            ariaLabel="Split"
            value={split}
            onChange={setSplit}
            options={[
              { value: 'push', label: 'Push' }, { value: 'pull', label: 'Pull' },
              { value: 'legs', label: 'Legs' }, { value: 'upper', label: 'Upper' },
              { value: 'lower', label: 'Lower', disabled: true }
            ]}
          />
          <div className="mt-sm"><SegmentedPills loading options={[{ value: 'a' }, { value: 'b' }, { value: 'c' }]} /></div>
          <SegmentedTrack
            className="mt-md"
            ariaLabel="Scope"
            value={scope}
            onChange={setScope}
            options={[{ value: 'everyone', label: 'Everyone' }, { value: 'friends', label: 'Friends' }]}
          />
          <div className="flex flex-wrap gap-sm mt-md">
            <StaticPill>Barbell</StaticPill>
            <StaticPill tone="done">Completed</StaticPill>
            <StaticPill tone="pr">PR</StaticPill>
            <StaticPill tone="danger">Removed</StaticPill>
          </div>
        </Section>

        <Section title="PR components" note="The only place the PR colour is allowed.">
          <div className="flex flex-wrap gap-sm">
            <PRBadge kind="weight" value="104 kg" delta="9 kg" />
            <PRBadge kind="reps" value="9" />
            <PRBadge kind="volume" size="sm" />
          </div>
          <PRHighlight className="mt-md">New PR · Seated Chest Press · 104 kg est. 1RM · +9 kg</PRHighlight>
        </Section>

        <Section title="Stats and week strip">
          <GlassCard className="p-base">
            <StatRow items={[
              { value: '1', label: 'This week' }, { value: '12', label: 'This month' },
              { value: '8w', label: 'Streak' }, { value: '26', label: 'Total' }
            ]} />
          </GlassCard>
          <GlassCard className="p-base mt-sm"><StatRow loading items={[{ label: 'This week' }, { label: 'Total' }]} /></GlassCard>
          <div className="mt-md">
            <WeekStrip days={demoWeek()} />
          </div>
          <div className="mt-sm"><WeekStrip loading days={[]} /></div>
          <div className="flex gap-xl mt-md">
            <StatBlock size="lg" value="26" label="Total" />
            <StatBlock size="lg" value="104 kg" label="Best" tone="pr" />
            <StatBlock size="lg" value="14" label="Sets" tone="done" />
          </div>
        </Section>

        <Section title="SetRow" note="8px inside the row, 12px between. Always in a gap-md stack.">
          <GlassCard className="p-base">
            <SetRowHeader />
            <div className="flex flex-col gap-md">
              {demoSets.map((s, i) => (
                <SetRow
                  key={s.id}
                  number={s.type === 'warmup' ? null : i}
                  set={{ ...s, completed: !!checked[i] }}
                  weightLabel={`${s.weightKg}`}
                  repsLabel={`${s.reps}`}
                  placeholderWeight="60"
                  placeholderReps="10"
                  onToggleComplete={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
                  onOpenMenu={() => setSheet(true)}
                />
              ))}
              <SetRow loading />
            </div>
          </GlassCard>
        </Section>

        <Section title="ExerciseCard" note="Swipe left for Skip. Skipped collapses, it does not delete.">
          <ExerciseCard
            exercise={{ name: 'Wide-Grip Lat Pulldown', equipment: 'Cable' }}
            prevLine="60 kg × 10, 10, 9"
            targetLine="60 kg × 8–10"
            prs={[{ kind: 'weight', value: '62.5 kg' }]}
            sets={demoSets.slice(1)}
            renderSet={(s, i) => ({
              number: i + 1, set: s, weightLabel: `${s.weightKg}`, repsLabel: `${s.reps}`
            })}
            onOpenMenu={() => setSheet(true)}
            onAddSet={() => {}}
            onSkip={() => undo('Wide-Grip Lat Pulldown skipped', { onUndo: () => {} })}
          />
          <div className="mt-sm">
            <ExerciseCard skipped exercise={{ name: 'Seated Cable Row' }} onRestore={() => {}} />
          </div>
          <div className="mt-sm"><ExerciseCard loading exercise={{ name: '' }} /></div>
        </Section>

        <Section title="Feed" note="One 12px rhythm. Raised cards and plain rows space the same.">
          <NewItemsPill count={3} onClick={() => {}} />
          <div className="mt-sm flex flex-col gap-md">
            <FeedItem
              event={{ id: 1, event_type: 'pr', reaction_count: 4 }}
              actor={{ display_name: 'berejenaeric05' }}
              headline="berejenaeric05 hit a new Bench Press PR"
              detail="104 kg × 5"
              timestamp="2h"
              onReact={() => {}}
            />
            {/* Two raised cards back to back — the case that used to render
                with no gap at all between them. */}
            <FeedItem
              event={{ id: 4, event_type: 'streak', reaction_count: 12 }}
              actor={{ display_name: 'kunashe' }}
              headline="kunashe is on an 8-week streak"
              timestamp="3d"
              onReact={() => {}}
            />
            <FeedItem
              event={{ id: 5, event_type: 'workout_milestone', reaction_count: 2 }}
              actor={{ display_name: 'kunashe' }}
              headline="kunashe reached 25 workouts"
              timestamp="3d"
              onReact={() => {}}
            />
            <FeedItem
              event={{ id: 2, event_type: 'workout', reaction_count: 0 }}
              actor={{ display_name: 'kunashe' }}
              headline="kunashe completed Push · 54m · 22 sets"
              timestamp="5h"
              reacted
              onReact={() => {}}
            />
            <FeedItem
              event={{ id: 3, event_type: 'challenge_created', reaction_count: 1 }}
              actor={{ display_name: 'thatmandioan' }}
              headline="thatmandioan challenged you · Lateral Raise"
              detail="18 kg × 9"
              timestamp="1d"
              action={<FeedAcceptAction onAccept={() => {}} />}
              onReact={() => {}}
            />
            <FeedGroup icon={Users} headline="3 friends trained today" timestamp="today"
                       actors={[{ display_name: 'A' }, { display_name: 'B' }, { display_name: 'C' }]} />
            <FeedItem loading event={{}} />
          </div>
        </Section>

        <Section title="Achievements" note="Lucide icons, never emoji. Unearned ones show progress.">
          <AchievementsRow
            stats={{ total_workouts: 28, workouts_this_week: 1, streak_weeks: 9, lifetime_volume_kg: 192457 }}
            lifts={[
              { exercise_id: 'ex_bench_press', top_weight_kg: 101, top_weight_reps: 5 },
              { exercise_id: 'ex_squat', top_weight_kg: 107.5, top_weight_reps: 6 },
              { exercise_id: 'ex_deadlift', top_weight_kg: 127.5, top_weight_reps: 5 },
              { exercise_id: 'ex_pullup', top_weight_kg: 0, top_weight_reps: 8 }
            ]}
          />
        </Section>

        <Section title="Charts" note="Area, radar and donut, on the real data ink.">
          <GlassCard className="p-base">
            <AreaChart
              data={[
                { label: '24 Aug', value: 18.1 }, { label: '31 Aug', value: 21.4 },
                { label: '7 Sep', value: 17.6 }, { label: '14 Sep', value: 23.2 },
                { label: '21 Sep', value: 25.8 }, { label: '28 Sep', value: 25.1 },
                { label: '5 Oct', value: 11.4 }
              ]}
              unit="t"
              pointLabel="11.4 t · 5 Oct"
              formatValue={(v) => String(Math.round(v * 10) / 10)}
            />
          </GlassCard>
          <GlassCard className="p-base mt-sm">
            <RadarChart
              unit="t"
              formatValue={(v) => String(Math.round(v * 10) / 10)}
              data={[
                { label: 'Chest', value: 8.8 }, { label: 'Shoulders', value: 11.6 },
                { label: 'Triceps', value: 15.7 }, { label: 'Biceps', value: 21 },
                { label: 'Back', value: 11.2 }, { label: 'Glutes', value: 8.2 },
                { label: 'Quads', value: 10.7 }, { label: 'Hamstrings', value: 2.3 }
              ]}
            />
          </GlassCard>
          <GlassCard className="p-base mt-sm">
            <DonutChart data={[
              { label: '1–5', value: 23 }, { label: '6–9', value: 131 },
              { label: '10–14', value: 60 }, { label: '15+', value: 3 }
            ]} />
          </GlassCard>
        </Section>

        <Section title="EmptyState">
          <GlassCard className="p-sm">
            <EmptyState
              icon={Swords}
              title="Nothing here yet"
              body="Add a friend or send a challenge and their PRs start showing up in this feed."
              action={<SecondaryButton icon={Users}>Find people</SecondaryButton>}
            />
          </GlassCard>
        </Section>

        <Section title="Sheets and toasts" note="No confirmation dialogs. Undo instead.">
          <div className="flex flex-wrap gap-sm">
            <SecondaryButton onClick={() => setSheet(true)}>Open bottom sheet</SecondaryButton>
            <SecondaryButton onClick={() => undo('Exercise removed', { onUndo: () => {} })}>Undo toast</SecondaryButton>
            <SecondaryButton tone="danger" onClick={() => undo('Workout deleted', { tone: 'danger', onUndo: () => {} })}>
              Destructive toast
            </SecondaryButton>
            <SecondaryButton onClick={() => setResume((r) => !r)}>Toggle resume pill</SecondaryButton>
          </div>
        </Section>

        <Section title="Chrome" note="TabBar and ResumePill are pinned at the bottom of this page.">
          <p className="text-label font-regular text-ink-secondary">
            Blur is allowed on four things only: the hero card, the resume pill, sheets and the tab bar.
          </p>
        </Section>
      </div>

      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Wide-Grip Lat Pulldown"
        description="Skip keeps your record clean. Remove deletes the sets you logged."
      >
        <SheetAction icon={ArrowUp} label="Move up" />
        <SheetAction icon={ArrowDown} label="Move down" />
        <SheetAction icon={Repeat} label="Replace exercise" />
        <SheetAction icon={SkipForward} label="Skip" hint="Costs you nothing — no effect on streak, volume or completion." />
        <SheetAction icon={Trash2} tone="danger" label="Remove from workout" hint="Deletes this exercise and any sets logged for it." />
      </BottomSheet>

      {resume && (
        <ResumePill splitName="Pull" currentExercise="Back Squat" startedAt={Date.now() - 12 * 60000} onResume={() => {}} />
      )}
      <TabBar current={tab} onChange={setTab} workoutActive badges={{ social: 3 }} />
    </div>
  );
}

function Section({ title, note, children }) {
  return (
    <section className="mt-xxl">
      <h2 className="text-micro font-semibold uppercase text-ink-tertiary">{title}</h2>
      {note && <p className="text-label font-regular text-ink-secondary mt-xs mb-md">{note}</p>}
      <div className={note ? '' : 'mt-md'}>{children}</div>
    </section>
  );
}

function Swatch({ name, value, note }) {
  return (
    <div className="flex items-center gap-sm rounded-row border border-hairline p-sm">
      <span className="w-8 h-8 rounded-control border border-glass-border shrink-0" style={{ background: value }} />
      <span className="min-w-0">
        <span className="block text-label font-semibold text-ink truncate">{name}</span>
        <span className="block text-micro font-semibold tracking-normal text-ink-tertiary truncate">{note}</span>
      </span>
    </div>
  );
}

function TokenTable({ rows }) {
  return (
    <dl className="mt-md rounded-card border border-hairline divide-y divide-hairline">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-md px-md py-sm">
          <dt className="text-label font-regular text-ink-secondary truncate">{k}</dt>
          <dd className="text-label font-semibold text-ink tabular shrink-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function demoWeek() {
  const { startOfDay } = { startOfDay: (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); } };
  const today = startOfDay(Date.now());
  const dow = (new Date().getDay() + 6) % 7;
  const monday = today - dow * 86400000;
  return Array.from({ length: 7 }, (_, i) => ({ date: monday + i * 86400000, trained: [0, 2, 4].includes(i) }));
}
