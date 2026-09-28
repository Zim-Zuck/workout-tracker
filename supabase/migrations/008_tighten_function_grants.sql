-- Kun Workouts — 008: take EXECUTE away from PUBLIC on every app function.
--
-- Run after 007. Safe to re-run.
--
-- THE PROBLEM
-- Postgres grants EXECUTE on a new function to PUBLIC automatically. Every
-- `grant execute ... to authenticated` in migrations 001–006 was therefore
-- additive, not exclusive: it said "authenticated may call this" on top of a
-- default that already said "anyone may". Only delete_my_account() and
-- push_notification() ever revoked that default, because those two obviously
-- write. The read functions were left as they came.
--
-- WHAT THIS DOES AND DOES NOT FIX
-- Nothing was leaking. The SECURITY INVOKER readers (friends_leaderboard,
-- get_weekly_recap) resolve auth.uid() to NULL for an anonymous caller, so
-- their circle CTE matches nobody and they return empty; on top of that every
-- table policy they touch is `to authenticated`, so RLS would have filtered
-- them anyway. The SECURITY DEFINER writers all begin by raising on a null
-- auth.uid().
--
-- So this migration changes no behaviour. It changes what the safety depends
-- on. "Anonymous callers get nothing because two unrelated mechanisms both
-- happen to catch them" is a weaker claim than "anonymous callers cannot call
-- this at all", and the second one stays true if somebody later adds a
-- function that forgets its null check.
--
-- Written as its own migration rather than by editing 001–006, following the
-- same convention 004 and 005 used when they replaced delete_my_account():
-- every earlier migration stays runnable on its own.

do $$
declare
  fn text;
  targets text[] := array[
    -- Helpers (SECURITY DEFINER, read-only)
    'public.are_friends(uuid, uuid)',
    'public.can_view_stats(uuid)',
    'public.username_available(text)',
    -- Friends
    'public.send_friend_request(uuid)',
    'public.respond_to_friend_request(uuid, boolean)',
    'public.search_users(text)',
    'public.list_friendships()',
    'public.get_friend_profile(uuid)',
    -- Challenges
    'public.create_challenge(uuid, text, integer)',
    'public.respond_to_challenge(uuid, boolean)',
    'public.report_challenge_progress(uuid, numeric, integer)',
    'public.resolve_challenge(uuid)',
    'public.list_challenges()',
    'public.friends_leaderboard(text)',
    -- Weekly recap
    'public.get_weekly_recap(date)'
  ];
begin
  foreach fn in array targets loop
    -- A function missing from this database (an older deployment that has not
    -- run every migration) must not abort the rest of the loop.
    begin
      execute format('revoke all on function %s from public', fn);
      execute format('revoke all on function %s from anon', fn);
      execute format('grant execute on function %s to authenticated', fn);
    exception
      when undefined_function then
        raise notice 'Skipping %, not present in this database.', fn;
    end;
  end loop;
end;
$$;

-- delete_my_account() already revokes from PUBLIC in 001/004/005/007, and
-- push_notification() is revoked in 002 and deliberately granted to nobody —
-- it is reachable only from the other SECURITY DEFINER functions. Neither is
-- listed above, so this migration cannot accidentally hand out execute on them.

-- PostgREST caches the schema, including privileges. Without this the change
-- only takes effect on its next automatic reload.
notify pgrst, 'reload schema';
