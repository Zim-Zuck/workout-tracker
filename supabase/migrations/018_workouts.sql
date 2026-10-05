-- Finished workouts, one row per session, owned entirely by the user.
--
-- This table exists so that a finished workout has somewhere to go that is not
-- a once-a-day JSON snapshot. The summary tables (profile_stats, user_lifts,
-- weekly_stats) are derived aggregates and always have been; they cannot answer
-- "give me back the session I logged on the 4th".
--
-- THE IMPORTANT COLUMN IS client_id.
--
-- It is generated on the device, before the session is finished and before any
-- request is made, and it never changes. The unique constraint on
-- (user_id, client_id) is what makes the upload idempotent: a request that
-- timed out after the server had already committed is retried onto the SAME
-- row. Without it, one flaky connection at the gym turns one workout into
-- three, and the user's history is wrong in a way they cannot fix.
--
-- Idempotent by construction (IF NOT EXISTS / DROP POLICY IF EXISTS), so it is
-- safe to re-run against a database that already has it.

create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- The device-generated id. Text, not uuid: the client's own id scheme is
  -- prefixed ('wo_...') and the server has no business reformatting it.
  client_id   text not null,
  date        timestamptz not null,
  started_at  timestamptz,
  ended_at    timestamptz,
  split       text,
  name        text,
  notes       text not null default '',
  -- The sets, the exercise order and the skip list, as the client wrote them.
  -- Stored whole rather than shredded into rows: the server never computes over
  -- a workout's sets (every statistic the app shows is derived on the device
  -- from local history), so a document is the honest shape for it.
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint workouts_client_id_unique unique (user_id, client_id)
);

create index if not exists workouts_user_date_idx
  on public.workouts (user_id, date desc);

alter table public.workouts enable row level security;

-- A workout is private. There is no "friends can see my sessions" policy here:
-- what friends see comes from the summary tables, which the user publishes
-- deliberately. Raw session data is never part of that.
drop policy if exists "workouts are readable by their owner" on public.workouts;
create policy "workouts are readable by their owner"
  on public.workouts for select
  using (auth.uid() = user_id);

drop policy if exists "workouts are insertable by their owner" on public.workouts;
create policy "workouts are insertable by their owner"
  on public.workouts for insert
  with check (auth.uid() = user_id);

-- Needed as well as insert: an upsert that collides on (user_id, client_id)
-- becomes an update, and without this policy the retry of a timed-out request
-- would be rejected rather than deduplicated.
drop policy if exists "workouts are updatable by their owner" on public.workouts;
create policy "workouts are updatable by their owner"
  on public.workouts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workouts are deletable by their owner" on public.workouts;
create policy "workouts are deletable by their owner"
  on public.workouts for delete
  using (auth.uid() = user_id);
