-- Kun Workouts — 009: share_activity, the community visibility switch.
--
-- Run after 008. Safe to re-run.
--
-- TWO SWITCHES, TWO DIFFERENT PROMISES
-- share_stats (001) means "people I have accepted as friends may see my
-- numbers": lifetime volume, every top lift, the full weekly breakdown, the
-- head-to-head. That promise is unchanged by this migration and by every
-- migration after it. can_view_stats() is not touched.
--
-- share_activity means "the rest of Kun may see that I am training": my workout
-- count, my streak, my workouts this week, and the milestone events the
-- community feed is made of. It is a deliberately much smaller window than the
-- one share_stats opens, and it opens onto a much larger room.
--
-- Keeping them separate is the point. Merging them would force a user to choose
-- between "my friends see nothing" and "everyone sees everything", which is
-- exactly the choice this product should not make people make.
--
-- THE BACKFILL, AND WHY IT IS NOT JUST A DEFAULT
-- `add column ... default true` fills every existing row with true. That would
-- silently move every current user from "shared with friends I accepted" to
-- "visible to the whole app", which is not a decision this migration gets to
-- make on their behalf.
--
-- So the column is added with default true — new accounts join the community,
-- which is the whole point of the change — and then every row that existed
-- before this migration is set to its owner's share_stats value. Someone who
-- had already turned stat sharing off plainly does not want community
-- visibility either. Someone who had left it on had already chosen to share
-- fitness information with people, and what the community sees is a strict
-- subset of what those people could already see.
--
-- That inference is defensible but it is still an inference, so it is paired
-- with community_notice_pending below: every pre-existing account is told, in
-- the app, what changed and where the switch is.

-- Wrapped in a guard rather than written as a bare ALTER: the backfill must run
-- exactly once, on the migration that introduces the column. Re-running this
-- file must never reset a choice a user has since made for themselves.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'profiles'
       and column_name  = 'share_activity'
  ) then
    alter table public.profiles
      add column share_activity boolean not null default true;

    update public.profiles set share_activity = share_stats;
  end if;
end;
$$;

-- Set for every account that existed before share_activity did, cleared the
-- first time that person opens the community settings. Default false, so an
-- account created after this migration never sees a notice about a change it
-- was never subject to.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'profiles'
       and column_name  = 'community_notice_pending'
  ) then
    alter table public.profiles
      add column community_notice_pending boolean not null default false;

    update public.profiles set community_notice_pending = true;
  end if;
end;
$$;

-- Both columns are written by the owner through the existing
-- profiles_update_own policy (001). No new policy is needed and none is added:
-- widening who may write to profiles is not part of this change.

-- Read by every community projection added in 010–014, always as
-- `where p.share_activity`, on tables with thousands of rows at most. The index
-- is cheap and keeps those filters from degrading into sequential scans as the
-- user base grows.
create index if not exists profiles_share_activity_idx
  on public.profiles (id) where share_activity;

notify pgrst, 'reload schema';
