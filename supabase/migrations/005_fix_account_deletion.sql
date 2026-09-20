-- Kun Workouts — 005: fix account deletion.
--
-- Run after 004. Safe to re-run.
--
-- 004 tried to remove the user's backup file with a plain DELETE against
-- storage.objects. Supabase blocks that:
--
--   42501: Direct deletion from storage tables is not allowed.
--          Use the Storage API instead.
--
-- The whole function aborted, so "Delete my account" deleted nothing at all and
-- the account could still sign in. Storage cleanup therefore moves to the
-- client, which calls the Storage API first and only calls this function once
-- the file is gone — see deleteMyAccount() in src/services/profileApi.js.
--
-- Ordering matters: the backup is removed BEFORE the account. If the file
-- cannot be deleted the client aborts and the account survives, because leaving
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

  -- Cascades from auth.users to profiles, profile_stats, user_lifts,
  -- friendships, challenges, challenge_progress and notifications.
  -- notifications.actor_id is ON DELETE SET NULL rather than CASCADE, so other
  -- people keep their history — it just stops naming someone who no longer exists.
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
