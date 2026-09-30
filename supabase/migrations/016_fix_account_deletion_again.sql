-- Kun Workouts — 016: account deletion has been broken since 007.
--
-- Run after 015. Safe to re-run.
--
-- THE BUG, AND ITS HISTORY
-- 004 added a `delete from storage.objects` to delete_my_account() so that
-- removing an account took its backup file with it. Supabase forbids that:
--
--   42501: Direct deletion from storage tables is not allowed.
--          Use the Storage API instead.
--
-- 005 diagnosed exactly that, removed the statement, and moved storage cleanup
-- to the client — deleteMyAccount() in src/services/profileApi.js calls the
-- Storage API first and only calls this function once the file is gone. Its
-- comment says so in full.
--
-- 007 then added profile pictures, and — reaching for the same idea a second
-- time — reinstated the statement, widened to two buckets:
--
--   delete from storage.objects
--    where bucket_id in ('backups', 'avatars') ...
--
-- which reintroduced the identical failure that 005 had already fixed and
-- documented three migrations earlier. The whole function aborts on that first
-- statement, so `delete from auth.users` is never reached.
--
-- The effect since 007: "Delete my account" does nothing at all. It raises
-- 42501, the client shows an error, and the account keeps working. Nobody has
-- been able to delete their account since that migration ran.
--
-- THE FIX
-- Go back to what 005 established, which was right: no storage deletes in SQL.
-- The client removes the user's files through the Storage API, as the user,
-- before calling this. profileApi.js is updated alongside this migration to
-- remove the avatar as well as the backup — 007's only real addition was
-- noticing that avatars need cleaning up too, and that part was correct.
--
-- Ordering still matters, and still for 005's reason: files go first. If a file
-- cannot be removed the client aborts and the account survives, because leaving
-- someone's training data in a bucket after they asked to be deleted is a worse
-- failure than a deletion they can retry.

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

  -- NO storage.objects DELETE HERE. Supabase rejects it and the rejection takes
  -- the whole function with it. Storage cleanup belongs to the client, which
  -- runs before this call. See the history above before adding one back.
  --
  -- Cascades from auth.users to profiles, profile_stats, user_lifts,
  -- friendships, challenges, challenge_progress, notifications, weekly_stats,
  -- weekly_exercise_stats, community_events and event_reactions.
  -- notifications.actor_id is ON DELETE SET NULL rather than CASCADE, so other
  -- people keep their history — it just stops naming someone who no longer exists.
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
