-- Kun Workouts — 012: reading the community feed.
--
-- Run after 011. Safe to re-run.
--
-- WHY THESE ARE SECURITY DEFINER, AND WHY THAT IS SAFE HERE
-- Unlike friends_leaderboard() (003) and get_weekly_recap() (006), which are
-- deliberately SECURITY INVOKER so that RLS filters them, the two functions below
-- are DEFINER. The reason is narrow and worth being precise about: they need to
-- read the caller's own reaction rows joined against events by other people, and
-- they need to do it in one query rather than one per row.
--
-- What makes that acceptable is what they touch. Between them these functions
-- read exactly three tables:
--
--   community_events  — already readable by every signed-in user, for any actor
--                       with share_activity on. The DEFINER version applies that
--                       same condition by hand (`where p.share_activity`), so it
--                       returns nothing the RLS policy in 010 would have hidden.
--   profiles          — readable by every signed-in user since 001.
--   event_reactions   — read only for the caller's own user_id, plus the
--                       denormalised count already stored on the event.
--
-- They never touch profile_stats, user_lifts, weekly_stats,
-- weekly_exercise_stats or challenges. can_view_stats() is not consulted because
-- nothing here is behind it. That is the property to preserve if these are ever
-- edited: the moment one of these functions needs a gated table, it is the wrong
-- function for the job.
--
-- Every column is listed by name. No `select *` anywhere, and no `to_jsonb(e)` on
-- a bare table row — a column added to community_events later must not
-- silently start appearing in a feed payload.

-- ---------------------------------------------------------------------------
-- get_community_feed
--
-- One round trip per page: events, their actors' identities, the caller's own
-- reaction, and the next cursor.
--
-- Paged by keyset, not offset. `(created_at, id) < (cursor)` against the
-- (created_at desc, id desc) index is exact and stays exact while people are
-- training: new events arriving at the head of the feed cannot make page two
-- repeat or skip a row, which is precisely what OFFSET would do.
--
-- `scope` is here on day one, with 'friends' alongside 'global', because it is
-- the concrete form of the architectural claim this whole change rests on —
-- friendship is a filter over the community, not the gate in front of it. It
-- costs six lines now and would cost a rewrite later.
-- ---------------------------------------------------------------------------
create or replace function public.get_community_feed(
  scope             text        default 'global',
  cursor_created_at timestamptz default null,
  cursor_id         bigint      default null,
  page_size         integer     default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  lim       integer;
  -- Not named `rows` or `cursor`: both are plpgsql keywords, and a local called
  -- `cursor` in particular collides with cursor declaration syntax.
  feed_rows jsonb;
  next_cur  jsonb := null;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if scope is null or scope not in ('global', 'friends') then
    raise exception 'Unknown feed scope';
  end if;

  -- Clamped rather than validated: a client asking for 5000 rows gets 50, which
  -- is a better outcome than an error it has to handle.
  lim := least(greatest(coalesce(page_size, 20), 1), 50);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc, t.id desc), '[]'::jsonb)
    into feed_rows
    from (
      select
        e.id,
        e.actor_id,
        e.event_type,
        e.subject,
        e.reference_id,
        e.metadata,
        e.reaction_count,
        e.created_at,
        p.username        as actor_username,
        p.display_name    as actor_display_name,
        p.avatar_url      as actor_avatar_url,
        (e.actor_id = me) as is_me,
        r.kind            as my_reaction
      from public.community_events e
      join public.profiles p
        on p.id = e.actor_id
      left join public.event_reactions r
        on r.event_id = e.id and r.user_id = me
      where p.share_activity
        and (
          scope = 'global'
          -- Your own activity always belongs in your friends feed, or a user
          -- with no friends yet would find it empty rather than merely quiet.
          or e.actor_id = me
          or public.are_friends(me, e.actor_id)
        )
        and (
          cursor_created_at is null
          or cursor_id is null
          or (e.created_at, e.id) < (cursor_created_at, cursor_id)
        )
      order by e.created_at desc, e.id desc
      limit lim
    ) t;

  -- A full page implies there may be another. A short page is the end, and
  -- returning no cursor is how the client knows to stop asking.
  if jsonb_array_length(feed_rows) = lim then
    next_cur := jsonb_build_object(
      'created_at', feed_rows -> (lim - 1) -> 'created_at',
      'id',         feed_rows -> (lim - 1) -> 'id'
    );
  end if;

  return jsonb_build_object(
    'scope',       scope,
    'events',      feed_rows,
    'next_cursor', next_cur
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_user_activity
--
-- One person's recent events, for their profile. Same three tables, same
-- consent condition, same explicit column list.
--
-- Your own activity is visible to you even with share_activity off. Hiding a
-- person's own history from them to enforce a switch about what OTHER people see
-- would be a bug dressed as a privacy feature — and it is what makes the
-- settings screen able to show "this is what the community would see".
-- ---------------------------------------------------------------------------
create or replace function public.get_user_activity(
  target_id uuid,
  page_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  lim integer;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if target_id is null then raise exception 'No user given'; end if;

  lim := least(greatest(coalesce(page_size, 10), 1), 50);

  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at desc, t.id desc)
      from (
        select
          e.id,
          e.actor_id,
          e.event_type,
          e.subject,
          e.reference_id,
          e.metadata,
          e.reaction_count,
          e.created_at,
          p.username     as actor_username,
          p.display_name as actor_display_name,
          p.avatar_url   as actor_avatar_url,
          (e.actor_id = me) as is_me,
          r.kind         as my_reaction
        from public.community_events e
        join public.profiles p
          on p.id = e.actor_id
        left join public.event_reactions r
          on r.event_id = e.id and r.user_id = me
        where e.actor_id = target_id
          and (p.share_activity or e.actor_id = me)
        order by e.created_at desc, e.id desc
        limit lim
      ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_community_feed(text, timestamptz, bigint, integer) from public;
revoke all on function public.get_community_feed(text, timestamptz, bigint, integer) from anon;
grant execute on function public.get_community_feed(text, timestamptz, bigint, integer) to authenticated;

revoke all on function public.get_user_activity(uuid, integer) from public;
revoke all on function public.get_user_activity(uuid, integer) from anon;
grant execute on function public.get_user_activity(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
