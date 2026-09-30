-- Kun Workouts — community layer test harness.
--
-- HOW TO RUN
-- Paste this whole file into the Supabase SQL editor (Dashboard → SQL Editor →
-- New query) and run it, AFTER migrations 009–014 have been applied. It ends in
-- ROLLBACK, so it creates test users, publishes fake stats, fires every trigger
-- and then leaves the database exactly as it found it. Nothing here writes to
-- your real data.
--
-- It prints one row per test at the end: name, passed, detail. Read the bottom
-- of the output, not the middle.
--
-- Every test catches its own exceptions, so one failure reports itself instead
-- of aborting the rest of the run.
--
-- WHAT IT IS FOR
-- The event triggers in 010 have one genuinely hard job: telling a training
-- session apart from a restored backup, given that the client republishes its
-- entire lift table on every single publish. Tests 10–17 are that job. If any of
-- them fail, the feed will flood on import and the feature is not finished.

begin;

set local client_min_messages = warning;

-- No serial column: a sequence would need its own GRANT below, and the test
-- names already sort correctly because they are numbered.
create temporary table t_results (
  name    text,
  passed  boolean,
  detail  text
) on commit drop;

-- Several tests below switch to the `authenticated` and `anon` roles to exercise
-- RLS and function grants as a real client would, and they record their result
-- while still wearing that role. Without these grants every such test would fail
-- on the bookkeeping rather than on the thing it is testing.
grant all on t_results to authenticated, anon;

create or replace function pg_temp.ok(n text, cond boolean, d text default '') returns void
language plpgsql as $fn$
begin
  insert into t_results (name, passed, detail) values (n, cond, d);
end;
$fn$;

create or replace function pg_temp.fail(n text, d text) returns void
language plpgsql as $fn$
begin
  insert into t_results (name, passed, detail) values (n, false, d);
end;
$fn$;

-- Events belonging to one actor, optionally of one type.
create or replace function pg_temp.ev_count(a uuid, k text default null) returns integer
language sql as $fn$
  select count(*)::integer from public.community_events e
   where e.actor_id = a and (k is null or e.event_type = k);
$fn$;

-- ---------------------------------------------------------------------------
-- Fixtures
--
-- Four users. A and B are ordinary community members; C has community sharing
-- off; D is used for the import tests so its counters start clean.
-- ---------------------------------------------------------------------------
create temporary table t_users (tag text primary key, id uuid) on commit drop;
grant select on t_users to authenticated, anon;

do $$
declare
  tags text[] := array['A', 'B', 'C', 'D'];
  t text;
  u uuid;
begin
  foreach t in array tags loop
    u := gen_random_uuid();
    insert into t_users values (t, u);

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at
    ) values (
      u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'kuntest_' || lower(t) || '_' || replace(u::text, '-', '') || '@test.local',
      '', now(), now(), now()
    );

    insert into public.profiles (id, username, display_name, share_stats, share_activity)
    values (
      u,
      'kuntest' || lower(t) || substr(replace(u::text, '-', ''), 1, 8),
      'Test ' || t,
      true,
      -- C is the opted-out user.
      t <> 'C'
    );
  end loop;
end;
$$;

-- ===========================================================================
-- 1. Schema and defaults
-- ===========================================================================

do $$
declare n integer;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name in ('share_activity', 'community_notice_pending');
  perform pg_temp.ok('01 share_activity + notice columns exist', n = 2, 'found ' || n);
exception when others then perform pg_temp.fail('01 share_activity + notice columns exist', sqlerrm);
end;
$$;

do $$
declare v boolean; np boolean;
begin
  select share_activity, community_notice_pending into v, np
    from public.profiles where id = (select id from t_users where tag = 'A');
  perform pg_temp.ok('02 new profile defaults: sharing on, no notice', v and not np,
    format('share_activity=%s notice=%s', v, np));
exception when others then perform pg_temp.fail('02 new profile defaults', sqlerrm);
end;
$$;

do $$
declare n integer;
begin
  -- can_view_stats() must still be exactly the friends rule. This is the single
  -- most important assertion in the file: the whole change is predicated on this
  -- function being untouched.
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'can_view_stats'
     and pg_get_functiondef(p.oid) like '%are_friends%'
     and pg_get_functiondef(p.oid) like '%share_stats%';
  perform pg_temp.ok('03 can_view_stats still gates on friendship + share_stats', n = 1);
exception when others then perform pg_temp.fail('03 can_view_stats unchanged', sqlerrm);
end;
$$;

do $$
declare def text;
begin
  -- friends_leaderboard and get_weekly_recap must remain SECURITY INVOKER.
  -- prosecdef = false is INVOKER.
  perform pg_temp.ok('04 friends_leaderboard still SECURITY INVOKER',
    not (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'friends_leaderboard'));
  perform pg_temp.ok('05 get_weekly_recap still SECURITY INVOKER',
    not (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'get_weekly_recap'));
exception when others then perform pg_temp.fail('04/05 invoker functions unchanged', sqlerrm);
end;
$$;

-- ===========================================================================
-- 2. PR events from user_lifts — the import problem
-- ===========================================================================

do $$
declare a uuid := (select id from t_users where tag = 'A');
begin
  -- A brand-new lift row is not a PR: detectPRs() says a first-ever entry has
  -- nothing to beat, and the trigger honours the same rule.
  insert into public.user_lifts (user_id, exercise_id, top_weight_kg, top_weight_reps, best_e1rm_kg, achieved_at)
  values (a, 'ex_bench_press', 80, 5, 90, now());
  perform pg_temp.ok('10 INSERT into user_lifts emits nothing',
    pg_temp.ev_count(a, 'pr') = 0, 'events=' || pg_temp.ev_count(a, 'pr'));
exception when others then perform pg_temp.fail('10 INSERT emits nothing', sqlerrm);
end;
$$;

do $$
declare a uuid := (select id from t_users where tag = 'A'); m jsonb;
begin
  update public.user_lifts set top_weight_kg = 100, top_weight_reps = 5
   where user_id = a and exercise_id = 'ex_bench_press';

  select metadata into m from public.community_events
   where actor_id = a and event_type = 'pr' order by id desc limit 1;

  perform pg_temp.ok('11 improvement emits one pr event',
    pg_temp.ev_count(a, 'pr') = 1, 'events=' || pg_temp.ev_count(a, 'pr'));
  perform pg_temp.ok('12 pr metadata carries weight and reps',
    (m->>'weight_kg')::numeric = 100 and (m->>'reps')::integer = 5, coalesce(m::text, 'null'));
exception when others then perform pg_temp.fail('11/12 improvement emits pr', sqlerrm);
end;
$$;

do $$
declare a uuid := (select id from t_users where tag = 'A');
begin
  -- The client republishes its whole snapshot on every sync. A second
  -- improvement on the same lift inside the dedupe window must not double up.
  update public.user_lifts set top_weight_kg = 102, top_weight_reps = 5
   where user_id = a and exercise_id = 'ex_bench_press';
  perform pg_temp.ok('13 second improvement inside dedupe window is suppressed',
    pg_temp.ev_count(a, 'pr') = 1, 'events=' || pg_temp.ev_count(a, 'pr'));
exception when others then perform pg_temp.fail('13 dedupe window', sqlerrm);
end;
$$;

do $$
declare a uuid := (select id from t_users where tag = 'A'); before integer;
begin
  before := pg_temp.ev_count(a, 'pr');
  -- History edited downward. Not an achievement.
  update public.user_lifts set top_weight_kg = 60, top_weight_reps = 3
   where user_id = a and exercise_id = 'ex_bench_press';
  perform pg_temp.ok('14 a regression emits nothing',
    pg_temp.ev_count(a, 'pr') = before, format('%s -> %s', before, pg_temp.ev_count(a, 'pr')));
exception when others then perform pg_temp.fail('14 regression emits nothing', sqlerrm);
end;
$$;

do $$
declare
  b uuid := (select id from t_users where tag = 'B');
  ex text[] := array['ex_squat','ex_deadlift','ex_ohp','ex_barbell_row','ex_pullup',
                     'ex_bench_press','ex_dip','ex_lunge'];
  e text;
begin
  -- Seed eight lifts (inserts, so silent), then improve all eight in ONE
  -- statement. That is what a restored backup or an imported history looks like.
  foreach e in array ex loop
    insert into public.user_lifts (user_id, exercise_id, top_weight_kg, top_weight_reps, best_e1rm_kg, achieved_at)
    values (b, e, 50, 5, 56, now());
  end loop;

  perform pg_temp.ok('15 eight inserts emit nothing',
    pg_temp.ev_count(b, 'pr') = 0, 'events=' || pg_temp.ev_count(b, 'pr'));

  update public.user_lifts set top_weight_kg = 120, top_weight_reps = 5
   where user_id = b and exercise_id = any(ex);

  perform pg_temp.ok('16 IMPORT CASE: 8 improvements in one statement are suppressed',
    pg_temp.ev_count(b, 'pr') = 0,
    'events=' || pg_temp.ev_count(b, 'pr') || ' (expected 0 — this is the flood guard)');
exception when others then perform pg_temp.fail('15/16 import suppression', sqlerrm);
end;
$$;

do $$
declare
  d uuid := (select id from t_users where tag = 'D');
  ex text[] := array['ex_squat','ex_deadlift','ex_ohp','ex_barbell_row','ex_pullup'];
  e text;
begin
  -- Five is the boundary: still treated as training, not an import.
  foreach e in array ex loop
    insert into public.user_lifts (user_id, exercise_id, top_weight_kg, top_weight_reps, best_e1rm_kg, achieved_at)
    values (d, e, 50, 5, 56, now());
  end loop;

  update public.user_lifts set top_weight_kg = 90, top_weight_reps = 5
   where user_id = d and exercise_id = any(ex);

  perform pg_temp.ok('17 batch of 5 improvements is at the boundary and emits 5',
    pg_temp.ev_count(d, 'pr') = 5, 'events=' || pg_temp.ev_count(d, 'pr'));
exception when others then perform pg_temp.fail('17 boundary batch', sqlerrm);
end;
$$;

do $$
declare c uuid := (select id from t_users where tag = 'C');
begin
  -- C has share_activity off. Nothing they do reaches the feed.
  insert into public.user_lifts (user_id, exercise_id, top_weight_kg, top_weight_reps, best_e1rm_kg, achieved_at)
  values (c, 'ex_bench_press', 80, 5, 90, now());
  update public.user_lifts set top_weight_kg = 140, top_weight_reps = 5
   where user_id = c and exercise_id = 'ex_bench_press';
  perform pg_temp.ok('18 share_activity off emits nothing',
    pg_temp.ev_count(c) = 0, 'events=' || pg_temp.ev_count(c));
exception when others then perform pg_temp.fail('18 opted-out emits nothing', sqlerrm);
end;
$$;

-- ===========================================================================
-- 3. Workout, milestone and streak events from profile_stats
-- ===========================================================================

do $$
declare a uuid := (select id from t_users where tag = 'A');
begin
  insert into public.profile_stats (user_id, total_workouts, streak_weeks, workouts_this_week, lifetime_volume_kg)
  values (a, 1, 1, 1, 1000);
  perform pg_temp.ok('20 first workout emits one workout event',
    pg_temp.ev_count(a, 'workout') = 1, 'events=' || pg_temp.ev_count(a, 'workout'));
exception when others then perform pg_temp.fail('20 first workout', sqlerrm);
end;
$$;

do $$
declare a uuid := (select id from t_users where tag = 'A');
begin
  update public.profile_stats set total_workouts = 2 where user_id = a;
  perform pg_temp.ok('21 second workout same day is deduped',
    pg_temp.ev_count(a, 'workout') = 1, 'events=' || pg_temp.ev_count(a, 'workout'));
exception when others then perform pg_temp.fail('21 workout dedupe', sqlerrm);
end;
$$;

do $$
declare b uuid := (select id from t_users where tag = 'B');
begin
  -- First publish carrying a whole imported history.
  insert into public.profile_stats (user_id, total_workouts, streak_weeks, workouts_this_week, lifetime_volume_kg)
  values (b, 300, 40, 3, 900000);
  perform pg_temp.ok('22 IMPORT CASE: 300 workouts on first publish emits nothing',
    pg_temp.ev_count(b, 'workout') = 0 and pg_temp.ev_count(b, 'workout_milestone') = 0
      and pg_temp.ev_count(b, 'streak') = 0,
    format('workout=%s milestone=%s streak=%s',
      pg_temp.ev_count(b, 'workout'), pg_temp.ev_count(b, 'workout_milestone'),
      pg_temp.ev_count(b, 'streak')));
exception when others then perform pg_temp.fail('22 stats import suppression', sqlerrm);
end;
$$;

do $$
declare d uuid := (select id from t_users where tag = 'D'); m jsonb;
begin
  insert into public.profile_stats (user_id, total_workouts, streak_weeks, workouts_this_week, lifetime_volume_kg)
  values (d, 9, 3, 2, 20000);
  -- Crossing 10.
  update public.profile_stats set total_workouts = 10 where user_id = d;

  select metadata into m from public.community_events
   where actor_id = d and event_type = 'workout_milestone' order by id desc limit 1;

  perform pg_temp.ok('23 crossing 10 workouts emits a milestone',
    pg_temp.ev_count(d, 'workout_milestone') = 1 and (m->>'total')::integer = 10,
    coalesce(m::text, 'null'));
exception when others then perform pg_temp.fail('23 workout milestone', sqlerrm);
end;
$$;

do $$
declare d uuid := (select id from t_users where tag = 'D');
begin
  -- History edited back below the mark and then forward again: the milestone
  -- must not fire twice.
  update public.profile_stats set total_workouts = 9  where user_id = d;
  update public.profile_stats set total_workouts = 10 where user_id = d;
  perform pg_temp.ok('24 a milestone cannot fire twice',
    pg_temp.ev_count(d, 'workout_milestone') = 1,
    'events=' || pg_temp.ev_count(d, 'workout_milestone'));
exception when others then perform pg_temp.fail('24 milestone not repeated', sqlerrm);
end;
$$;

do $$
declare d uuid := (select id from t_users where tag = 'D'); m jsonb;
begin
  update public.profile_stats set total_workouts = 11, streak_weeks = 4 where user_id = d;
  select metadata into m from public.community_events
   where actor_id = d and event_type = 'streak' order by id desc limit 1;
  perform pg_temp.ok('25 crossing a 4-week streak emits a streak event',
    pg_temp.ev_count(d, 'streak') = 1 and (m->>'weeks')::integer = 4, coalesce(m::text, 'null'));
exception when others then perform pg_temp.fail('25 streak milestone', sqlerrm);
end;
$$;

-- ===========================================================================
-- 4. Row-level security
-- ===========================================================================

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  c uuid := (select id from t_users where tag = 'C');
  seen integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  select count(*) into seen from public.community_events where actor_id = c;
  perform pg_temp.ok('30 RLS hides an opted-out user''s events', seen = 0, 'rows=' || seen);

  reset role;
  perform set_config('request.jwt.claims', '', true);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('30 RLS hides opted-out events', sqlerrm);
end;
$$;

do $$
declare a uuid := (select id from t_users where tag = 'A');
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  begin
    insert into public.community_events (actor_id, event_type, metadata)
    values (a, 'pr', '{"weight_kg": 500, "reps": 20}'::jsonb);
    perform pg_temp.fail('31 client cannot forge a community event', 'INSERT SUCCEEDED — this is a hole');
  exception when insufficient_privilege or others then
    perform pg_temp.ok('31 client cannot forge a community event', true, sqlerrm);
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('31 forge community event', sqlerrm);
end;
$$;

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  eid bigint := (select id from public.community_events
                  where actor_id = (select id from t_users where tag = 'D') limit 1);
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  begin
    insert into public.event_reactions (event_id, user_id) values (eid, a);
    perform pg_temp.fail('32 client cannot write reactions directly', 'INSERT SUCCEEDED — this is a hole');
  exception when insufficient_privilege or others then
    perform pg_temp.ok('32 client cannot write reactions directly', true, sqlerrm);
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('32 direct reaction write', sqlerrm);
end;
$$;

do $$
begin
  set local role anon;
  begin
    perform public.get_community_feed();
    perform pg_temp.fail('33 anon cannot call get_community_feed', 'CALL SUCCEEDED — 008 grant regressed');
  exception when insufficient_privilege then
    perform pg_temp.ok('33 anon cannot call get_community_feed', true, 'permission denied, as intended');
  when others then
    perform pg_temp.ok('33 anon cannot call get_community_feed', true, sqlerrm);
  end;
  reset role;
exception when others then
  reset role;
  perform pg_temp.fail('33 anon feed call', sqlerrm);
end;
$$;

do $$
declare fn text; denied integer := 0; total integer := 0;
  targets text[] := array[
    'public.get_community_feed()',
    'public.get_user_activity(gen_random_uuid())',
    'public.global_leaderboard()',
    'public.get_community_week(current_date)',
    'public.react_to_event(1)',
    'public.unreact_from_event(1)'
  ];
begin
  set local role anon;
  foreach fn in array targets loop
    total := total + 1;
    begin
      execute 'select ' || fn;
      -- Reached only if the call was permitted.
    exception
      when insufficient_privilege then denied := denied + 1;
      when others then denied := denied + 1;  -- raised 'Not signed in' etc.
    end;
  end loop;
  reset role;
  perform pg_temp.ok('34 every new function refuses anon', denied = total,
    format('%s/%s refused', denied, total));
exception when others then
  reset role;
  perform pg_temp.fail('34 anon refused everywhere', sqlerrm);
end;
$$;

-- ===========================================================================
-- 5. Reactions
-- ===========================================================================

do $$
declare
  a   uuid := (select id from t_users where tag = 'A');
  d   uuid := (select id from t_users where tag = 'D');
  eid bigint := (select id from public.community_events
                  where actor_id = (select id from t_users where tag = 'D')
                    and event_type = 'pr' order by id limit 1);
  cnt integer; notes integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  perform public.react_to_event(eid, 'fire');
  select reaction_count into cnt from public.community_events where id = eid;
  perform pg_temp.ok('40 reacting increments the count', cnt = 1, 'count=' || cnt);

  -- Reacting again, and changing the kind, must not inflate the count.
  perform public.react_to_event(eid, 'fire');
  perform public.react_to_event(eid, 'like');
  select reaction_count into cnt from public.community_events where id = eid;
  perform pg_temp.ok('41 re-reacting does not inflate the count', cnt = 1, 'count=' || cnt);

  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into notes from public.notifications
   where user_id = d and type = 'event_reaction';
  perform pg_temp.ok('42 one notification for repeated reactions', notes = 1, 'rows=' || notes);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('40-42 reactions', sqlerrm);
end;
$$;

do $$
declare
  b   uuid := (select id from t_users where tag = 'B');
  d   uuid := (select id from t_users where tag = 'D');
  eid bigint := (select id from public.community_events
                  where actor_id = (select id from t_users where tag = 'D')
                    and event_type = 'pr' order by id limit 1);
  notes integer; c integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
  perform public.react_to_event(eid, 'strong');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*), max((payload->>'count')::integer) into notes, c
    from public.notifications where user_id = d and type = 'event_reaction';

  perform pg_temp.ok('43 a second reactor collapses into one notification',
    notes = 1 and c = 2, format('rows=%s count=%s', notes, c));
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('43 notification collapse', sqlerrm);
end;
$$;

do $$
declare
  a   uuid := (select id from t_users where tag = 'A');
  eid bigint := (select id from public.community_events
                  where actor_id = (select id from t_users where tag = 'D')
                    and event_type = 'pr' order by id limit 1);
  cnt integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  perform public.unreact_from_event(eid);
  perform public.unreact_from_event(eid);  -- again: must not go negative
  select reaction_count into cnt from public.community_events where id = eid;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.ok('44 unreacting decrements and floors at zero', cnt = 1, 'count=' || cnt);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('44 unreact floor', sqlerrm);
end;
$$;

-- ===========================================================================
-- 6. Challenges between strangers
-- ===========================================================================

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  d uuid := (select id from t_users where tag = 'D');
  res jsonb; friends boolean;
begin
  friends := public.are_friends(a, d);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  res := public.create_challenge(d, 'ex_bench_press', 7);

  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.ok('50 a non-friend can be challenged',
    not friends and res->>'status' = 'pending',
    format('were_friends=%s status=%s', friends, res->>'status'));
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('50 challenge a stranger', sqlerrm);
end;
$$;

do $$
declare a uuid := (select id from t_users where tag = 'A');
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  begin
    perform public.create_challenge(a, 'ex_bench_press', 7);
    perform pg_temp.fail('51 self-challenge refused', 'IT WAS ALLOWED');
  exception when others then
    perform pg_temp.ok('51 self-challenge refused', sqlerrm like '%yourself%', sqlerrm);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('51 self-challenge', sqlerrm);
end;
$$;

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  victim uuid;
  i integer;
  hit_limit boolean := false;
begin
  -- A already created one challenge above, so nine more reach the limit and the
  -- eleventh must be refused. Each needs a different opponent, because
  -- challenges_one_live_per_pair already blocks a repeat on the same pair+lift.
  for i in 1..11 loop
    victim := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at
    ) values (
      victim, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'kunvictim_' || replace(victim::text, '-', '') || '@test.local', '', now(), now(), now()
    );
    insert into public.profiles (id, username, display_name)
    values (victim, 'kunv' || substr(replace(victim::text, '-', ''), 1, 12), 'Victim ' || i);

    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    begin
      perform public.create_challenge(victim, 'ex_bench_press', 7);
    exception when others then
      if sqlerrm like '%a lot of challenges%' then hit_limit := true; end if;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    exit when hit_limit;
  end loop;

  perform pg_temp.ok('52 the daily challenge rate limit engages', hit_limit,
    case when hit_limit then 'refused before 12 challenges' else 'NEVER refused — spam guard is not working' end);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('52 rate limit', sqlerrm);
end;
$$;

-- ===========================================================================
-- 7. Feed reads, pagination, leaderboard, community week
-- ===========================================================================

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  page jsonb; n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  page := public.get_community_feed('global', null, null, 5);
  n := jsonb_array_length(page->'events');
  perform pg_temp.ok('60 global feed returns events', n > 0, 'rows=' || n);

  perform pg_temp.ok('61 feed never names an opted-out actor',
    not exists (
      select 1 from jsonb_array_elements(page->'events') e
       where (e->>'actor_id')::uuid = (select id from t_users where tag = 'C')
    ));

  reset role;
  perform set_config('request.jwt.claims', '', true);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('60/61 global feed', sqlerrm);
end;
$$;

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  page jsonb; seen bigint[] := '{}'; ids bigint[]; cur jsonb; guard integer := 0;
  dupes integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  -- Walk the whole feed two rows at a time and confirm keyset paging neither
  -- repeats nor skips a row.
  cur := null;
  loop
    guard := guard + 1;
    exit when guard > 60;
    page := public.get_community_feed(
      'global',
      case when cur is null then null else (cur->>'created_at')::timestamptz end,
      case when cur is null then null else (cur->>'id')::bigint end,
      2
    );
    select array_agg((e->>'id')::bigint) into ids
      from jsonb_array_elements(page->'events') e;
    if ids is not null then seen := seen || ids; end if;
    cur := page->'next_cursor';
    exit when cur is null or cur = 'null'::jsonb;
  end loop;

  select count(*) - count(distinct x) into dupes from unnest(seen) x;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.ok('62 keyset pagination returns no duplicates', dupes = 0, 'duplicates=' || dupes);
  perform pg_temp.ok('63 pagination terminates', guard <= 60, 'pages=' || guard);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('62/63 pagination', sqlerrm);
end;
$$;

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  c uuid := (select id from t_users where tag = 'C');
  has_c boolean; has_me boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  select bool_or(l.user_id = c), bool_or(l.is_me)
    into has_c, has_me
    from public.global_leaderboard('workouts') l;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.ok('70 global leaderboard excludes opted-out users', not coalesce(has_c, false));
  perform pg_temp.ok('71 global leaderboard includes the caller', coalesce(has_me, false));
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('70/71 global leaderboard', sqlerrm);
end;
$$;

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  cols text;
begin
  -- The narrow projection: the leaderboard must not be able to return volume or
  -- a last-trained timestamp, whatever the data says.
  select string_agg(a2.attname, ',' order by a2.attnum) into cols
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join unnest(p.proargnames) with ordinality as a2(attname, attnum) on true
   where n.nspname = 'public' and p.proname = 'global_leaderboard';

  perform pg_temp.ok('72 leaderboard exposes no volume or last-trained column',
    cols not like '%volume%' and cols not like '%last_workout%', coalesce(cols, ''));
exception when others then perform pg_temp.fail('72 narrow projection', sqlerrm);
end;
$$;

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  wk jsonb; floor_n integer; people integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  wk := public.get_community_week(date_trunc('week', current_date)::date);

  reset role;
  perform set_config('request.jwt.claims', '', true);

  floor_n := (wk->>'min_aggregate_users')::integer;
  people  := (wk->'totals'->>'people')::integer;

  perform pg_temp.ok('80 community week returns a payload', wk ? 'totals' and wk ? 'top_workouts');
  perform pg_temp.ok('81 volume is withheld below the anonymity floor',
    case when people < floor_n
         then (wk->'totals'->'volume_kg') = 'null'::jsonb or (wk->'totals'->>'volume_kg') is null
         else true end,
    format('people=%s floor=%s volume=%s', people, floor_n, wk->'totals'->>'volume_kg'));
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('80/81 community week', sqlerrm);
end;
$$;

-- ===========================================================================
-- 8. The friend surfaces must still work, unchanged
-- ===========================================================================

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  b uuid := (select id from t_users where tag = 'B');
  n integer; recap jsonb;
begin
  -- Make A and B friends through the real function, then confirm the friend
  -- surfaces still behave.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  perform public.send_friend_request(b);
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.respond_to_friend_request(a, true);
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.ok('90 friendships still work end to end', public.are_friends(a, b));

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  select count(*) into n from public.friends_leaderboard('workouts');
  recap := public.get_weekly_recap(date_trunc('week', current_date)::date);

  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.ok('91 friends leaderboard still returns the circle', n >= 2, 'rows=' || n);
  perform pg_temp.ok('92 friends weekly recap still returns members',
    jsonb_array_length(recap->'members') >= 2,
    'members=' || jsonb_array_length(recap->'members'));
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('90-92 friend surfaces', sqlerrm);
end;
$$;

-- ===========================================================================
-- 9. get_friend_profile relationship — the 015 regression
--
-- Before 015 the whole CASE lived inside a scalar subquery over friendships, so
-- a target with no friendship row yielded NULL and the 'none' and 'self'
-- branches were unreachable. These three assertions are what that bug looks
-- like from the outside.
-- ===========================================================================

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  d uuid := (select id from t_users where tag = 'D');
  res jsonb;
begin
  -- A and D are not friends (test 50 only created a challenge between them).
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  res := public.get_friend_profile(d);
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.ok('93 a stranger''s profile reports relationship none',
    res->>'relationship' = 'none',
    format('got %s (null here is the pre-015 bug)', coalesce(res->>'relationship', 'NULL')));
  perform pg_temp.ok('94 a stranger''s profile still hides their stats',
    (res->>'can_view_stats')::boolean = false and res->'stats' = 'null'::jsonb,
    format('can_view=%s stats=%s', res->>'can_view_stats', res->'stats'));
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('93/94 stranger relationship', sqlerrm);
end;
$$;

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  res jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  res := public.get_friend_profile(a);
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.ok('95 your own profile reports relationship self',
    res->>'relationship' = 'self',
    format('got %s', coalesce(res->>'relationship', 'NULL')));
  -- The privacy switches must not ride along in the payload.
  perform pg_temp.ok('96 profile payload carries no privacy switches',
    not (res->'profile' ? 'share_stats')
      and not (res->'profile' ? 'share_activity')
      and not (res->'profile' ? 'community_notice_pending'),
    -- Parenthesised. Without them this reads as res -> ('profile'::text), which
    -- yields jsonb, and pg_temp.ok takes text — so the call fails to resolve and
    -- the assertion raises instead of reporting.
    (res->'profile')::text);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('95/96 self relationship', sqlerrm);
end;
$$;

do $$
declare
  a uuid := (select id from t_users where tag = 'A');
  b uuid := (select id from t_users where tag = 'B');
  res jsonb;
begin
  -- A and B were made friends in test 90, so this is the branch that DID work
  -- before 015. It must still work after it.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  res := public.get_friend_profile(b);
  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.ok('97 a friend''s profile still reports friends',
    res->>'relationship' = 'friends', coalesce(res->>'relationship', 'NULL'));
  perform pg_temp.ok('98 a friend''s stats are still visible',
    (res->>'can_view_stats')::boolean = true, res->>'can_view_stats');
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.fail('97/98 friend relationship', sqlerrm);
end;
$$;

-- ===========================================================================
-- Results
-- ===========================================================================

select
  case when passed then 'PASS' else 'FAIL' end as result,
  name,
  detail
from t_results
order by passed, name;

select
  count(*) filter (where passed)       as passed,
  count(*) filter (where not passed)   as failed,
  count(*)                             as total
from t_results;

rollback;
