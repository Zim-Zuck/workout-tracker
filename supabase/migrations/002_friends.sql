-- Kun Workouts — 002: notifications and the friendship lifecycle.
--
-- Run after 001. Safe to re-run.
--
-- Everything that CHANGES a friendship goes through a SECURITY DEFINER function
-- rather than a table policy. Not for convenience — because the rules are
-- relational ("only the person who did NOT send it may accept it", "a crossing
-- request becomes a mutual accept") and expressing those as WITH CHECK clauses
-- would be both unreadable and easy to get subtly wrong. A function is one
-- place to read, one place to audit.

-- ---------------------------------------------------------------------------
-- notifications
--
-- Clients get NO insert policy on this table, at all. The only way a row
-- appears in your inbox is a SECURITY DEFINER function below, triggered by
-- someone performing a real action. Nobody can spam anyone.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Who caused it. Nullable so a system notification has no actor, and ON DELETE
  -- SET NULL so deleting your account does not erase other people's history.
  actor_id   uuid references auth.users(id) on delete set null,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_type check (type in (
    'friend_request', 'friend_accepted',
    'challenge_received', 'challenge_accepted', 'challenge_declined',
    'challenge_beaten', 'challenge_ended'
  ))
);

create index if not exists notifications_inbox_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- Update is deliberately narrow: it exists so you can mark your own inbox read.
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- NOTE: no insert policy. This is intentional and load-bearing.

-- Internal helper. Not granted to authenticated, so it is reachable only from
-- the other SECURITY DEFINER functions in this file.
create or replace function public.push_notification(
  target uuid, actor uuid, kind text, body jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Never notify someone about their own action.
  if target is null or target = actor then return; end if;
  insert into public.notifications (user_id, actor_id, type, payload)
  values (target, actor, kind, coalesce(body, '{}'::jsonb));
end;
$$;

revoke all on function public.push_notification(uuid, uuid, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- friendships — RLS
--
-- Reads are open to both members. Writes are closed entirely: the functions
-- below are the only path, so a client cannot invent an 'accepted' row or
-- accept a request that was sent to somebody else.
-- ---------------------------------------------------------------------------
drop policy if exists friendships_select_member on public.friendships;
create policy friendships_select_member on public.friendships
  for select to authenticated
  using (auth.uid() in (user_low, user_high));

-- Removing a friend (or withdrawing your own pending request) is the one write
-- that needs no extra rules: either member may do it, and the effect is the
-- same whatever the current status.
drop policy if exists friendships_delete_member on public.friendships;
create policy friendships_delete_member on public.friendships
  for delete to authenticated
  using (auth.uid() in (user_low, user_high));

-- ---------------------------------------------------------------------------
-- send_friend_request
--
-- Handles the three awkward cases explicitly rather than leaving them to a
-- unique-constraint error the UI would have to guess at:
--   already friends        → no-op, reported as such
--   you already asked them → no-op (no duplicate, no second notification)
--   they already asked you → instant mutual accept, which is what you both meant
-- ---------------------------------------------------------------------------
create or replace function public.send_friend_request(target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  lo       uuid;
  hi       uuid;
  existing public.friendships%rowtype;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if target_id is null then raise exception 'No user given'; end if;
  if target_id = me then raise exception 'You cannot add yourself'; end if;
  if not exists (select 1 from public.profiles where id = target_id) then
    raise exception 'That user does not exist';
  end if;

  lo := least(me, target_id);
  hi := greatest(me, target_id);

  select * into existing from public.friendships where user_low = lo and user_high = hi;

  if found then
    if existing.status = 'accepted' then
      return jsonb_build_object('status', 'already_friends');
    end if;

    -- They asked first: accept instead of creating a contradictory second row.
    if existing.requester_id = target_id then
      update public.friendships
         set status = 'accepted', responded_at = now()
       where id = existing.id;
      perform public.push_notification(target_id, me, 'friend_accepted', '{}'::jsonb);
      return jsonb_build_object('status', 'accepted');
    end if;

    -- Our own request is already pending. Idempotent: no duplicate notification.
    return jsonb_build_object('status', 'already_pending');
  end if;

  insert into public.friendships (user_low, user_high, requester_id, status)
  values (lo, hi, me, 'pending');

  perform public.push_notification(target_id, me, 'friend_request', '{}'::jsonb);
  return jsonb_build_object('status', 'pending');
end;
$$;

-- ---------------------------------------------------------------------------
-- respond_to_friend_request
--
-- The requester must not be able to accept their own request. That check is the
-- entire reason this is a function and not an UPDATE policy.
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_friend_request(other_id uuid, accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  existing public.friendships%rowtype;
begin
  if me is null then raise exception 'Not signed in'; end if;

  select * into existing from public.friendships
   where user_low = least(me, other_id) and user_high = greatest(me, other_id);

  if not found then raise exception 'No request from that user'; end if;
  if existing.status = 'accepted' then
    return jsonb_build_object('status', 'already_friends');
  end if;
  if existing.requester_id = me then
    raise exception 'You cannot accept your own request';
  end if;

  if accept then
    update public.friendships set status = 'accepted', responded_at = now()
     where id = existing.id;
    perform public.push_notification(other_id, me, 'friend_accepted', '{}'::jsonb);
    return jsonb_build_object('status', 'accepted');
  end if;

  -- Declining deletes the row rather than storing a 'declined' state: it leaves
  -- no trace for the other person to see, and lets them ask again later.
  delete from public.friendships where id = existing.id;
  return jsonb_build_object('status', 'declined');
end;
$$;

-- ---------------------------------------------------------------------------
-- search_users
--
-- Exact-username-prefix search only. Deliberately not a fuzzy search over
-- display names: this is the difference between "I can find my gym partner"
-- and "strangers can browse a directory of everyone in the app".
--
-- Returns the relationship alongside each hit so the UI can render the right
-- button (Add / Pending / Friends) without a second round trip.
-- ---------------------------------------------------------------------------
create or replace function public.search_users(q text)
returns table (
  id            uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  relationship  text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    case
      when p.id = auth.uid() then 'self'
      when f.status = 'accepted' then 'friends'
      when f.status = 'pending' and f.requester_id = auth.uid() then 'requested'
      when f.status = 'pending' then 'incoming'
      else 'none'
    end as relationship
  from public.profiles p
  left join public.friendships f
    on f.user_low = least(p.id, auth.uid())
   and f.user_high = greatest(p.id, auth.uid())
  -- Two steps, both necessary. First drop anything outside the username
  -- charset, which removes '%' before it can act as a wildcard. Then escape the
  -- underscores that remain: '_' is legal in a username but is also LIKE's
  -- single-character wildcard, so "kun_a" must match only "kun_a…", never
  -- "kunna…". Stripping it instead would break every username that contains one.
  where length(regexp_replace(lower(trim(q)), '[^a-z0-9_]', '', 'g')) >= 2
    and p.username like
        replace(regexp_replace(lower(trim(q)), '[^a-z0-9_]', '', 'g'), '_', '\_') || '%'
        escape '\'
  order by p.username
  limit 20;
$$;

-- ---------------------------------------------------------------------------
-- list_friendships
--
-- One call for the whole Friends screen: accepted friends, incoming requests
-- and your own outgoing requests, each with the other person's identity and
-- their stats when you are allowed to see them.
--
-- Stats come back NULL both when you are not permitted to see them and when the
-- friend simply has not published yet — can_view_stats() is still the single
-- authority, applied here exactly as the RLS policies apply it.
-- ---------------------------------------------------------------------------
create or replace function public.list_friendships()
returns table (
  other_id       uuid,
  username       text,
  display_name   text,
  avatar_url     text,
  status         text,
  direction      text,
  created_at     timestamptz,
  streak_weeks   integer,
  total_workouts integer,
  last_workout_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    other.id,
    other.username,
    other.display_name,
    other.avatar_url,
    f.status,
    case
      when f.status = 'accepted' then 'friend'
      when f.requester_id = auth.uid() then 'outgoing'
      else 'incoming'
    end as direction,
    f.created_at,
    case when public.can_view_stats(other.id) then s.streak_weeks end,
    case when public.can_view_stats(other.id) then s.total_workouts end,
    case when public.can_view_stats(other.id) then s.last_workout_at end
  from public.friendships f
  join public.profiles other
    on other.id = case when f.user_low = auth.uid() then f.user_high else f.user_low end
  left join public.profile_stats s on s.user_id = other.id
  where auth.uid() in (f.user_low, f.user_high)
  order by (f.status = 'pending' and f.requester_id <> auth.uid()) desc, other.display_name;
$$;

-- ---------------------------------------------------------------------------
-- get_friend_profile
--
-- Everything the friend-profile and head-to-head screens need, in one call and
-- under one visibility rule. A non-friend gets identity and nulls — the same
-- answer the RLS policies would give, so there is no way to learn more by
-- calling the tables directly instead.
-- ---------------------------------------------------------------------------
create or replace function public.get_friend_profile(target_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  prof    jsonb;
  visible boolean;
begin
  if me is null then raise exception 'Not signed in'; end if;

  select to_jsonb(p) - 'share_stats' into prof
    from public.profiles p where p.id = target_id;
  if prof is null then raise exception 'No such user'; end if;

  visible := public.can_view_stats(target_id);

  return jsonb_build_object(
    'profile', prof,
    'can_view_stats', visible,
    'relationship', (
      select case
        when target_id = me then 'self'
        when f.status = 'accepted' then 'friends'
        when f.status = 'pending' and f.requester_id = me then 'requested'
        when f.status = 'pending' then 'incoming'
        else 'none'
      end
      from public.friendships f
      where f.user_low = least(me, target_id) and f.user_high = greatest(me, target_id)
    ),
    'stats', case when visible then
      (select to_jsonb(s) from public.profile_stats s where s.user_id = target_id)
    end,
    'lifts', case when visible then
      (select coalesce(jsonb_agg(to_jsonb(l) - 'user_id' order by l.top_weight_kg desc), '[]'::jsonb)
         from public.user_lifts l where l.user_id = target_id)
    end
  );
end;
$$;

grant execute on function public.send_friend_request(uuid)            to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.search_users(text)                   to authenticated;
grant execute on function public.list_friendships()                   to authenticated;
grant execute on function public.get_friend_profile(uuid)             to authenticated;
