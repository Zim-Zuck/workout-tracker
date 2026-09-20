-- Kun Workouts — 001: identity, stats and lifts.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.
--
-- THE CENTRAL PRIVACY DECISION
-- Identity and stats live in two tables on purpose. Postgres row-level security
-- filters rows, not columns, so "a stranger sees your name but not your numbers"
-- cannot be expressed on a single table without leaking the numbers to anyone
-- who crafts their own SELECT. Splitting them makes the rule a database
-- guarantee rather than something the React app politely refrains from showing.
--
--   profiles       readable by any signed-in user   (name, @username, avatar, bio)
--   profile_stats  readable by you + accepted friends, and only if share_stats
--   user_lifts     same rule as profile_stats

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null,
  display_name  text not null,
  avatar_url    text,
  bio           text,
  -- The single all-or-nothing privacy switch. Off = friends see your identity
  -- but none of your numbers.
  share_stats   boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Usernames are stored already-lowercased so a plain unique index gives
  -- case-insensitive uniqueness without needing the citext extension.
  constraint profiles_username_format
    check (username = lower(username) and username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len
    check (char_length(display_name) between 1 and 40),
  constraint profiles_bio_len
    check (bio is null or char_length(bio) <= 160)
);

create unique index if not exists profiles_username_key on public.profiles (username);

-- ---------------------------------------------------------------------------
-- friendships
--
-- ONE row per pair, not two. The two ids are stored sorted (user_low < user_high)
-- with a unique constraint across them, which makes duplicate requests and
-- crossing requests structurally impossible: if B requests A while A's request
-- to B is already pending, the insert collides instead of creating a second,
-- contradictory row. send_friend_request() turns that collision into an instant
-- mutual accept, which is what both people meant anyway.
--
-- Defined here rather than in 002 because are_friends() below reads it, and
-- Postgres validates SQL function bodies at creation time.
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  user_low     uuid not null references auth.users(id) on delete cascade,
  user_high    uuid not null references auth.users(id) on delete cascade,
  -- Who sent it — needed so the *other* person is the only one who can accept.
  requester_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,

  constraint friendships_ordered check (user_low < user_high),
  constraint friendships_status check (status in ('pending', 'accepted')),
  constraint friendships_requester_is_member check (requester_id in (user_low, user_high)),
  constraint friendships_unique_pair unique (user_low, user_high)
);

create index if not exists friendships_low_idx  on public.friendships (user_low, status);
create index if not exists friendships_high_idx on public.friendships (user_high, status);

-- ---------------------------------------------------------------------------
-- Helper functions
--
-- Both are SECURITY DEFINER so they can read friendships without tripping that
-- table's own RLS policies (which would otherwise recurse infinitely when a
-- friendships policy calls a function that reads friendships).
-- ---------------------------------------------------------------------------

-- Friendships are stored one row per pair with the two ids in sorted order, so
-- membership is a single lookup in either direction.
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and f.user_low  = least(a, b)
      and f.user_high = greatest(a, b)
  );
$$;

-- The one place the stats-visibility rule is defined. Every stats policy calls
-- this, so the rule can only ever change in one place.
create or replace function public.can_view_stats(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target = auth.uid()
    or (
      public.are_friends(auth.uid(), target)
      and exists (select 1 from public.profiles p where p.id = target and p.share_stats)
    );
$$;

-- ---------------------------------------------------------------------------
-- profile_stats — the headline numbers, computed on the device and published.
-- ---------------------------------------------------------------------------
create table if not exists public.profile_stats (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  -- Consecutive ISO weeks with at least one workout. Weekly, not daily: rest
  -- days should not break a streak, and this matches computeStreak() locally.
  streak_weeks       integer not null default 0,
  total_workouts     integer not null default 0,
  lifetime_volume_kg numeric(12,1) not null default 0,
  workouts_this_week integer not null default 0,
  last_workout_at    timestamptz,
  updated_at         timestamptz not null default now(),

  -- Plausibility bounds. These do not make a client-computed number
  -- trustworthy — nothing can, since the phone is the only witness to a lift —
  -- but they keep a tampered or buggy client from writing absurdities that
  -- would wreck every leaderboard it appears on.
  constraint stats_sane check (
    streak_weeks between 0 and 10000
    and total_workouts between 0 and 100000
    and lifetime_volume_kg between 0 and 1000000000
    and workouts_this_week between 0 and 100
  )
);

-- ---------------------------------------------------------------------------
-- user_lifts — one row per user per exercise.
--
-- exercise_id holds the app's BUILT-IN exercise ids only (ex_bench_press, ...).
-- Custom exercises get device-random ids that cannot be matched across users,
-- so publishing them would produce meaningless comparisons. They stay local.
--
-- top_weight_kg is the headline everywhere in the UI: the weight actually on
-- the bar. e1rm is kept alongside as a tiebreaker, never as the headline.
-- ---------------------------------------------------------------------------
create table if not exists public.user_lifts (
  user_id         uuid not null references auth.users(id) on delete cascade,
  exercise_id     text not null,
  top_weight_kg   numeric(6,2) not null,
  top_weight_reps integer not null,
  best_e1rm_kg    numeric(6,2) not null default 0,
  achieved_at     timestamptz not null,
  updated_at      timestamptz not null default now(),

  primary key (user_id, exercise_id),

  constraint lifts_exercise_id_format check (exercise_id ~ '^ex_[a-z0-9_]{1,60}$'),
  -- Zero is a legitimate weight: pull-ups, dips and planks are logged at
  -- bodyweight with no added load. For those the headline is the rep count, so
  -- the pair (top_weight_kg, top_weight_reps) is what the UI compares, never
  -- the weight alone.
  constraint lifts_sane check (
    top_weight_kg   >= 0  and top_weight_kg <= 500
    and top_weight_reps >= 1 and top_weight_reps <= 100
    and best_e1rm_kg  >= 0 and best_e1rm_kg  <= 600
  )
);

create index if not exists user_lifts_exercise_idx on public.user_lifts (exercise_id);

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Every table below denies by default. There is no policy anywhere that lets
-- one user write another user's row, regardless of what ids the client sends.
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.profile_stats enable row level security;
alter table public.user_lifts    enable row level security;
-- friendships gets its policies in 002. RLS is switched on here anyway: a table
-- with RLS enabled and no policies denies everything, so it is never briefly
-- readable between migrations.
alter table public.friendships   enable row level security;

-- profiles: identity is visible to every signed-in user. This is deliberate and
-- is the ONLY thing a stranger can see — it is what makes username search work.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No delete policy: accounts are removed through delete_my_account(), which
-- cascades from auth.users, so there is no way to orphan a half-deleted profile.

-- profile_stats: yours always; a friend's only when you are friends AND they
-- have stat sharing on.
drop policy if exists stats_select_visible on public.profile_stats;
create policy stats_select_visible on public.profile_stats
  for select to authenticated
  using (public.can_view_stats(user_id));

drop policy if exists stats_upsert_own on public.profile_stats;
create policy stats_upsert_own on public.profile_stats
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists stats_update_own on public.profile_stats;
create policy stats_update_own on public.profile_stats
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- user_lifts: same visibility rule, same ownership rule.
drop policy if exists lifts_select_visible on public.user_lifts;
create policy lifts_select_visible on public.user_lifts
  for select to authenticated
  using (public.can_view_stats(user_id));

drop policy if exists lifts_insert_own on public.user_lifts;
create policy lifts_insert_own on public.user_lifts
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists lifts_update_own on public.user_lifts;
create policy lifts_update_own on public.user_lifts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists lifts_delete_own on public.user_lifts;
create policy lifts_delete_own on public.user_lifts
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Username availability
--
-- profiles is readable by signed-in users, so a client could check availability
-- with a plain select — but this function also works before a profile exists
-- and keeps the "is it valid AND free" rule in one place.
-- ---------------------------------------------------------------------------
create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(candidate) ~ '^[a-z0-9_]{3,20}$'
    and not exists (select 1 from public.profiles p where p.username = lower(candidate));
$$;

-- ---------------------------------------------------------------------------
-- Account deletion
--
-- Deleting the auth user cascades to every table above (and, in later
-- migrations, to friendships, challenges and notifications), so a user can
-- genuinely remove themselves rather than merely being hidden.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.can_view_stats(uuid) to authenticated;
