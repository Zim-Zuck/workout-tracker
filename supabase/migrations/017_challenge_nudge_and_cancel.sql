-- Kun Workouts — 017: withdrawing and nudging a pending challenge.
--
-- NOT YET APPLIED. This migration is proposed, not installed: the client calls
-- these two functions and degrades with a specific message if they are absent,
-- so the app is correct either way. Run it when you want the two buttons live.
--
-- Run after 016. Safe to re-run.
--
-- THE GAP THIS CLOSES
-- respond_to_challenge() is deliberately opponent-only: `if c.opponent_id <> me
-- then raise`. That is right — accepting on somebody else's behalf would be
-- forging a result. But it left the person who SENT a challenge with no way to
-- take it back and no way to ask again, which are the only two things you ever
-- want to do with a challenge nobody has answered.
--
-- Both functions are SECURITY DEFINER and check the caller themselves, matching
-- every other write in this schema: clients never touch the tables.

-- ---------------------------------------------------------------------------
-- withdraw_challenge — the creator takes back a challenge nobody answered.
--
-- Only while it is still pending. Once it is accepted it is a contest between
-- two people and one of them does not get to delete it; that is what
-- resolve_challenge() is for.
-- ---------------------------------------------------------------------------
create or replace function public.withdraw_challenge(challenge uuid)
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
  if c.creator_id <> me then raise exception 'That challenge is not yours to withdraw'; end if;
  if c.status <> 'pending' then raise exception 'That challenge has already been answered'; end if;

  update public.challenges
     set status = 'withdrawn', resolved_at = now()
   where id = challenge;

  -- The opponent is told, so a challenge does not just evaporate out of their
  -- inbox with no explanation.
  perform public.push_notification(c.opponent_id, me, 'challenge_withdrawn',
    jsonb_build_object('challenge_id', challenge, 'exercise_id', c.exercise_id));

  return jsonb_build_object('status', 'withdrawn');
end;
$$;

-- The status CHECK has to admit the new terminal state. Written as a drop and
-- re-add so the migration is re-runnable.
alter table public.challenges drop constraint if exists challenges_status_check;
alter table public.challenges add constraint challenges_status_check
  check (status in ('pending', 'active', 'complete', 'declined', 'withdrawn'));

-- ---------------------------------------------------------------------------
-- nudge_challenge — one reminder, rate limited.
--
-- A nudge is a notification and nothing else: no new row, no state change, no
-- effect on the challenge. The rate limit is the whole design. Without it this
-- is a button that sends a person a notification every time it is pressed,
-- which is not a nudge, it is a way to be unpleasant to somebody. One per
-- twenty-four hours per challenge.
-- ---------------------------------------------------------------------------
create or replace function public.nudge_challenge(challenge uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  c  public.challenges%rowtype;
  recent timestamptz;
begin
  if me is null then raise exception 'Not signed in'; end if;

  select * into c from public.challenges where id = challenge;
  if not found then raise exception 'No such challenge'; end if;
  if c.creator_id <> me then raise exception 'That challenge is not yours to nudge'; end if;
  if c.status <> 'pending' then raise exception 'That challenge has already been answered'; end if;

  select max(created_at) into recent
    from public.notifications
   where user_id = c.opponent_id
     and actor_id = me
     and kind = 'challenge_nudge'
     and payload->>'challenge_id' = challenge::text;

  if recent is not null and recent > now() - interval '24 hours' then
    raise exception 'You have already nudged this one today';
  end if;

  perform public.push_notification(c.opponent_id, me, 'challenge_nudge',
    jsonb_build_object('challenge_id', challenge, 'exercise_id', c.exercise_id));

  return jsonb_build_object('status', 'nudged');
end;
$$;

-- Matching 008: EXECUTE goes to authenticated only, never to PUBLIC.
revoke execute on function public.withdraw_challenge(uuid) from public;
revoke execute on function public.nudge_challenge(uuid)    from public;
grant  execute on function public.withdraw_challenge(uuid) to authenticated;
grant  execute on function public.nudge_challenge(uuid)    to authenticated;
