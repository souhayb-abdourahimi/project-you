-- Workout Coach foundation (W-1, D-031): versions, immutable prescriptions, link to what was done,
-- reconstructed history, RLS and multi-device upserts. Run with `npm run test:db` after rls.sql.
\set ON_ERROR_STOP on
\o /dev/null

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000c', 'c@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.test');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.expect(condition boolean, message text) returns void language plpgsql as $$
begin
  if not condition then raise exception 'TRAINING TEST FAILED: %', message; end if;
  raise notice 'ok - %', message;
end;
$$;

-- Runs `statement` and expects it to fail with `state` (the transaction goes on).
create or replace function pg_temp.expect_error(statement text, state text, message text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate <> state then
      raise exception 'TRAINING TEST FAILED: % (got % %, expected %)', message, sqlstate, sqlerrm, state;
    end if;
    raise notice 'ok - %', message;
    return;
  end;
  raise exception 'TRAINING TEST FAILED: % (statement succeeded)', message;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Program versions (as C)
-- ---------------------------------------------------------------------------
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');

insert into public.training_programs (id, user_id, lineage_id, version, source, status, reason_key, engine_version, goal, split,
  sessions_per_week, session_minutes, level, equipment, excluded_exercise_ids, cycle_weeks, effective_from)
values ('00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001f1', 1,
  'engine', 'active', 'program.reason.first', 1, 'muscle_gain', '{full_a,full_b,full_a}', 3, 60, 'intermediate',
  '{bodyweight,dumbbells}', '{}', 6, '2026-10-05');
select pg_temp.expect((select count(*) from public.training_programs) = 1, 'owner creates and reads a program version');

select pg_temp.expect_error($s$
  insert into public.training_programs (user_id, lineage_id, version, source, status, reason_key, engine_version, goal, split,
    sessions_per_week, session_minutes, level, equipment, excluded_exercise_ids, effective_from)
  values ('00000000-0000-0000-0000-00000000000c', gen_random_uuid(), 1, 'engine', 'active', 'program.reason.first', 1,
    'fat_loss', '{full_a}', 1, 30, 'beginner', '{bodyweight}', '{}', '2026-10-06')$s$,
  '23505', 'only one active program per user');
select pg_temp.expect_error($s$
  insert into public.training_programs (user_id, lineage_id, version, source, status, reason_key, effective_from)
  values ('00000000-0000-0000-0000-00000000000c', gen_random_uuid(), 1, 'engine', 'ended', 'program.reason.first', '2026-10-06')$s$,
  '23514', 'an engine version always carries its parameters');
select pg_temp.expect_error($s$
  update public.training_programs set session_minutes = 45 where id = '00000000-0000-0000-0000-0000000001a1'$s$,
  '23514', 'a published version cannot be rewritten');
select pg_temp.expect_error($s$
  update public.training_programs set equipment = '{bodyweight}' where id = '00000000-0000-0000-0000-0000000001a1'$s$,
  '23514', 'the equipment of a published version is frozen');

-- 2. A session prescribed by v1, with its planned exercises.
insert into public.workout_sessions (id, user_id, program_id, session_index, scheduled_for, focus, planned_minutes, purpose,
  prescription_source, prescribed_at, status)
values ('00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001a1',
  0, '2026-10-05', 'full_a', 55, 'hypertrophy', 'engine', '2026-10-05T07:00:00Z', 'planned');
insert into public.planned_exercises (id, user_id, session_id, variant, position, exercise_id, sets, reps_min, reps_max, unit,
  rest_seconds, target_rpe, target_load_kg, progression_action, progression_reason, purpose, purpose_target)
values
  ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'full', 0,
   'goblet_squat', 3, 6, 10, 'reps', 120, 8, 20, 'increase_load', 'progression.reason.top_of_range', 'hypertrophy', 'quads'),
  ('00000000-0000-0000-0000-0000000001c2', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'full', 1,
   'push_up', 3, 6, 10, 'reps', 120, 8, null, null, null, 'hypertrophy', 'chest');
select pg_temp.expect((select count(*) from public.planned_exercises) = 2, 'owner writes and reads a prescription');
select pg_temp.expect(
  (select count(*) from public.planned_exercises where target_load_kg is null and progression_action is null) = 1,
  'a load with no basis stays null');

select pg_temp.expect_error($s$
  update public.planned_exercises set sets = 4 where id = '00000000-0000-0000-0000-0000000001c1'$s$,
  '23514', 'a prescription is immutable');
select pg_temp.expect_error($s$
  update public.planned_exercises set target_load_kg = 22.5 where id = '00000000-0000-0000-0000-0000000001c1'$s$,
  '23514', 'a proposed load is never rewritten afterwards');
select pg_temp.expect_error($s$
  update public.workout_sessions set planned_minutes = 30 where id = '00000000-0000-0000-0000-0000000001b1'$s$,
  '23514', 'a prescribed session is immutable');
select pg_temp.expect_error($s$
  insert into public.planned_exercises (user_id, session_id, variant, position, exercise_id, sets, reps_min, reps_max, unit, rest_seconds, purpose)
  values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'full', 2, 'plank', 3, 40, 30, 'seconds', 60, 'hypertrophy')$s$,
  '23514', 'a rep range cannot be inverted');
select pg_temp.expect_error($s$
  insert into public.planned_exercises (user_id, session_id, variant, position, exercise_id, sets, reps_min, reps_max, unit, rest_seconds, purpose)
  values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'full', 2, 'plank', 3, 30, 40, 'seconds', 60, 'because I said so')$s$,
  '23514', 'a prescription reason is structured');
select pg_temp.expect_error($s$
  insert into public.workout_sessions (user_id, program_id, prescription_source) values
    ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001a1', 'engine')$s$,
  '23514', 'an engine session carries its prescription');

-- Multi-device: a second device pushing the same prescription is accepted; a different one is not.
insert into public.planned_exercises (id, user_id, session_id, variant, position, exercise_id, sets, reps_min, reps_max, unit,
  rest_seconds, target_rpe, target_load_kg, progression_action, progression_reason, purpose, purpose_target)
values ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'full', 0,
  'goblet_squat', 3, 6, 10, 'reps', 120, 8, 20, 'increase_load', 'progression.reason.top_of_range', 'hypertrophy', 'quads')
on conflict (id) do update set session_id = excluded.session_id, variant = excluded.variant, position = excluded.position,
  exercise_id = excluded.exercise_id, sets = excluded.sets, reps_min = excluded.reps_min, reps_max = excluded.reps_max,
  unit = excluded.unit, rest_seconds = excluded.rest_seconds, target_rpe = excluded.target_rpe,
  target_load_kg = excluded.target_load_kg, progression_action = excluded.progression_action,
  progression_reason = excluded.progression_reason, purpose = excluded.purpose, purpose_target = excluded.purpose_target;
select pg_temp.expect(true, 'a second device re-pushing the same prescription is idempotent');
select pg_temp.expect_error($s$
  insert into public.planned_exercises (id, user_id, session_id, variant, position, exercise_id, sets, reps_min, reps_max, unit, rest_seconds, purpose)
  values ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1',
    'full', 0, 'goblet_squat', 5, 6, 10, 'reps', 120, 'hypertrophy')
  on conflict (id) do update set sets = excluded.sets$s$,
  '23514', 'a second device cannot overwrite a prescription');

-- The adaptation of the day: new rows under its own variant, the full prescription untouched.
update public.workout_sessions set adapted_minutes = 20, adaptation_reason = 'workout.difficult', variant = 'short'
  where id = '00000000-0000-0000-0000-0000000001b1';
insert into public.planned_exercises (user_id, session_id, variant, position, exercise_id, sets, reps_min, reps_max, unit, rest_seconds, target_rpe, purpose, purpose_target)
values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'short', 0, 'bodyweight_squat', 2, 10, 15, 'reps', 30, 7, 'muscular_endurance', 'squat');
select pg_temp.expect((select count(*) from public.planned_exercises where variant = 'full') = 2, 'adapting the day keeps the full prescription');

-- 3. What was done, linked to the prescription.
update public.workout_sessions set status = 'completed', started_at = '2026-10-05T18:00:00Z', completed_at = '2026-10-05T18:25:00Z',
  difficulty = 4, notes = 'Bonne séance' where id = '00000000-0000-0000-0000-0000000001b1';
insert into public.exercise_logs (user_id, session_id, planned_exercise_id, exercise_id, set_index, reps, load_kg, rpe)
values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001c1', 'goblet_squat', 0, 10, 20, 8);
insert into public.exercise_logs (user_id, session_id, planned_exercise_id, exercise_id, set_index, seconds)
values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', null, 'plank', 0, 40);
insert into public.exercise_substitutions (user_id, session_id, planned_exercise_id, from_exercise_id, to_exercise_id, reason)
values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001c2', 'push_up', 'knee_push_up', 'busy_equipment');
select pg_temp.expect(
  (select count(*) from public.exercise_logs l join public.planned_exercises p on p.id = l.planned_exercise_id
   join public.workout_sessions s on s.id = p.session_id join public.training_programs g on g.id = s.program_id
   where g.version = 1 and l.reps = 10) = 1,
  'a set links back to its prescription, session and program version');
select pg_temp.expect(
  (select difficulty from public.workout_sessions where id = '00000000-0000-0000-0000-0000000001b1') = 4,
  'the declared difficulty is stored');
select pg_temp.expect_error($s$
  insert into public.exercise_logs (user_id, session_id, exercise_id, set_index, reps, seconds)
  values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'plank', 1, 10, 40)$s$,
  '23514', 'a set is reps or seconds, not both');
select pg_temp.expect_error($s$
  update public.workout_sessions set difficulty = 7 where id = '00000000-0000-0000-0000-0000000001b1'$s$,
  '23514', 'difficulty stays on the 1–5 scale');
select pg_temp.expect_error($s$
  insert into public.exercise_substitutions (user_id, session_id, from_exercise_id, to_exercise_id, reason)
  values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'goblet_squat', 'lunge', 'hates_it')$s$,
  '23514', 'replacement reasons come from the closed list');
select pg_temp.expect_error($s$
  update public.workout_sessions set adapted_minutes = 15 where id = '00000000-0000-0000-0000-0000000001b1'$s$,
  '23514', 'the adaptation of a past session is immutable');
-- Facts stay correctable: a set can be fixed.
update public.exercise_logs set reps = 9 where session_id = '00000000-0000-0000-0000-0000000001b1' and exercise_id = 'goblet_squat';
select pg_temp.expect((select reps from public.exercise_logs where exercise_id = 'goblet_squat') = 9, 'a set done can be corrected');

-- W-3 (D-034): the session experience.
-- A set removed by a correction is soft-deleted (the sync's deletion), never rewritten in place.
update public.exercise_logs set deleted_at = now() where session_id = '00000000-0000-0000-0000-0000000001b1' and exercise_id = 'plank';
select pg_temp.expect((select count(*) from public.exercise_logs where exercise_id = 'plank' and deleted_at is not null) = 1, 'a corrected-away set is soft-deleted');
-- "Je ne fais pas cet exercice": the prescription stays, the fact is recorded with its reason.
insert into public.exercise_reports (user_id, session_id, planned_exercise_id, exercise_id, not_performed, not_performed_reason)
values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001c2', 'push_up', true, 'discomfort');
select pg_temp.expect(
  (select count(*) from public.exercise_reports r join public.planned_exercises p on p.id = r.planned_exercise_id
   where r.not_performed and p.exercise_id = 'push_up') = 1
  and (select count(*) from public.planned_exercises where id = '00000000-0000-0000-0000-0000000001c2') = 1,
  'an exercise not performed is a fact; its prescription is kept');
-- Felt difficulty of one exercise; a second device pushing the same report upserts it.
insert into public.exercise_reports (user_id, session_id, planned_exercise_id, exercise_id, difficulty)
values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001c1', 'goblet_squat', 4)
on conflict (session_id, exercise_id) do update set difficulty = excluded.difficulty;
insert into public.exercise_reports (user_id, session_id, planned_exercise_id, exercise_id, difficulty)
values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001c1', 'goblet_squat', 5)
on conflict (session_id, exercise_id) do update set difficulty = excluded.difficulty;
select pg_temp.expect((select difficulty from public.exercise_reports where exercise_id = 'goblet_squat') = 5, 'one report per exercise of a session, correctable');
select pg_temp.expect_error($s$
  insert into public.exercise_reports (user_id, session_id, exercise_id) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'lunge')$s$,
  '23514', 'a report always says something');
select pg_temp.expect_error($s$
  insert into public.exercise_reports (user_id, session_id, exercise_id, difficulty, not_performed_reason)
  values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'lunge', 3, 'no_time')$s$,
  '23514', 'a reason only goes with "not performed"');
select pg_temp.expect_error($s$
  insert into public.exercise_reports (user_id, session_id, exercise_id, not_performed, not_performed_reason)
  values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'lunge', true, 'lazy')$s$,
  '23514', 'reasons come from the closed list');
select pg_temp.expect_error($s$
  insert into public.exercise_reports (user_id, session_id, exercise_id, difficulty)
  values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001b1', 'lunge', 6)$s$,
  '23514', 'exercise difficulty stays on the 1–5 scale');
-- A session stopped early: completed, with its reason (never a failure status).
update public.workout_sessions set outcome_reason = 'pain' where id = '00000000-0000-0000-0000-0000000001b1';
select pg_temp.expect(
  (select status = 'completed' and outcome_reason = 'pain' from public.workout_sessions where id = '00000000-0000-0000-0000-0000000001b1'),
  'a session stopped early is completed with its reason');

-- 4. Profile change → v2; v1 and its prescription are untouched.
update public.training_programs set status = 'superseded', effective_to = '2026-10-11' where id = '00000000-0000-0000-0000-0000000001a1';
insert into public.training_programs (id, user_id, lineage_id, version, source, status, reason_key, engine_version, goal, split,
  sessions_per_week, session_minutes, level, equipment, excluded_exercise_ids, cycle_weeks, effective_from)
values ('00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001f1', 2,
  'engine', 'active', 'program.reason.profile_changed', 1, 'muscle_gain', '{full_a,full_b}', 2, 45, 'intermediate',
  '{bodyweight}', '{goblet_squat}', 6, '2026-10-12');
select pg_temp.expect(
  (select string_agg(exercise_id || ':' || sets || ':' || coalesce(target_load_kg::text, '-'), ',' order by position)
   from public.planned_exercises where session_id = '00000000-0000-0000-0000-0000000001b1' and variant = 'full')
  = 'goblet_squat:3:20.00,push_up:3:-',
  'a profile change does not rewrite the historical prescription');
select pg_temp.expect(
  (select session_minutes from public.training_programs where id = '00000000-0000-0000-0000-0000000001a1') = 60,
  'v1 keeps its own parameters after v2');
select pg_temp.expect_error($s$
  update public.training_programs set status = 'active' where id = '00000000-0000-0000-0000-0000000001a1'$s$,
  '23514', 'a superseded version never becomes active again');
select pg_temp.expect_error($s$
  update public.training_programs set effective_to = '2026-10-20' where id = '00000000-0000-0000-0000-0000000001a1'$s$,
  '23514', 'the end of a version is set once');
select pg_temp.expect_error($s$
  update public.workout_sessions set program_id = '00000000-0000-0000-0000-0000000001a2' where id = '00000000-0000-0000-0000-0000000001b1'$s$,
  '23514', 'a session never moves to another program version');

-- Adaptation decisions can be postponed (end of cycle: accept, decline or later).
insert into public.adjustments (user_id, kind, change_key, reason_key, status, effective_from)
values ('00000000-0000-0000-0000-00000000000c', 'reduce_load', 'light_week', 'adaptation.reason.end_of_cycle', 'postponed', '2026-11-16');
select pg_temp.expect((select count(*) from public.adjustments where status = 'postponed') = 1, 'a proposal can be postponed');
commit;

-- ---------------------------------------------------------------------------
-- 5. History recorded before W-1 (as C): attached to a reconstructed program, nothing invented
-- ---------------------------------------------------------------------------
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.workout_sessions (id, user_id, session_index, scheduled_for, variant, status, completed_at) values
  ('00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-00000000000c', 1, '2026-09-10', 'full', 'completed', '2026-09-10T18:00:00Z'),
  ('00000000-0000-0000-0000-0000000001d2', '00000000-0000-0000-0000-00000000000c', 0, '2026-09-03', 'short', 'completed', '2026-09-03T18:00:00Z');
insert into public.exercise_logs (user_id, session_id, exercise_id, set_index, reps, load_kg)
values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000001d1', 'goblet_squat', 0, 8, 16);

select pg_temp.expect(public.attach_reconstructed_training_history() is not null, 'legacy sessions get a reconstructed program');
select pg_temp.expect(
  (select count(*) from public.training_programs where source = 'reconstructed' and status = 'ended' and effective_from = '2026-09-03'
     and engine_version is null and goal is null and split is null and sessions_per_week is null and session_minutes is null
     and level is null and equipment is null and excluded_exercise_ids is null and cycle_weeks is null) = 1,
  'the reconstructed program invents no parameter');
select pg_temp.expect(
  (select count(*) from public.workout_sessions where prescription_source = 'unknown' and program_id is not null
     and focus is null and planned_minutes is null and purpose is null and prescribed_at is null) = 2,
  'legacy sessions are attached with an unknown prescription');
select pg_temp.expect(
  (select count(*) from public.planned_exercises where session_id in ('00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000001d2')) = 0,
  'no prescription is fabricated for history');
select pg_temp.expect(
  (select count(*) from public.exercise_logs where session_id = '00000000-0000-0000-0000-0000000001d1' and reps = 8 and load_kg = 16) = 1
  and (select variant from public.workout_sessions where id = '00000000-0000-0000-0000-0000000001d2') = 'short',
  'what was really recorded is kept');
select pg_temp.expect(
  (select program_id from public.workout_sessions where id = '00000000-0000-0000-0000-0000000001b1') = '00000000-0000-0000-0000-0000000001a1',
  'prescribed sessions are left untouched');

-- Second device, second run: same program, nothing new.
select pg_temp.expect(
  public.attach_reconstructed_training_history() = (select id from public.training_programs where source = 'reconstructed'),
  'reconstruction is idempotent across devices');
select pg_temp.expect((select count(*) from public.training_programs where source = 'reconstructed') = 1, 'one reconstructed program per user');
-- A legacy session synced later by an old app version joins the same program.
insert into public.workout_sessions (id, user_id, session_index, scheduled_for, status)
values ('00000000-0000-0000-0000-0000000001d3', '00000000-0000-0000-0000-00000000000c', 0, '2026-09-17', 'completed');
select public.attach_reconstructed_training_history();
select pg_temp.expect(
  (select count(*) from public.workout_sessions where prescription_source = 'unknown') = 3,
  'a late legacy session joins the reconstructed program');
select pg_temp.expect_error($s$
  insert into public.training_programs (user_id, lineage_id, version, source, status, reason_key, goal, effective_from)
  values ('00000000-0000-0000-0000-00000000000c', gen_random_uuid(), 1, 'reconstructed', 'ended', 'program.reason.reconstructed', 'fat_loss', '2026-09-01')$s$,
  '23514', 'a reconstructed program cannot claim a goal');
select pg_temp.expect_error($s$
  update public.workout_sessions set focus = 'upper' where id = '00000000-0000-0000-0000-0000000001d1'$s$,
  '23514', 'an unknown prescription is never filled in afterwards');
select pg_temp.expect_error($s$
  update public.workout_sessions set prescription_source = 'engine' where id = '00000000-0000-0000-0000-0000000001d1'$s$,
  '23514', 'an unknown prescription stays unknown');
commit;

-- ---------------------------------------------------------------------------
-- 6. RLS: D cannot read, change or attach anything to C's training data
-- ---------------------------------------------------------------------------
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from public.training_programs) = 0, 'D cannot read C programs');
select pg_temp.expect((select count(*) from public.planned_exercises) = 0, 'D cannot read C prescriptions');
select pg_temp.expect((select count(*) from public.workout_sessions) = 0, 'D cannot read C sessions');
with u as (update public.training_programs set status = 'ended' returning 1) select pg_temp.expect((select count(*) from u) = 0, 'D cannot update C programs');
with u as (update public.planned_exercises set sets = sets returning 1) select pg_temp.expect((select count(*) from u) = 0, 'D cannot update C prescriptions');
with d as (delete from public.planned_exercises returning 1) select pg_temp.expect((select count(*) from d) = 0, 'D cannot delete C prescriptions');
with d as (delete from public.training_programs returning 1) select pg_temp.expect((select count(*) from d) = 0, 'D cannot delete C programs');
select pg_temp.expect(public.attach_reconstructed_training_history() is null, 'D reconstruction never touches C sessions');
select pg_temp.expect_error($s$
  insert into public.training_programs (user_id, lineage_id, version, source, status, reason_key, effective_from)
  values ('00000000-0000-0000-0000-00000000000c', gen_random_uuid(), 9, 'reconstructed', 'ended', 'x', '2026-09-01')$s$,
  '42501', 'D cannot create a program for C');
select pg_temp.expect_error($s$
  insert into public.workout_sessions (user_id, program_id) values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000001a2')$s$,
  '42501', 'D cannot attach a session to C program');
select pg_temp.expect_error($s$
  insert into public.planned_exercises (user_id, session_id, variant, position, exercise_id, sets, reps_min, reps_max, unit, rest_seconds, purpose)
  values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000001b1', 'light', 0, 'push_up', 1, 5, 8, 'reps', 60, 'recovery')$s$,
  '42501', 'D cannot add a prescription to C session');
insert into public.workout_sessions (id, user_id, status) values ('00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-00000000000d', 'in_progress');
select pg_temp.expect_error($s$
  insert into public.exercise_logs (user_id, session_id, planned_exercise_id, exercise_id, set_index, reps)
  values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001c1', 'goblet_squat', 0, 5)$s$,
  '42501', 'D cannot link a set to C prescription');
select pg_temp.expect_error($s$
  insert into public.exercise_substitutions (user_id, session_id, planned_exercise_id, from_exercise_id, to_exercise_id, reason)
  values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001c1', 'a', 'b', 'other')$s$,
  '42501', 'D cannot link a replacement to C prescription');
select pg_temp.expect_error($s$
  insert into public.exercise_reports (user_id, session_id, planned_exercise_id, exercise_id, difficulty)
  values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001c1', 'goblet_squat', 3)$s$,
  '42501', 'D cannot link a report to C prescription');
select pg_temp.expect_error($s$
  insert into public.exercise_reports (user_id, session_id, exercise_id, difficulty)
  values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000001b1', 'goblet_squat', 3)$s$,
  '42501', 'D cannot attach a report to C session');
commit;

reset role;
select pg_temp.expect((select count(*) from public.planned_exercises where user_id = '00000000-0000-0000-0000-00000000000c') = 3, 'C prescriptions intact after D attempts');

-- Privacy Center order (CATEGORY_TABLES.workouts): children first, then sessions, then programs.
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
delete from public.exercise_reports where user_id = '00000000-0000-0000-0000-00000000000c';
delete from public.exercise_substitutions where user_id = '00000000-0000-0000-0000-00000000000c';
delete from public.exercise_logs where user_id = '00000000-0000-0000-0000-00000000000c';
delete from public.planned_exercises where user_id = '00000000-0000-0000-0000-00000000000c';
delete from public.workout_sessions where user_id = '00000000-0000-0000-0000-00000000000c';
delete from public.training_programs where user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect(
  (select count(*) from public.training_programs) + (select count(*) from public.planned_exercises) + (select count(*) from public.workout_sessions) = 0,
  'the user can erase their training history (erasure is not a rewrite)');
rollback;

-- Account deletion cascades through programs, sessions and prescriptions.
reset role;
delete from auth.users where id in ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d');
select pg_temp.expect(
  (select count(*) from public.training_programs) + (select count(*) from public.planned_exercises) = 0,
  'account deletion removes programs and prescriptions');
