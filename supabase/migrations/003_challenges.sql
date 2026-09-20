-- Kun Workouts — 003: Beat My PR challenges, and the friends leaderboard.
--
-- Run after 002. Safe to re-run.
--
-- THE ANTI-CHEAT POSITION, STATED HONESTLY
-- The app is local-first: the phone is the only witness to a lift, so no server
-- can verify that a claimed 110kg bench happened. Pretending otherwise would be
-- dishonest. What the database CAN guarantee, and does:
--
--   * you may only ever write your own progress          (auth.uid() checks)
--   * you cannot backdate a lift into a challenge        (achieved_at = now())
--   * progress only moves upward                         (monotonic check)
--   * values stay physically plausible                   (bounds)
--   * you cannot declare yourself the winner             (outcome is computed)
--   * you cannot join a challenge you were not invited to
--
-- Everything else rests on the fact that challenges are between friends who
-- know each other. That is a social guarantee, not a technical one, and it is
-- the right trade for this product.

-- ---------------------------------------------------------------------------
-- challenges
--
-- Strictly 1v1 in V1. target_weight_kg is frozen from the challenger's current
-- best at creation time, so improving your own PR mid-challenge cannot move the
-- goalposts for your opponent.
-- ---------------------------------------------------------------------------
create table if not exists public.challenges (
  id               uuid primary key default gen_random_uuid(),
  creator_id       uuid not null references auth.users(id) on delete cascade,
  opponent_id      uuid not null references auth.users(id) on delete cascade,
  exercise_id      text not null,

  -- The bar to beat, and the reps behind it (so a bodyweight challenge is
  -- "beat 12 pull-ups" rather than "beat 0kg").
  target_weight_kg numeric(6,2) not null,
  target_reps      integer not null,

  status           text not null default 'pending',
  -- Server-stamped throughout. A client never supplies a time on this table.
  created_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  ends_at          timestamptz,
  duration_days    integer not null,
  winner_id        uuid references auth.users(id) on delete set null,
  resolved_at      timestamptz,

  constraint challenges_not_self check (creator_id <> opponent_id),
  constraint challenges_status check (status in ('pending', 'active', 'complete', 'declined', 'expired')),
  constraint challenges_duration check (duration_days in (7, 14, 30)),
  constraint challenges_exercise_format check (exercise_id ~ '^ex_[a-z0-9_]{1,60}$'),
  constraint challenges_target_sane check (
    target_weight_kg >= 0 and target_weight_kg <= 500
    and target_reps >= 1 and target_reps <= 100
  )
);

create index if not exists challenges_creator_idx  on public.challenges (creator_id, status);
create index if not exists challenges_opponent_idx on public.challenges (opponent_id, status);

-- One live challenge per pair per exercise. Without this, a spurned challenger
-- could spam the same person with twenty identical bench challenges.
create unique index if not exists challenges_one_live_per_pair
  on public.challenges (least(creator_id, opponent_id), greatest(creator_id, opponent_id), exercise_id)
  where status in ('pending', 'active');

-- ---------------------------------------------------------------------------
-- challenge_progress — each side's best effort SINCE the challenge started.
--
-- Written only by report_challenge_progress(). There is no insert or update
-- policy on this table at all.
-- ---------------------------------------------------------------------------
create table if not exists public.challenge_progress (
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  best_weight_kg numeric(6,2) not null default 0,
  best_reps     integer not null default 0,
  achieved_at   timestamptz,
  updated_at    timestamptz not null default now(),

  primary key (challenge_id, user_id),

  constraint progress_sane check (
    best_weight_kg >= 0 and best_weight_kg <= 500
    and best_reps >= 0 and best_reps <= 100
  )
);

alter table public.challenges         enable row level security;
alter table public.challenge_progress enable row level security;

-- Participants can read their own challenges. Nobody else can see them at all —
-- a challenge is between two people, not a public event.
drop policy if exists challenges_select_participant on public.challenges;
create policy challenges_select_participant on public.challenges
  for select to authenticated
  using (auth.uid() in (creator_id, opponent_id));

drop policy if exists progress_select_participant on public.challenge_progress;
create policy progress_select_participant on public.challenge_progress
  for select to authenticated
  using (exists (
    select 1 from public.challenges c
    where c.id = challenge_id and auth.uid() in (c.creator_id, c.opponent_id)
  ));

-- No insert/update/delete policies on either table. Every write goes through the
-- functions below.

-- ---------------------------------------------------------------------------
-- create_challenge
--
-- The target is read from the challenger's OWN published lifts rather than
-- accepted as a parameter, so you cannot invent a target you never hit.
-- ---------------------------------------------------------------------------
create or replace function public.create_challenge(
  target_user uuid, ex_id text, days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  my_lift  public.user_lifts%rowtype;
  new_id   uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if target_user = me then raise exception 'You cannot challenge yourself'; end if;
  if days not in (7, 14, 30) then raise exception 'Challenges run for 7, 14 or 30 days'; end if;

  -- Friends only. Challenging a stranger would leak your PR to them.
  if not public.are_friends(me, target_user) then
    raise exception 'You can only challenge friends';
  end if;

  select * into my_lift from public.user_lifts
   where user_id = me and exercise_id = ex_id;
  if not found then
    raise exception 'Log that exercise first — a challenge needs a PR to beat';
  end if;

  if exists (
    select 1 from public.challenges
     where status in ('pending', 'active')
       and exercise_id = ex_id
       and least(creator_id, opponent_id) = least(me, target_user)
       and greatest(creator_id, opponent_id) = greatest(me, target_user)
  ) then
    raise exception 'You already have a live challenge with them on that lift';
  end if;

  insert into public.challenges (
    creator_id, opponent_id, exercise_id,
    target_weight_kg, target_reps, duration_days, status
  )
  values (
    me, target_user, ex_id,
    my_lift.top_weight_kg, my_lift.top_weight_reps, days, 'pending'
  )
  returning id into new_id;

  perform public.push_notification(
    target_user, me, 'challenge_received',
    jsonb_build_object(
      'challenge_id', new_id,
      'exercise_id', ex_id,
      'target_weight_kg', my_lift.top_weight_kg,
      'target_reps', my_lift.top_weight_reps
    )
  );

  return jsonb_build_object('status', 'pending', 'challenge_id', new_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- respond_to_challenge
--
-- Only the opponent may accept — the creator accepting their own challenge would
-- let them start the clock unilaterally. The clock starts HERE, from now(), so
-- neither side can claim work done before the other agreed to compete.
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_challenge(challenge uuid, accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  c  public.challenges%rowtype;
begin
  if me is null then raise exception 'Not signed in'; end if;

  select * into c from public.challenges where id = challenge;
  if not found then raise exception 'No such challenge'; end if;
  if c.opponent_id <> me then raise exception 'That challenge is not yours to accept'; end if;
  if c.status <> 'pending' then raise exception 'That challenge is no longer open'; end if;

  if not accept then
    update public.challenges set status = 'declined', resolved_at = now() where id = challenge;
    perform public.push_notification(c.creator_id, me, 'challenge_declined',
      jsonb_build_object('challenge_id', challenge, 'exercise_id', c.exercise_id));
    return jsonb_build_object('status', 'declined');
  end if;

  update public.challenges
     set status = 'active',
         accepted_at = now(),
         ends_at = now() + (c.duration_days || ' days')::interval
   where id = challenge;

  -- Both sides start at zero. Rows exist from the outset so the UI always has
  -- something to render, and so progress is an UPDATE rather than an upsert.
  insert into public.challenge_progress (challenge_id, user_id)
  values (challenge, c.creator_id), (challenge, c.opponent_id)
  on conflict do nothing;

  perform public.push_notification(c.creator_id, me, 'challenge_accepted',
    jsonb_build_object('challenge_id', challenge, 'exercise_id', c.exercise_id));

  return jsonb_build_object('status', 'active');
end;
$$;

-- ---------------------------------------------------------------------------
-- report_challenge_progress
--
-- The single most security-sensitive function in the app. Enforces, in order:
--   signed in · challenge exists · you are a participant · it is active ·
--   still inside the window · value is plausible · value is an improvement.
-- achieved_at is now(), never a client timestamp — this is what makes
-- backdating impossible.
-- ---------------------------------------------------------------------------
create or replace function public.report_challenge_progress(
  challenge uuid, weight_kg numeric, reps integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  c        public.challenges%rowtype;
  existing public.challenge_progress%rowtype;
  other    uuid;
  improved boolean;
begin
  if me is null then raise exception 'Not signed in'; end if;

  select * into c from public.challenges where id = challenge;
  if not found then raise exception 'No such challenge'; end if;
  if me not in (c.creator_id, c.opponent_id) then
    raise exception 'You are not in that challenge';
  end if;
  if c.status <> 'active' then
    return jsonb_build_object('status', 'not_active');
  end if;
  if c.ends_at is not null and now() > c.ends_at then
    return jsonb_build_object('status', 'window_closed');
  end if;

  if weight_kg is null or reps is null
     or weight_kg < 0 or weight_kg > 500
     or reps < 1 or reps > 100 then
    raise exception 'That lift is out of range';
  end if;

  select * into existing from public.challenge_progress
   where challenge_id = challenge and user_id = me;
  if not found then raise exception 'You have no progress row in that challenge'; end if;

  -- Monotonic: heavier bar, or equal bar with more reps. Anything else is a
  -- no-op rather than an error — the client republishes its whole best after
  -- every workout, so "not an improvement" is the normal case, not a failure.
  improved := weight_kg > existing.best_weight_kg
    or (weight_kg = existing.best_weight_kg and reps > existing.best_reps);

  if not improved then
    return jsonb_build_object('status', 'no_change');
  end if;

  update public.challenge_progress
     set best_weight_kg = weight_kg,
         best_reps = reps,
         achieved_at = now(),
         updated_at = now()
   where challenge_id = challenge and user_id = me;

  -- Tell the other side when their target has been passed. This is the moment
  -- that makes the feature feel alive, so it is worth a notification.
  other := case when me = c.creator_id then c.opponent_id else c.creator_id end;
  if weight_kg > c.target_weight_kg
     or (weight_kg = c.target_weight_kg and reps > c.target_reps) then
    perform public.push_notification(other, me, 'challenge_beaten',
      jsonb_build_object('challenge_id', challenge, 'exercise_id', c.exercise_id));
  end if;

  return jsonb_build_object('status', 'recorded');
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_challenge
--
-- Computes the outcome from stored progress. Callable by a participant, but
-- only once the window has closed, and the result does not depend on WHO calls
-- it — so there is nothing to gain by calling it at a favourable moment.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_challenge(challenge uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  c      public.challenges%rowtype;
  a      public.challenge_progress%rowtype;
  b      public.challenge_progress%rowtype;
  winner uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;

  select * into c from public.challenges where id = challenge;
  if not found then raise exception 'No such challenge'; end if;
  if me not in (c.creator_id, c.opponent_id) then
    raise exception 'You are not in that challenge';
  end if;
  if c.status <> 'active' then
    return jsonb_build_object('status', c.status, 'winner_id', c.winner_id);
  end if;
  if c.ends_at is null or now() <= c.ends_at then
    return jsonb_build_object('status', 'still_running');
  end if;

  select * into a from public.challenge_progress where challenge_id = challenge and user_id = c.creator_id;
  select * into b from public.challenge_progress where challenge_id = challenge and user_id = c.opponent_id;

  -- Heavier bar wins; equal bar, more reps wins; otherwise a draw (null winner).
  if a.best_weight_kg > b.best_weight_kg
     or (a.best_weight_kg = b.best_weight_kg and a.best_reps > b.best_reps) then
    winner := c.creator_id;
  elsif b.best_weight_kg > a.best_weight_kg
     or (b.best_weight_kg = a.best_weight_kg and b.best_reps > a.best_reps) then
    winner := c.opponent_id;
  else
    winner := null;
  end if;

  update public.challenges
     set status = 'complete', winner_id = winner, resolved_at = now()
   where id = challenge;

  perform public.push_notification(c.creator_id, null, 'challenge_ended',
    jsonb_build_object('challenge_id', challenge, 'won', winner = c.creator_id));
  perform public.push_notification(c.opponent_id, null, 'challenge_ended',
    jsonb_build_object('challenge_id', challenge, 'won', winner = c.opponent_id));

  return jsonb_build_object('status', 'complete', 'winner_id', winner);
end;
$$;

-- ---------------------------------------------------------------------------
-- list_challenges — everything for the Challenges tab in one call.
-- ---------------------------------------------------------------------------
create or replace function public.list_challenges()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select
      c.id, c.exercise_id, c.status, c.duration_days,
      c.target_weight_kg, c.target_reps,
      c.created_at, c.ends_at, c.winner_id,
      c.creator_id = auth.uid() as i_created,
      other.id           as other_id,
      other.username     as other_username,
      other.display_name as other_display_name,
      other.avatar_url   as other_avatar_url,
      coalesce(mine.best_weight_kg, 0)  as my_best_weight_kg,
      coalesce(mine.best_reps, 0)       as my_best_reps,
      coalesce(theirs.best_weight_kg, 0) as their_best_weight_kg,
      coalesce(theirs.best_reps, 0)      as their_best_reps
    from public.challenges c
    join public.profiles other
      on other.id = case when c.creator_id = auth.uid() then c.opponent_id else c.creator_id end
    left join public.challenge_progress mine
      on mine.challenge_id = c.id and mine.user_id = auth.uid()
    left join public.challenge_progress theirs
      on theirs.challenge_id = c.id and theirs.user_id = other.id
    where auth.uid() in (c.creator_id, c.opponent_id)
      and c.status in ('pending', 'active', 'complete')
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- friends_leaderboard
--
-- Ranked by WORKOUTS and STREAK, never by raw volume.
--
-- That is a product decision enforced in the schema. A volume leaderboard pays
-- people to do junk sets — twenty sets of light curls beats a hard session of
-- heavy triples. Consistency cannot be farmed the same way: the only way to log
-- more workouts is to actually turn up.
-- ---------------------------------------------------------------------------
-- Deliberately SECURITY INVOKER (i.e. no `security definer`), unlike every other
-- function in these migrations. The others need elevated rights to enforce
-- relational rules; this one only reads. Running it as the caller means the
-- existing RLS policies filter it automatically: a friend who turned stat
-- sharing off simply yields no profile_stats row, so they appear with zeros
-- rather than having their numbers leak past can_view_stats(). Marking this
-- DEFINER would have quietly bypassed the app's central privacy rule.
create or replace function public.friends_leaderboard(metric text default 'workouts')
returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_url     text,
  is_me          boolean,
  workouts       integer,
  streak_weeks   integer,
  this_week      integer
)
language sql
stable
set search_path = public
as $$
  with circle as (
    -- Me, plus every accepted friend.
    select auth.uid() as uid
    union
    select case when f.user_low = auth.uid() then f.user_high else f.user_low end
      from public.friendships f
     where f.status = 'accepted'
       and auth.uid() in (f.user_low, f.user_high)
  )
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.id = auth.uid(),
    coalesce(s.total_workouts, 0),
    coalesce(s.streak_weeks, 0),
    coalesce(s.workouts_this_week, 0)
  from circle
  join public.profiles p on p.id = circle.uid
  -- RLS filters this join for us (see the note above the function): a friend
  -- whose stats you may not see contributes no row, so they land here with
  -- zeros. They still APPEAR on the board — dropping them entirely would leak
  -- the fact that they opted out.
  left join public.profile_stats s on s.user_id = p.id
  order by
    case when metric = 'streak'    then coalesce(s.streak_weeks, 0)
         when metric = 'this_week' then coalesce(s.workouts_this_week, 0)
         else coalesce(s.total_workouts, 0) end desc,
    p.display_name
  limit 50;
$$;

grant execute on function public.create_challenge(uuid, text, integer)               to authenticated;
grant execute on function public.respond_to_challenge(uuid, boolean)                 to authenticated;
grant execute on function public.report_challenge_progress(uuid, numeric, integer)   to authenticated;
grant execute on function public.resolve_challenge(uuid)                             to authenticated;
grant execute on function public.list_challenges()                                   to authenticated;
grant execute on function public.friends_leaderboard(text)                           to authenticated;
