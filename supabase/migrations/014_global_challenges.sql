-- Kun Workouts — 014: challenges between any two users.
--
-- Run after 013. Safe to re-run.
--
-- WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT
-- One rule changes: create_challenge() no longer requires the two people to be
-- friends. Everything else about challenges is untouched, because everything else
-- was already keyed on PARTICIPATION rather than on friendship:
--
--   respond_to_challenge()      only the opponent may accept — unchanged
--   report_challenge_progress() only a participant may report, server-stamped,
--                               monotonic, bounded — unchanged
--   resolve_challenge()         outcome computed from stored progress, and the
--                               same whoever calls it — logic unchanged, one
--                               feed event added
--   list_challenges()           participants only — unchanged
--   challenges RLS              participants only — unchanged
--   challenge_progress RLS      participants only — unchanged
--
-- So this is a three-line change to an eligibility check, plus the two guards
-- below that the removed check was quietly providing. It is not a rewrite, and
-- the anti-cheat position stated at the top of 003 is unaffected.
--
-- A DECISION 003 MADE THAT THIS MIGRATION REVERSES, ON PURPOSE
-- 003 said: "Friends only. Challenging a stranger would leak your PR to them."
-- That was correct given a friends-first product. It is now intended behaviour:
-- the target weight is one number, on one exercise, published deliberately by
-- the person choosing to issue the challenge — and a challenge that did not show
-- its target would be meaningless. The old comment is reversed here rather than
-- deleted so the reasoning stays legible to whoever reads this next.
--
-- WHAT THE FRIENDSHIP CHECK WAS ALSO DOING
-- It was the only thing stopping one account challenging everybody. The unique
-- index challenges_one_live_per_pair (003) stops repeat spam to the SAME person
-- on the SAME lift, and nothing stopped a fresh account firing a challenge at
-- every username it could find. Removing the friendship requirement therefore
-- has to come with a rate limit, which is what challenge_rate_limit_ok() is.

-- ---------------------------------------------------------------------------
-- challenge_rate_limit_ok
--
-- Its own function, with the number in one place, so the limit can be raised,
-- lowered or made per-tier later by replacing this function alone. No caller
-- needs to change and no part of the challenge system needs restructuring.
--
-- Counts challenges CREATED in the window rather than ones still pending. A
-- pending-only rule would be trivially defeated: fire ten, wait for the declines,
-- fire ten more. Creation is the action being limited, so creation is what is
-- counted.
-- ---------------------------------------------------------------------------
create or replace function public.challenge_rate_limit_ok(me uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Ten a day. Comfortably above anything a real user does — a challenge is a
  -- considered act, not a browse — and low enough that an account cannot reach
  -- the whole community with one.
  select count(*) < 10
    from public.challenges c
   where c.creator_id = me
     and c.created_at > now() - interval '24 hours';
$$;

revoke all on function public.challenge_rate_limit_ok(uuid) from public;
revoke all on function public.challenge_rate_limit_ok(uuid) from anon;
grant execute on function public.challenge_rate_limit_ok(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- emit_challenge_event
--
-- Naming the other person in a public feed row is the one thing a challenge event
-- does that a challenge itself does not, so the opponent's identity is included
-- only when THEY have community sharing on. Someone who opted out does not get
-- pulled onto the feed by somebody else's action; the event still appears, just
-- as "challenged someone".
--
-- Internal, like every other emitter: granted to nobody.
-- ---------------------------------------------------------------------------
create or replace function public.emit_challenge_event(
  actor uuid, other uuid, kind text, ex_id text, challenge uuid, extra jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  other_name text;
  other_user text;
begin
  select p.display_name, p.username into other_name, other_user
    from public.profiles p
   where p.id = other and p.share_activity;

  perform public.emit_community_event(
    actor,
    kind,
    ex_id,
    challenge,
    coalesce(extra, '{}'::jsonb) || jsonb_build_object(
      'opponent_display_name', other_name,
      'opponent_username',     other_user
    ),
    -- No dedupe window: challenges_one_live_per_pair already makes a duplicate
    -- live challenge on the same lift impossible, so a repeat here would have to
    -- be a genuinely new contest.
    null
  );
end;
$$;

revoke all on function public.emit_challenge_event(uuid, uuid, text, text, uuid, jsonb) from public;
revoke all on function public.emit_challenge_event(uuid, uuid, text, text, uuid, jsonb) from anon;
revoke all on function public.emit_challenge_event(uuid, uuid, text, text, uuid, jsonb) from authenticated;

-- ---------------------------------------------------------------------------
-- create_challenge — replaced.
--
-- Replaced here rather than edited in 003, following the convention 004, 005 and
-- 007 used for delete_my_account(): every earlier migration stays runnable on its
-- own, and the history of why a rule changed stays readable.
--
-- The target is still read from the challenger's OWN published lifts rather than
-- accepted as a parameter, so you still cannot invent a target you never hit.
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
  me      uuid := auth.uid();
  my_lift public.user_lifts%rowtype;
  new_id  uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if target_user is null then raise exception 'No user given'; end if;
  if target_user = me then raise exception 'You cannot challenge yourself'; end if;
  if days not in (7, 14, 30) then raise exception 'Challenges run for 7, 14 or 30 days'; end if;

  -- Checked explicitly rather than left to the foreign key, so a bad id produces
  -- a sentence the UI can show instead of a constraint violation.
  if not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'That user does not exist';
  end if;

  -- NO FRIENDSHIP CHECK. This is the change. See the notes at the top of this
  -- file: any signed-in user may challenge any other, and the friendship system
  -- remains in place for the contexts that still want it.

  if not public.challenge_rate_limit_ok(me) then
    raise exception 'You have sent a lot of challenges today — try again tomorrow';
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
       and least(creator_id, opponent_id)    = least(me, target_user)
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

  -- The feed says a contest started, and on which lift. It deliberately does NOT
  -- carry the target weight: that number is the challenger's PR, it is shown to
  -- the opponent because they have to beat it, and there is no reason for the
  -- rest of the app to read it off a feed card.
  perform public.emit_challenge_event(me, target_user, 'challenge_created', ex_id, new_id);

  return jsonb_build_object('status', 'pending', 'challenge_id', new_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_challenge — replaced.
--
-- The outcome logic is byte-for-byte the logic from 003: computed from stored
-- progress, independent of who calls it, refusing to run before the window
-- closes. The only addition is the feed event at the end.
--
-- A draw produces no event. "Nobody won" is a true statement about a challenge
-- and a poor one on a feed, and the two people involved already know.
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
  loser  uuid;
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
    loser  := c.opponent_id;
  elsif b.best_weight_kg > a.best_weight_kg
     or (b.best_weight_kg = a.best_weight_kg and b.best_reps > a.best_reps) then
    winner := c.opponent_id;
    loser  := c.creator_id;
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

  if winner is not null then
    perform public.emit_challenge_event(
      winner, loser, 'challenge_completed', c.exercise_id, challenge,
      jsonb_build_object('won', true)
    );
  end if;

  return jsonb_build_object('status', 'complete', 'winner_id', winner);
end;
$$;

revoke all on function public.create_challenge(uuid, text, integer) from public;
revoke all on function public.create_challenge(uuid, text, integer) from anon;
grant execute on function public.create_challenge(uuid, text, integer) to authenticated;

revoke all on function public.resolve_challenge(uuid) from public;
revoke all on function public.resolve_challenge(uuid) from anon;
grant execute on function public.resolve_challenge(uuid) to authenticated;

notify pgrst, 'reload schema';
