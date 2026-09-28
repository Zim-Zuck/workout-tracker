-- Kun Workouts — 006: the weekly friend recap.
--
-- Run after 005. Safe to re-run.
--
-- WHY NEW TABLES AND NOT A REUSE OF profile_stats
-- profile_stats holds lifetime totals; user_lifts holds all-time bests. Neither
-- can answer "what happened between Monday and Sunday", and back-deriving a week
-- from two lifetime counters is not possible. So the device publishes one small
-- row per week, using exactly the pattern the rest of the social layer already
-- uses: computed locally, upserted idempotently, read under can_view_stats().
--
-- WHAT LEAVES THE DEVICE IS STILL ONLY AGGREGATES
-- Counts and totals for a week, plus per-exercise totals for built-in exercises.
-- No sets, no reps-per-set, no RPE, no notes, no timestamps, no custom
-- exercises. The privacy boundary established in 001 is unchanged.
--
-- ON GROUPS
-- These tables are keyed by USER, not by group. The only place "who is in the
-- recap" is decided is the `circle` CTE in get_weekly_recap() below. Adding
-- private clubs later means adding a group_id argument and swapping that one
-- CTE — no change to what the device publishes and no migration of stored rows.
-- That is the whole of the future-proofing, and it costs nothing today.

-- ---------------------------------------------------------------------------
-- weekly_stats — one row per user per ISO week.
--
-- week_start is a DATE, always a Monday, computed on the device from the user's
-- local clock (matching startOfWeek() in the app). Two friends in different
-- timezones can therefore disagree about which week a Sunday-night session
-- belongs to, by at most a few hours. That is accepted deliberately: the
-- alternative is forcing everyone onto UTC weeks, which would tell a person
-- training on Sunday evening that their workout landed in next week.
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_stats (
  user_id                uuid not null references auth.users(id) on delete cascade,
  week_start             date not null,
  workouts               integer not null default 0,
  sets                   integer not null default 0,
  reps                   integer not null default 0,
  volume_kg              numeric(12,1) not null default 0,
  prs                    integer not null default 0,
  -- Distinct calendar days trained. Differs from `workouts` when someone logs
  -- two sessions in a day, which is what the consistency awards key on.
  active_days            integer not null default 0,
  -- Volume of the single biggest session in the week. Powers "one session was
  -- most of your week" without publishing per-session rows.
  max_session_volume_kg  numeric(12,1) not null default 0,
  -- Null when the device could not measure it reliably (imported history, a
  -- session left running overnight). Never guessed at.
  duration_min           integer,
  -- Mean weekly volume over the four weeks before this one, zero weeks
  -- included. The honest denominator for "is this week unusual for them".
  baseline_volume_kg     numeric(12,1) not null default 0,
  -- Gap between the last workout before this week and the first one in it.
  -- Null when there is no prior workout at all (a brand-new account).
  days_since_prev_workout integer,
  updated_at             timestamptz not null default now(),

  primary key (user_id, week_start),

  -- Same reasoning as stats_sane in 001: these cannot make a client-computed
  -- number true, but they stop a buggy or tampered client writing an
  -- absurdity that would poison every recap it appears in.
  constraint weekly_sane check (
    workouts              between 0 and 100
    and sets              between 0 and 2000
    and reps              between 0 and 40000
    and volume_kg         between 0 and 10000000
    and prs               between 0 and 500
    and active_days       between 0 and 7
    and max_session_volume_kg between 0 and 10000000
    and (duration_min is null or duration_min between 0 and 10080)
    and baseline_volume_kg between 0 and 10000000
    and (days_since_prev_workout is null or days_since_prev_workout between 0 and 3650)
  ),
  -- A session cannot be bigger than the week that contains it.
  constraint weekly_session_fits check (max_session_volume_kg <= volume_kg + 0.1),
  constraint weekly_days_fit check (active_days <= workouts or workouts = 0)
);

create index if not exists weekly_stats_week_idx on public.weekly_stats (week_start);

-- ---------------------------------------------------------------------------
-- weekly_exercise_stats — per built-in exercise, per week.
--
-- Built-ins only, for the same reason user_lifts is built-ins only (001): a
-- custom exercise has a device-random id that can never match a friend's, so
-- publishing it would create comparisons between two different movements that
-- happen to share a name. Custom work still counts toward the weekly totals
-- above; it just cannot enter an exercise battle.
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_exercise_stats (
  user_id         uuid not null references auth.users(id) on delete cascade,
  week_start      date not null,
  exercise_id     text not null,
  sets            integer not null default 0,
  reps            integer not null default 0,
  volume_kg       numeric(12,1) not null default 0,
  top_weight_kg   numeric(6,2) not null default 0,
  top_weight_reps integer not null default 0,
  best_e1rm_kg    numeric(6,2) not null default 0,
  updated_at      timestamptz not null default now(),

  primary key (user_id, week_start, exercise_id),

  constraint weekly_ex_id_format check (exercise_id ~ '^ex_[a-z0-9_]{1,60}$'),
  constraint weekly_ex_sane check (
    sets between 1 and 500
    and reps between 1 and 10000
    and volume_kg between 0 and 5000000
    -- Zero weight is legitimate: pull-ups and dips are logged at bodyweight,
    -- and those rank by reps in the UI rather than by the weight alone.
    and top_weight_kg between 0 and 500
    and top_weight_reps between 1 and 100
    and best_e1rm_kg between 0 and 600
  )
);

create index if not exists weekly_ex_week_idx on public.weekly_exercise_stats (week_start, exercise_id);

-- ---------------------------------------------------------------------------
-- Row-level security — identical rule to profile_stats and user_lifts.
-- can_view_stats() stays the single authority on who may see numbers.
-- ---------------------------------------------------------------------------
alter table public.weekly_stats          enable row level security;
alter table public.weekly_exercise_stats enable row level security;

drop policy if exists weekly_select_visible on public.weekly_stats;
create policy weekly_select_visible on public.weekly_stats
  for select to authenticated using (public.can_view_stats(user_id));

drop policy if exists weekly_insert_own on public.weekly_stats;
create policy weekly_insert_own on public.weekly_stats
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists weekly_update_own on public.weekly_stats;
create policy weekly_update_own on public.weekly_stats
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists weekly_delete_own on public.weekly_stats;
create policy weekly_delete_own on public.weekly_stats
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists weekly_ex_select_visible on public.weekly_exercise_stats;
create policy weekly_ex_select_visible on public.weekly_exercise_stats
  for select to authenticated using (public.can_view_stats(user_id));

drop policy if exists weekly_ex_insert_own on public.weekly_exercise_stats;
create policy weekly_ex_insert_own on public.weekly_exercise_stats
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists weekly_ex_update_own on public.weekly_exercise_stats;
create policy weekly_ex_update_own on public.weekly_exercise_stats
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Delete matters here in a way it does not for weekly_stats: if you remove an
-- exercise from a logged workout, its row must be able to disappear, otherwise
-- last week's battle keeps showing a lift you deleted.
drop policy if exists weekly_ex_delete_own on public.weekly_exercise_stats;
create policy weekly_ex_delete_own on public.weekly_exercise_stats
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- get_weekly_recap
--
-- One round trip for the whole recap: every member of the circle with their
-- week row and their per-exercise rows, constrained to a single week.
--
-- Deliberately SECURITY INVOKER, for the same reason friends_leaderboard() is
-- (see 003). This function only reads, so running it as the caller lets the RLS
-- policies above filter it automatically: a friend who turned stat sharing off
-- yields no weekly row and appears with nulls, rather than having their numbers
-- leak past can_view_stats(). Marking it DEFINER would silently bypass the
-- app's central privacy rule.
--
-- Members with no row still appear. Dropping them would both leak the fact that
-- someone opted out and — more importantly for the product — erase the friend
-- who did not train, who is exactly the person the recap should nudge.
-- ---------------------------------------------------------------------------
create or replace function public.get_weekly_recap(target_week date)
returns jsonb
language sql
stable
set search_path = public
as $$
  with circle as (
    select auth.uid() as uid
    union
    select case when f.user_low = auth.uid() then f.user_high else f.user_low end
      from public.friendships f
     where f.status = 'accepted'
       and auth.uid() in (f.user_low, f.user_high)
  ),
  members as (
    select
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.created_at,
      (p.id = auth.uid()) as is_me,
      to_jsonb(w) - 'user_id' - 'week_start' - 'updated_at' as week
    from circle c
    join public.profiles p on p.id = c.uid
    left join public.weekly_stats w
      on w.user_id = p.id and w.week_start = target_week
  ),
  ex as (
    select
      e.user_id,
      e.exercise_id,
      e.sets, e.reps, e.volume_kg,
      e.top_weight_kg, e.top_weight_reps, e.best_e1rm_kg
    from public.weekly_exercise_stats e
    join circle c on c.uid = e.user_id
    where e.week_start = target_week
  )
  select jsonb_build_object(
    'week_start', target_week,
    'members', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.is_me desc, m.display_name) from members m
    ), '[]'::jsonb),
    'exercises', coalesce((
      select jsonb_agg(to_jsonb(x)) from ex x
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_weekly_recap(date) to authenticated;
