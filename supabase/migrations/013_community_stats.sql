-- Kun Workouts — 013: the global leaderboard and the community week.
--
-- Run after 012. Safe to re-run.
--
-- ============================================================================
-- THE ONE PLACE THIS CHANGE DELIBERATELY READS PAST can_view_stats()
-- ============================================================================
-- Read this block before editing anything in this file.
--
-- profile_stats and weekly_stats are readable only under can_view_stats(): you,
-- or an accepted friend who has share_stats on. That rule is unchanged by this
-- migration and by every other migration in this change. can_view_stats() is not
-- redefined, are_friends() is not redefined, and not one RLS policy on
-- profile_stats, user_lifts, weekly_stats or weekly_exercise_stats is altered.
--
-- But a GLOBAL leaderboard needs a workout count for someone who is not your
-- friend, and there is no honest way around that. The three available options
-- were: widen can_view_stats() (which would silently reclassify every existing
-- user's data — refused), mirror the numbers into a second table the client
-- publishes (a duplicate that can drift out of agreement with the original), or
-- open one narrow, named, auditable window. This file is the third option.
--
-- The rules that make the window narrow, all of which must hold for any function
-- added here later:
--
--   1. COLUMNS ARE LISTED BY NAME. There is no `select *` and no `to_jsonb(s)`
--      on a gated table's row anywhere below. A column added to profile_stats or
--      weekly_stats in future must not be able to leak by being swept up in a
--      wildcard.
--
--   2. THE LIST IS THE SMALLEST ONE THE FEATURE NEEDS. From profile_stats:
--      total_workouts, streak_weeks, workouts_this_week. That is exactly what
--      friends_leaderboard() has always displayed. NOT lifetime_volume_kg, and
--      NOT last_workout_at — a leaderboard does not need to tell strangers when
--      you last trained.
--
--   3. PER-PERSON WEEKLY DETAIL IS NOT EXPOSED AT ALL. From weekly_stats, the
--      only per-person column read is `workouts`, which rule 2 already makes
--      globally visible. volume_kg and sets are read ONLY as community-wide sums,
--      and only above the threshold in rule 4. Nothing reads reps, active_days,
--      max_session_volume_kg, duration_min, baseline_volume_kg or
--      days_since_prev_workout, and nothing reads weekly_exercise_stats.
--
--   4. AGGREGATES HAVE A FLOOR. With three contributors, "the community moved
--      42,000 kg this week" minus your own 14,000 tells you a friend's private
--      volume by subtraction. So community volume and set totals are reported
--      only once MIN_AGGREGATE_USERS people contributed, and are null below that.
--      An anonymised total is not anonymous when the crowd is small enough to
--      enumerate.
--
--   5. share_activity GATES EVERY ROW. A user who has not opted into the
--      community appears in none of these results and contributes to none of
--      these totals.
--
-- The friend-facing functions are untouched and stay untouched:
-- friends_leaderboard() and get_weekly_recap() remain SECURITY INVOKER, still
-- filtered by RLS, still carrying their own notes about why. The new functions
-- here sit ALONGSIDE them and call neither — a DEFINER function calling an
-- INVOKER one would run it with elevated rights and quietly destroy the exact
-- property those two were written to have.

-- ---------------------------------------------------------------------------
-- Indexes for the reads below.
-- ---------------------------------------------------------------------------
create index if not exists profile_stats_workouts_idx
  on public.profile_stats (total_workouts desc);
create index if not exists profile_stats_streak_idx
  on public.profile_stats (streak_weeks desc);
create index if not exists profile_stats_this_week_idx
  on public.profile_stats (workouts_this_week desc);

-- weekly_stats already has (week_start). These carry the ordering too, so the
-- community week's top-N reads stay index-only as the table grows by one row per
-- user per week.
create index if not exists weekly_stats_week_workouts_idx
  on public.weekly_stats (week_start, workouts desc);

-- Counting the week's finished challenges without scanning the whole table.
create index if not exists challenges_resolved_at_idx
  on public.challenges (resolved_at) where status = 'complete';

-- ---------------------------------------------------------------------------
-- global_leaderboard
--
-- A sibling of friends_leaderboard(), not a replacement for it. The UI picks
-- between them by scope; both stay.
--
-- Ranked by workouts, streak or this-week, never by volume — the product
-- decision argued in 003 is unchanged and is now enforced in two places rather
-- than one: a volume board pays people to pad out junk sets, and it would also
-- be the one metric on this board that is not already globally visible.
--
-- Returns the top 50 plus the caller's own row wherever they sit, because a new
-- user who cannot find themselves on a leaderboard has been shown a wall, not a
-- board.
-- ---------------------------------------------------------------------------
create or replace function public.global_leaderboard(metric text default 'workouts')
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  is_me        boolean,
  workouts     integer,
  streak_weeks integer,
  this_week    integer,
  rank         integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  if metric is null or metric not in ('workouts', 'streak', 'this_week') then
    raise exception 'Unknown metric';
  end if;

  return query
  with eligible as (
    -- Rule 5: share_activity gates every row, including the caller's. Someone
    -- who has opted out is absent from their own view of the board as well —
    -- the alternative is a phantom row visible only to them, which would shift
    -- everyone else's rank by one and make the board disagree with itself
    -- between two people looking at it.
    select
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      -- Rule 2: three columns, named. Nothing else is read from profile_stats.
      coalesce(s.total_workouts, 0)     as workouts,
      coalesce(s.streak_weeks, 0)       as streak_weeks,
      coalesce(s.workouts_this_week, 0) as this_week
    from public.profiles p
    -- A user with no published stats yet joins to nulls and lands at the bottom
    -- with zeros, rather than vanishing. Appearing on the board with nothing on
    -- it is the correct state for someone who just signed up.
    left join public.profile_stats s on s.user_id = p.id
    where p.share_activity
  ),
  ranked as (
    -- Columns relisted rather than `e.*`. The CTE above is already explicit, so
    -- a wildcard here would be harmless today — but rule 1 of this file is
    -- meant to hold by inspection, without the reader having to chase what a
    -- star expands to.
    select
      e.id,
      e.username,
      e.display_name,
      e.avatar_url,
      e.workouts,
      e.streak_weeks,
      e.this_week,
      (row_number() over (
        order by
          case metric
            when 'streak'    then e.streak_weeks
            when 'this_week' then e.this_week
            else                  e.workouts
          end desc,
          e.display_name
      ))::integer as rnk
    from eligible e
  )
  select
    r.id,
    r.username,
    r.display_name,
    r.avatar_url,
    (r.id = me),
    r.workouts,
    r.streak_weeks,
    r.this_week,
    r.rnk
  from ranked r
  where r.rnk <= 50 or r.id = me
  order by r.rnk;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_community_week
--
-- The global counterpart to get_weekly_recap(), and deliberately NOT the same
-- shape.
--
-- get_weekly_recap() returns every member's full week row plus every one of
-- their per-exercise rows, and weeklyRecap.js ranks them on the device. That is
-- the right design for a circle of five. For a community it is the wrong one
-- twice over: it would ship the whole app's week to every phone, and it would
-- ship per-person detail that rule 3 above says must not leave the server.
--
-- So this function aggregates in SQL and returns a fixed, small object. Its
-- response size does not grow with the user base. get_weekly_recap() is
-- untouched and still powers the friends recap and its share cards.
-- ---------------------------------------------------------------------------
create or replace function public.get_community_week(target_week date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Rule 4. Below this many contributors, community volume and set totals are
  -- withheld: a sum over three people is a lookup table for two of them.
  MIN_AGGREGATE_USERS constant integer := 5;
  me           uuid := auth.uid();
  contributors integer;
  totals       jsonb;
  top_workouts jsonb;
  top_prs      jsonb;
  top_streaks  jsonb;
  challenge_counts jsonb;
  mine         jsonb;
  my_rank      integer;
  my_workouts  integer;
  week_end     date;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if target_week is null then raise exception 'No week given'; end if;
  week_end := target_week + 7;

  -- People who both opted in and actually trained. The denominator for rule 4,
  -- and a number worth showing on its own: "31 people trained this week" is the
  -- single line that makes an app feel inhabited.
  select count(*) into contributors
    from public.weekly_stats w
    join public.profiles p on p.id = w.user_id
   where w.week_start = target_week
     and p.share_activity
     and w.workouts > 0;

  select jsonb_build_object(
    'people',   contributors,
    'workouts', coalesce(sum(w.workouts), 0),
    -- Withheld, not zeroed, below the floor. Null means "not reported"; the UI
    -- omits the line rather than claiming the community lifted nothing.
    'volume_kg', case when contributors >= MIN_AGGREGATE_USERS
                      then coalesce(sum(w.volume_kg), 0) end,
    'sets',      case when contributors >= MIN_AGGREGATE_USERS
                      then coalesce(sum(w.sets), 0) end
  ) into totals
    from public.weekly_stats w
    join public.profiles p on p.id = w.user_id
   where w.week_start = target_week
     and p.share_activity;

  -- Most sessions. `workouts` is the one per-person weekly column read here, and
  -- it is already globally visible through global_leaderboard() above.
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into top_workouts
    from (
      select
        p.id           as user_id,
        p.username,
        p.display_name,
        p.avatar_url,
        w.workouts
      from public.weekly_stats w
      join public.profiles p on p.id = w.user_id
     where w.week_start = target_week
       and p.share_activity
       and w.workouts > 0
     order by w.workouts desc, p.display_name
     limit 3
    ) t;

  -- Most records. Counted from community_events, NOT from weekly_stats.prs.
  --
  -- That is a privacy decision, not a convenience: the PR events are already
  -- public, already deduplicated, and already restricted to built-in exercises,
  -- so counting them exposes nothing that is not on the feed anyway. Reading
  -- weekly_stats.prs instead would have published a per-person figure that is
  -- currently friends-only and that also counts custom exercises the feed never
  -- shows.
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into top_prs
    from (
      select
        p.id           as user_id,
        p.username,
        p.display_name,
        p.avatar_url,
        count(*)::integer as prs
      from public.community_events e
      join public.profiles p on p.id = e.actor_id
     where e.event_type = 'pr'
       and p.share_activity
       and e.created_at >= target_week::timestamptz
       and e.created_at <  week_end::timestamptz
     group by p.id, p.username, p.display_name, p.avatar_url
     order by count(*) desc, p.display_name
     limit 3
    ) t;

  -- Longest streaks. streak_weeks is already globally visible (rule 2).
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into top_streaks
    from (
      select
        p.id         as user_id,
        p.username,
        p.display_name,
        p.avatar_url,
        s.streak_weeks
      from public.profile_stats s
      join public.profiles p on p.id = s.user_id
     where p.share_activity
       and s.streak_weeks >= 2
     order by s.streak_weeks desc, p.display_name
     limit 3
    ) t;

  -- Counts only. Challenges are readable by their two participants and nobody
  -- else (003); that is unchanged, and two integers reveal no participant.
  select jsonb_build_object(
    'created',   count(*) filter (
                   where c.created_at >= target_week::timestamptz
                     and c.created_at <  week_end::timestamptz),
    'completed', count(*) filter (
                   where c.status = 'complete'
                     and c.resolved_at >= target_week::timestamptz
                     and c.resolved_at <  week_end::timestamptz)
  ) into challenge_counts
    from public.challenges c;

  -- The caller's own week, in full. Always permitted: can_view_stats() has
  -- allowed `target = auth.uid()` since 001, so this exposes nothing new. Listed
  -- column by column all the same, so the rule holds by inspection.
  select jsonb_build_object(
    'workouts',    w.workouts,
    'sets',        w.sets,
    'reps',        w.reps,
    'volume_kg',   w.volume_kg,
    'prs',         w.prs,
    'active_days', w.active_days
  ) into mine
    from public.weekly_stats w
   where w.user_id = me and w.week_start = target_week;

  -- Where the caller placed on sessions, among people who trained. Two steps
  -- rather than one correlated monster: find my own figure, then count how many
  -- beat it. Left null when I did not train this week or have community sharing
  -- off, because in neither case is there a rank to have.
  select w.workouts into my_workouts
    from public.weekly_stats w
    join public.profiles p on p.id = w.user_id
   where w.user_id = me
     and w.week_start = target_week
     and w.workouts > 0
     and p.share_activity;

  if my_workouts is not null then
    select (count(*) + 1)::integer into my_rank
      from public.weekly_stats w
      join public.profiles p on p.id = w.user_id
     where w.week_start = target_week
       and p.share_activity
       and w.workouts > my_workouts;
  end if;

  return jsonb_build_object(
    'week_start',          target_week,
    'totals',              totals,
    'top_workouts',        top_workouts,
    'top_prs',             top_prs,
    'top_streaks',         top_streaks,
    'challenges',          challenge_counts,
    'me',                  mine,
    'my_rank',             my_rank,
    -- Handed to the client so the UI can explain an absent volume line instead
    -- of leaving a gap the user has to guess at.
    'min_aggregate_users', MIN_AGGREGATE_USERS
  );
end;
$$;

revoke all on function public.global_leaderboard(text) from public;
revoke all on function public.global_leaderboard(text) from anon;
grant execute on function public.global_leaderboard(text) to authenticated;

revoke all on function public.get_community_week(date) from public;
revoke all on function public.get_community_week(date) from anon;
grant execute on function public.get_community_week(date) to authenticated;

notify pgrst, 'reload schema';
