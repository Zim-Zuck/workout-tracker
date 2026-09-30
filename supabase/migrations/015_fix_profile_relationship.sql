-- Kun Workouts — 015: get_friend_profile() could never say 'none' or 'self'.
--
-- Run after 014. Safe to re-run.
--
-- THE BUG
-- 002 built the relationship like this:
--
--   'relationship', (
--     select case
--       when target_id = me then 'self'
--       when f.status = 'accepted' then 'friends'
--       ...
--       else 'none'
--     end
--     from public.friendships f
--     where f.user_low = least(me, target_id) and ...
--   )
--
-- The entire CASE sits inside a scalar subquery over friendships. When there is
-- no friendship row — which is every stranger, and also yourself, since
-- friendships_ordered forbids a self-pair — the subquery matches nothing and
-- returns NULL. The 'none' and 'self' branches are unreachable. They have never
-- once been returned.
--
-- search_users() in the same migration gets this right, because it reaches the
-- CASE through a LEFT JOIN rather than a subquery. That is why the two functions
-- disagreed and why nobody noticed: the two callers barely overlapped.
--
-- WHY IT DID NOT MATTER UNTIL NOW
-- Until this release you could only open a profile from your friends list, your
-- friends leaderboard or the weekly recap — all of which are, by construction,
-- people you are already friends with. A stranger's profile was practically
-- unreachable, so the broken branch was practically unreachable too.
--
-- The community feed changes that completely: opening the profile of somebody
-- you have never met is now the single most common thing on the screen. With the
-- old function the UI receives NULL, matches neither 'none' nor 'friends', and
-- renders a profile with no way to add that person at all.
--
-- Replaced here rather than edited in 002, following the same convention 004,
-- 005 and 007 used for delete_my_account(): every earlier migration stays
-- runnable on its own.
--
-- Nothing else about the function changes. can_view_stats() is still the only
-- authority on the numbers, a non-friend still receives identity and nulls, and
-- the name stays get_friend_profile() so no existing caller has to move.

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
  f       public.friendships%rowtype;
  rel     text;
begin
  if me is null then raise exception 'Not signed in'; end if;

  -- The privacy switches are stripped: what someone has chosen about their own
  -- visibility is not part of their public identity. share_activity and
  -- community_notice_pending are new in 009 and would otherwise have started
  -- riding along in this payload the moment that migration ran.
  select to_jsonb(p) - 'share_stats' - 'share_activity' - 'community_notice_pending'
    into prof
    from public.profiles p
   where p.id = target_id;

  if prof is null then raise exception 'No such user'; end if;

  visible := public.can_view_stats(target_id);

  -- Branching in plpgsql rather than in a scalar subquery, so "there is no row"
  -- is a case with an answer instead of a null that swallows every branch.
  if target_id = me then
    rel := 'self';
  else
    select * into f
      from public.friendships
     where user_low = least(me, target_id)
       and user_high = greatest(me, target_id);

    if not found then
      rel := 'none';
    elsif f.status = 'accepted' then
      rel := 'friends';
    elsif f.requester_id = me then
      rel := 'requested';
    else
      rel := 'incoming';
    end if;
  end if;

  return jsonb_build_object(
    'profile', prof,
    'can_view_stats', visible,
    'relationship', rel,
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

revoke all on function public.get_friend_profile(uuid) from public;
revoke all on function public.get_friend_profile(uuid) from anon;
grant execute on function public.get_friend_profile(uuid) to authenticated;

notify pgrst, 'reload schema';
