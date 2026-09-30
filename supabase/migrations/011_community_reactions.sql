-- Kun Workouts — 011: reactions on community activity.
--
-- Run after 010. Safe to re-run.
--
-- REACTIONS NOW, COMMENTS LATER, AND WHY THAT IS A DESIGN AND NOT A DEFERRAL
-- A reaction is a row with no free text in it. There is nothing to moderate,
-- nothing to report, nothing to abuse, and nothing that needs a delete-someone-
-- else's-words story. It makes the feed feel answered-to at a fraction of the
-- cost of anything that carries a sentence.
--
-- Comments, when they come, are a sibling table keyed on the same event_id with
-- the same (event_id, created_at) access pattern and the same
-- writes-through-functions-only rule, plus a comment_count column maintained the
-- way reaction_count is maintained here. Nothing in the event model, the feed
-- function or this table has to change to admit them. That is the whole reason
-- reaction_count lives on community_events rather than being counted at read
-- time: the second counter costs one column, not a rewrite.

-- ---------------------------------------------------------------------------
-- event_reactions
--
-- One row per person per event. The primary key IS the "you may only react
-- once" rule, so changing your mind is an update rather than a duplicate.
-- ---------------------------------------------------------------------------
create table if not exists public.event_reactions (
  event_id   bigint not null references public.community_events(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  kind       text   not null default 'like',
  created_at timestamptz not null default now(),

  primary key (event_id, user_id),

  constraint event_reactions_kind check (kind in ('like', 'strong', 'fire'))
);

-- The primary key already serves "who reacted to this event". This covers the
-- other direction: "did I react to any of these twenty events", which is one
-- lookup per feed page rather than one per row.
create index if not exists event_reactions_user_idx
  on public.event_reactions (user_id, event_id);

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Reads follow the event: if you cannot see the activity, you cannot see who
-- applauded it. Writes go through the two functions below and have no policy at
-- all — not because `user_id = auth.uid()` would be hard to express, but because
-- the author's notification has to be created server-side, and splitting the
-- write from the notification would let a client take the first half without the
-- second.
-- ---------------------------------------------------------------------------
alter table public.event_reactions enable row level security;

drop policy if exists event_reactions_select_visible on public.event_reactions;
create policy event_reactions_select_visible on public.event_reactions
  for select to authenticated
  using (exists (
    select 1
      from public.community_events e
      join public.profiles p on p.id = e.actor_id
     where e.id = event_id and p.share_activity
  ));

-- NOTE: no insert, update or delete policy.

-- ---------------------------------------------------------------------------
-- notifications: admit the new type.
--
-- The type CHECK in 002 is an allow-list, so a new kind of notification needs it
-- widened before push_notification() can write one. Getting this wrong is worse
-- than it looks: push_notification() is called from inside SECURITY DEFINER
-- functions that are doing real work, so a constraint violation there would roll
-- back the reaction itself, not merely fail to announce it.
--
-- 'event_comment' is listed now, unused, so that adding comments later needs no
-- migration against this constraint at all.
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type;
alter table public.notifications add constraint notifications_type check (type in (
  'friend_request', 'friend_accepted',
  'challenge_received', 'challenge_accepted', 'challenge_declined',
  'challenge_beaten', 'challenge_ended',
  'event_reaction', 'event_comment'
));

-- ---------------------------------------------------------------------------
-- notify_event_reaction
--
-- Collapses rather than stacks. Ten people reacting to one PR is one inbox row
-- reading "10 people", not ten rows saying the same thing — which is the
-- difference between a notification worth opening and a reason to turn
-- notifications off.
--
-- Only an UNREAD row is collapsed into. Once you have seen "3 people liked
-- this", the next reaction is genuinely new information and starts a fresh row.
--
-- Internal, like push_notification(): granted to nobody.
-- ---------------------------------------------------------------------------
create or replace function public.notify_event_reaction(
  target uuid, actor uuid, event bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  existing_count integer;
begin
  if target is null or actor is null or target = actor then return; end if;

  select id, coalesce((payload->>'count')::integer, 1)
    into existing_id, existing_count
    from public.notifications
   where user_id = target
     and type    = 'event_reaction'
     and read_at is null
     -- Compared as text rather than cast to bigint: a cast would be evaluated
     -- against every row the planner happens to reach, and a payload from some
     -- other notification type with a non-numeric event_id would raise.
     and payload->>'event_id' = event::text
   order by created_at desc
   limit 1;

  if existing_id is not null then
    update public.notifications
       set payload    = jsonb_set(payload, '{count}', to_jsonb(existing_count + 1)),
           -- Re-stamped so the collapsed row returns to the top of the inbox,
           -- and re-attributed to the most recent reactor, whose avatar is the
           -- one the row shows.
           actor_id   = actor,
           created_at = now()
     where id = existing_id;
    return;
  end if;

  insert into public.notifications (user_id, actor_id, type, payload)
  values (target, actor, 'event_reaction',
          jsonb_build_object('event_id', event, 'count', 1));
end;
$$;

revoke all on function public.notify_event_reaction(uuid, uuid, bigint) from public;
revoke all on function public.notify_event_reaction(uuid, uuid, bigint) from anon;
revoke all on function public.notify_event_reaction(uuid, uuid, bigint) from authenticated;

-- ---------------------------------------------------------------------------
-- react_to_event
--
-- Idempotent by construction: reacting again with the same kind is a no-op,
-- reacting with a different kind swaps it, and neither case notifies twice. The
-- count is only ever moved by a genuine first insert.
-- ---------------------------------------------------------------------------
create or replace function public.react_to_event(event bigint, kind text default 'like')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  actor   uuid;
  already boolean;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if event is null then raise exception 'No activity given'; end if;
  if kind is null or kind not in ('like', 'strong', 'fire') then
    raise exception 'Unknown reaction';
  end if;

  -- Resolved through the same condition the select policy uses, so an event
  -- whose author has since turned community sharing off behaves as though it
  -- does not exist — rather than being invisible but still reactable.
  select e.actor_id into actor
    from public.community_events e
    join public.profiles p on p.id = e.actor_id
   where e.id = event and p.share_activity;

  if actor is null then raise exception 'No such activity'; end if;

  -- Asked before the write rather than inferred from it. The alternative idiom
  -- is `returning (xmax = 0)` on the upsert, which is compact but reads as a
  -- riddle and leans on a system column's behaviour under concurrency.
  --
  -- The race this leaves is one person's own double-tap arriving as two
  -- simultaneous requests, whose worst outcome is a count one too low — and
  -- unreact_from_event() already floors the count at zero, so it cannot go
  -- negative or stick. A reaction counter is not worth a lock.
  select true into already
    from public.event_reactions
   where event_id = event and user_id = me;

  insert into public.event_reactions (event_id, user_id, kind)
  values (event, me, kind)
  on conflict (event_id, user_id) do update set kind = excluded.kind;

  -- Only a genuine first reaction moves the count or notifies. Changing your
  -- mind about which reaction to leave is not news for the author.
  if not coalesce(already, false) then
    update public.community_events
       set reaction_count = reaction_count + 1
     where id = event;
    perform public.notify_event_reaction(actor, me, event);
  end if;

  return jsonb_build_object('status', 'ok', 'kind', kind, 'first', not coalesce(already, false));
end;
$$;

-- ---------------------------------------------------------------------------
-- unreact_from_event
-- ---------------------------------------------------------------------------
create or replace function public.unreact_from_event(event bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  removed integer;
begin
  if me is null then raise exception 'Not signed in'; end if;

  delete from public.event_reactions
   where event_id = event and user_id = me;
  get diagnostics removed = row_count;

  if removed > 0 then
    -- greatest(...) rather than a bare subtraction: the count is denormalised,
    -- and a floor costs nothing while a negative badge would be visible.
    update public.community_events
       set reaction_count = greatest(reaction_count - 1, 0)
     where id = event;
  end if;

  return jsonb_build_object('status', 'ok', 'removed', removed > 0);
end;
$$;

revoke all on function public.react_to_event(bigint, text) from public;
revoke all on function public.react_to_event(bigint, text) from anon;
grant execute on function public.react_to_event(bigint, text) to authenticated;

revoke all on function public.unreact_from_event(bigint) from public;
revoke all on function public.unreact_from_event(bigint) from anon;
grant execute on function public.unreact_from_event(bigint) to authenticated;

notify pgrst, 'reload schema';
