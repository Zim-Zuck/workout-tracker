-- Kun Workouts — 010: the community feed, and the triggers that fill it.
--
-- Run after 009. Safe to re-run.
--
-- WHY EVENTS CARRY THEIR OWN DISPLAY DATA
-- The obvious feed design stores a reference and joins the real tables at read
-- time. It cannot work here, and the reason is worth stating plainly: challenges
-- are readable only by their two participants (003), and user_lifts is readable
-- only by friends who may see your stats (001). A feed that joined those tables
-- would render blank rows for everyone who is not already inside the circle the
-- feed exists to replace.
--
-- So an event is a small, finished, deliberately published artifact. "Bench
-- Press, 100 kg, 5 reps" is written into the row at the moment it happens and
-- nothing downstream needs privileged access to render it. This is the same
-- discipline socialSummary.js applies on the device: one narrow boundary, and
-- what crosses it is readable off one screen.
--
-- WHY CLIENTS CANNOT WRITE TO THIS TABLE
-- There is no insert, update or delete policy below. Achievement events are
-- produced by triggers on the two tables the device already publishes to, by
-- comparing the OLD row to the NEW one. The client cannot announce a PR it did
-- not also publish as a stat, and it cannot announce one twice.
--
-- This does not make a lift true. The phone is still the only witness, exactly
-- as 003 says. What it does buy is that the feed and the numbers can never
-- disagree, and that there is no second, softer path to claiming an achievement.

-- ---------------------------------------------------------------------------
-- community_events
-- ---------------------------------------------------------------------------
create table if not exists public.community_events (
  -- bigint identity, not uuid, so (created_at, id) is a total order and the
  -- feed can page with a keyset cursor: `where (created_at, id) < (...)` is
  -- exact, index-only, and cannot skip or repeat a row when new events arrive
  -- mid-scroll. A random uuid would force offset paging, which does both.
  id             bigint generated always as identity primary key,
  actor_id       uuid not null references auth.users(id) on delete cascade,
  event_type     text not null,

  -- Doubles as the deduplication discriminator. For a PR it is the exercise id
  -- ('ex_bench_press'); for a milestone it is the milestone itself
  -- ('workouts_50', 'streak_20'), which is what lets emit_community_event()
  -- suppress a repeat of THAT milestone without suppressing a different one
  -- that happens to land in the same window.
  subject        text,

  -- The challenge this event refers to, when there is one. Deliberately NOT a
  -- foreign key to challenges: the row must survive the challenge being deleted
  -- with an account, and nothing reads through it — everything needed to render
  -- the event is in metadata.
  reference_id   uuid,

  -- Display payload, written server-side only. Small by construction: a weight
  -- and a rep count, or a milestone number, or an opponent's name.
  metadata       jsonb not null default '{}'::jsonb,

  -- Denormalised so a page of feed rows is one query rather than one count per
  -- row. Maintained by react_to_event()/unreact_from_event() in 011.
  reaction_count integer not null default 0,
  created_at     timestamptz not null default now(),

  constraint community_events_type check (event_type in (
    'pr', 'workout', 'workout_milestone', 'streak',
    'challenge_created', 'challenge_completed'
  )),
  -- Loose enough to hold both an exercise id and a milestone slug, tight enough
  -- that nothing arbitrary — a name, a note, a URL — can be smuggled into a
  -- column the feed renders.
  constraint community_events_subject_format check (
    subject is null or subject ~ '^[a-z0-9_]{1,60}$'
  ),
  constraint community_events_reaction_count_sane check (reaction_count >= 0),
  -- A cap on the payload. Nothing legitimate comes close; this is here so a
  -- future emitter cannot quietly turn the feed into a document store.
  -- char_length over the text form rather than pg_column_size(): both measure
  -- what we care about, and only one of them is unambiguously immutable enough
  -- to sit in a CHECK constraint.
  constraint community_events_metadata_small check (char_length(metadata::text) <= 2000)
);

-- The global feed's only access path: newest first, keyset-paged.
create index if not exists community_events_feed_idx
  on public.community_events (created_at desc, id desc);

-- A single person's activity, for their profile.
create index if not exists community_events_actor_idx
  on public.community_events (actor_id, created_at desc);

-- The deduplication lookup in emit_community_event().
create index if not exists community_events_dedupe_idx
  on public.community_events (actor_id, event_type, subject, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Readable by any signed-in user, but only while the actor still has community
-- sharing on. Turning share_activity off therefore hides your past events too,
-- rather than only stopping new ones — which is what the switch appears to
-- promise, so it is what it should do. Nothing is deleted; flip it back and the
-- history returns.
-- ---------------------------------------------------------------------------
alter table public.community_events enable row level security;

drop policy if exists community_events_select on public.community_events;
create policy community_events_select on public.community_events
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
     where p.id = actor_id and p.share_activity
  ));

-- NOTE: no insert, update or delete policy. This is intentional and
-- load-bearing, exactly as it is for notifications (002) and challenges (003).

-- ---------------------------------------------------------------------------
-- emit_community_event
--
-- The only writer. Internal: granted to nobody, so it is reachable only from
-- the triggers below and from the challenge functions in 014 — the same
-- arrangement push_notification() has had since 002.
--
-- Silently returns null rather than raising on every "no" answer (sharing off,
-- duplicate inside the window). It is called from inside triggers on the
-- publish path, and an exception there would roll back the user's stats upsert.
-- A missing feed event is a cosmetic loss; a failed publish is data loss.
-- ---------------------------------------------------------------------------
create or replace function public.emit_community_event(
  actor  uuid,
  kind   text,
  subj   text default null,
  ref    uuid default null,
  meta   jsonb default '{}'::jsonb,
  dedupe interval default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
begin
  if actor is null or kind is null then return null; end if;

  -- The one consent check, in one place. Every emitter goes through here, so
  -- there is no path that publishes an event for someone who opted out.
  if not exists (
    select 1 from public.profiles p where p.id = actor and p.share_activity
  ) then
    return null;
  end if;

  if dedupe is not null and exists (
    select 1 from public.community_events e
     where e.actor_id   = actor
       and e.event_type = kind
       -- `is not distinct from` so a null subject matches a null subject, which
       -- `=` would not.
       and e.subject is not distinct from subj
       and e.created_at > now() - dedupe
  ) then
    return null;
  end if;

  insert into public.community_events (actor_id, event_type, subject, reference_id, metadata)
  values (actor, kind, subj, ref, coalesce(meta, '{}'::jsonb))
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.emit_community_event(uuid, text, text, uuid, jsonb, interval) from public;
revoke all on function public.emit_community_event(uuid, text, text, uuid, jsonb, interval) from anon;
revoke all on function public.emit_community_event(uuid, text, text, uuid, jsonb, interval) from authenticated;

-- ---------------------------------------------------------------------------
-- PR events, from user_lifts
--
-- THE IMPORT PROBLEM, WHICH IS THE WHOLE DIFFICULTY HERE
-- buildLiftsSummary() recomputes the user's ENTIRE best-per-exercise table from
-- local history and upserts all of it, on every publish. That is a deliberate
-- design choice (useProfile.js: "snapshots are idempotent, so a missed publish
-- self-heals"), and it means the database cannot tell a single new PR from a
-- restored backup by looking at one row. A naive trigger would turn "import my
-- training history" into forty PR announcements in one second.
--
-- Two guards, working together:
--
--   1. INSERTs never produce an event. A brand-new user_lifts row is the first
--      time that exercise has been published at all, and detectPRs() in
--      calculations.js says explicitly that a first-ever entry is not a PR —
--      there was nothing to beat. Honouring the same rule here means a first
--      sync, however large, is silent, and it keeps one definition of a PR
--      across the app instead of two that can disagree.
--
--   2. An UPDATE statement that improves more than BATCH_MAX exercises at once
--      is not a training session. Nobody sets a new top weight on six lifts in
--      one evening; a history edit or a restore does exactly that. The whole
--      batch is suppressed rather than trimmed, because publishing the first
--      five PRs of a restore would be worse than publishing none.
--
-- Statement-level with transition tables, not row-level, precisely so guard 2
-- can see the size of the batch it is in. A row-level trigger has no way to know
-- whether it is one of one or one of forty.
-- ---------------------------------------------------------------------------
create or replace function public.tg_user_lifts_community_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Improvements in a single publish above which the batch is treated as an
  -- import or a history edit. Tune here; nothing else reads it.
  BATCH_MAX constant integer := 5;
  -- One event per lift per window, however often the client republishes.
  DEDUPE constant interval := interval '6 hours';
  improved_count integer;
  r record;
begin
  -- Same comparison as buildLiftsSummary() and report_challenge_progress():
  -- heavier bar wins outright, equal bar with more reps wins.
  select count(*) into improved_count
    from new_rows n
    join old_rows o
      on o.user_id = n.user_id and o.exercise_id = n.exercise_id
   where n.top_weight_kg > o.top_weight_kg
      or (n.top_weight_kg = o.top_weight_kg and n.top_weight_reps > o.top_weight_reps);

  if improved_count = 0 or improved_count > BATCH_MAX then
    return null;
  end if;

  for r in
    select n.user_id, n.exercise_id, n.top_weight_kg, n.top_weight_reps
      from new_rows n
      join old_rows o
        on o.user_id = n.user_id and o.exercise_id = n.exercise_id
     where n.top_weight_kg > o.top_weight_kg
        or (n.top_weight_kg = o.top_weight_kg and n.top_weight_reps > o.top_weight_reps)
  loop
    perform public.emit_community_event(
      r.user_id,
      'pr',
      r.exercise_id,
      null,
      jsonb_build_object('weight_kg', r.top_weight_kg, 'reps', r.top_weight_reps),
      DEDUPE
    );
  end loop;

  return null;
end;
$$;

drop trigger if exists user_lifts_community_events on public.user_lifts;
create trigger user_lifts_community_events
  after update on public.user_lifts
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function public.tg_user_lifts_community_events();

-- ---------------------------------------------------------------------------
-- Workout, milestone and streak events, from profile_stats
--
-- Row-level is correct here where it was wrong for user_lifts: profile_stats
-- holds exactly one row per user and the outbox upserts it on its own, so the
-- statement and the row are the same thing. The import guard is therefore a
-- comparison of counters rather than a count of rows.
-- ---------------------------------------------------------------------------
create or replace function public.tg_profile_stats_community_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- New workouts in a single publish above which this is a restore or an import
  -- rather than training. Three, not one: a double session in a day is real, and
  -- so is a workout publishing while an earlier one was still stuck in the
  -- outbox from a dead zone at the gym.
  IMPORT_MAX constant integer := 3;
  -- One "trained today" event per day. The client republishes its full snapshot
  -- on every sync, and syncs run on launch and on reconnect.
  WORKOUT_DEDUPE constant interval := interval '20 hours';
  -- Round numbers only. A milestone every five workouts would stop being one.
  WORKOUT_MILESTONES constant integer[] := array[10, 25, 50, 100, 250, 500, 1000];
  -- Weeks. Streaks are weekly in this app (001), so these are months and years.
  STREAK_MILESTONES constant integer[] := array[4, 8, 12, 20, 26, 52, 104];
  -- Long enough to mean "once per account". A milestone can otherwise fire
  -- twice if history is edited back across the boundary and then forward again.
  MILESTONE_DEDUPE constant interval := interval '3650 days';
  prev_workouts integer;
  prev_streak   integer;
  delta         integer;
  m             integer;
begin
  if TG_OP = 'INSERT' then
    prev_workouts := 0;
    prev_streak   := 0;
  else
    prev_workouts := old.total_workouts;
    prev_streak   := old.streak_weeks;
  end if;

  delta := new.total_workouts - prev_workouts;

  -- Nothing new, or a correction downward because history was edited or
  -- deleted. Neither is an achievement.
  if delta <= 0 then
    return null;
  end if;

  -- A first publish carrying an entire imported history lands here as one
  -- enormous delta. Silence is the right answer: the person did not do 300
  -- workouts today, and announcing the milestones they crossed years ago on
  -- someone else's app would be a lie told in the present tense.
  if delta > IMPORT_MAX then
    return null;
  end if;

  perform public.emit_community_event(
    new.user_id, 'workout', null, null, '{}'::jsonb, WORKOUT_DEDUPE
  );

  -- Crossed, not reached: `prev < m and new >= m` fires once, on the publish
  -- that actually passed the mark, even if the counter jumped by two.
  foreach m in array WORKOUT_MILESTONES loop
    if prev_workouts < m and new.total_workouts >= m then
      perform public.emit_community_event(
        new.user_id, 'workout_milestone', 'workouts_' || m, null,
        jsonb_build_object('total', m), MILESTONE_DEDUPE
      );
    end if;
  end loop;

  if new.streak_weeks > prev_streak then
    foreach m in array STREAK_MILESTONES loop
      if prev_streak < m and new.streak_weeks >= m then
        perform public.emit_community_event(
          new.user_id, 'streak', 'streak_' || m, null,
          jsonb_build_object('weeks', m), MILESTONE_DEDUPE
        );
      end if;
    end loop;
  end if;

  return null;
end;
$$;

drop trigger if exists profile_stats_community_events on public.profile_stats;
create trigger profile_stats_community_events
  after insert or update on public.profile_stats
  for each row
  execute function public.tg_profile_stats_community_events();

notify pgrst, 'reload schema';
