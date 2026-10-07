-- Workout Coach Engine, W-5: structural adaptations (docs/DECISIONS.md D-037;
-- docs/TRAINING_STRUCTURE.md).
--
-- Audit first (D-037 §39): no new table. The existing journal `adjustments` already holds every
-- proposal answer (proposed, applied, declined, reverted, postponed) with its reason and evidence;
-- `training_programs` already versions durable changes; `workout_sessions` + `planned_exercises`
-- already hold immutable prescriptions. What was missing:
--
--   adjustments
--     proposal_id     the stable id of the proposal answered: two devices answering offline keep
--                     both rows, the latest gesture is the one in force (never lost silently)
--     scope           how long the change lasts: session, sessions, week, weeks, durable
--     effective_to    its last day (inclusive), known before the user says yes
--     session_count   for a `sessions` scope: how many sessions it covers
--     + append-only: a decision is never rewritten (revert = a new decision on the same proposal)
--
--   workout_sessions
--     adjustment_id   the structural decision a prescription follows (reduced volume, easier
--                     variant, restart): frozen with the prescription, like the rest of it
--
--   training_programs
--     rotated_exercise_ids   exercises rotated at an end-of-cycle evolution the user accepted
--                            (a parameter of the version, frozen with it)
--
-- `keptExercises` ("le garder", local since W-3) needs no table: the answer is a `declined`
-- decision on the `exercise_change` proposal, synced, exported and deleted with the journal.

-- ---------------------------------------------------------------------------
-- 1. Decisions: stable proposal id, scope, end; append-only
-- ---------------------------------------------------------------------------

alter table public.adjustments
  add column proposal_id text check (proposal_id ~ '^[a-z0-9_.,:-]{1,160}$'),
  add column scope text check (scope in ('session', 'sessions', 'week', 'weeks', 'durable')),
  add column effective_to date,
  add column session_count smallint check (session_count between 1 and 12),
  add constraint adjustments_effective_range check (effective_to is null or effective_to >= effective_from),
  add constraint adjustments_sessions_scope check (scope is distinct from 'sessions' or session_count is not null),
  add constraint adjustments_durable_scope check (scope is distinct from 'durable' or effective_to is null);

-- Existing change keys stay valid; targeted ones carry exercise ids ("easier_variant", from/to
-- "bench_press,pull_up"): from_value / to_value are already small jsonb values (≤ 128 bytes).

create index adjustments_proposal_idx on public.adjustments (user_id, proposal_id);

-- A decision is history: only its soft deletion moves (the Privacy Center deletes rows outright).
create or replace function public.adjustments_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- An identical upsert (a second device pushing the same row) is accepted; any change is refused.
  if (to_jsonb(new) - 'updated_at' - 'deleted_at') is distinct from (to_jsonb(old) - 'updated_at' - 'deleted_at') then
    raise exception 'adjustments: a decision is immutable (record a new decision instead)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger adjustments_immutable before update on public.adjustments
  for each row execute function public.adjustments_immutable();

-- ---------------------------------------------------------------------------
-- 2. Sessions: the structural decision a prescription follows
-- ---------------------------------------------------------------------------

-- Soft reference (like training_programs.adjustment_id): the prescription keeps it even if the
-- journal is deleted from the Privacy Center.
alter table public.workout_sessions add column adjustment_id uuid;

create or replace function public.workout_sessions_prescription_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.program_id is not null and new.program_id is distinct from old.program_id then
    raise exception 'workout_sessions: a session cannot move to another program' using errcode = 'check_violation';
  end if;
  if old.prescription_source is not null and new.prescription_source is distinct from old.prescription_source then
    raise exception 'workout_sessions: prescription_source is immutable' using errcode = 'check_violation';
  end if;
  if old.prescribed_at is not null
     and (new.session_index, new.scheduled_for, new.focus, new.planned_minutes, new.purpose, new.prescribed_at,
          new.adjustment_id)
         is distinct from
         (old.session_index, old.scheduled_for, old.focus, old.planned_minutes, old.purpose, old.prescribed_at,
          old.adjustment_id) then
    raise exception 'workout_sessions: a prescribed session is immutable' using errcode = 'check_violation';
  end if;
  -- The adaptation of the day is settled once the session is over.
  if old.status in ('completed', 'skipped', 'replaced', 'rescheduled', 'superseded')
     and (new.adapted_minutes, new.adaptation_reason) is distinct from (old.adapted_minutes, old.adaptation_reason) then
    raise exception 'workout_sessions: the adaptation of a past session is immutable' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Program versions: exercises rotated at an end-of-cycle evolution
-- ---------------------------------------------------------------------------

alter table public.training_programs
  add column rotated_exercise_ids text[] check (
    rotated_exercise_ids is null
    or (cardinality(rotated_exercise_ids) between 1 and 30
        and array_to_string(rotated_exercise_ids, ',') ~ '^[a-z0-9_:,-]*$')
  ),
  add constraint training_programs_rotation_engine check (rotated_exercise_ids is null or source = 'engine');

create or replace function public.training_programs_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.user_id, new.lineage_id, new.version, new.source, new.reason_key, new.adjustment_id,
      new.engine_version, new.goal, new.split, new.sessions_per_week, new.session_minutes, new.level,
      new.equipment, new.excluded_exercise_ids, new.rotated_exercise_ids, new.cycle_weeks, new.effective_from,
      new.published_at, new.created_at)
     is distinct from
     (old.id, old.user_id, old.lineage_id, old.version, old.source, old.reason_key, old.adjustment_id,
      old.engine_version, old.goal, old.split, old.sessions_per_week, old.session_minutes, old.level,
      old.equipment, old.excluded_exercise_ids, old.rotated_exercise_ids, old.cycle_weeks, old.effective_from,
      old.published_at, old.created_at) then
    raise exception 'training_programs: a published program version is immutable (publish a new version)'
      using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status and not (old.status = 'active' and new.status in ('superseded', 'ended')) then
    raise exception 'training_programs: status % cannot become %', old.status, new.status using errcode = 'check_violation';
  end if;
  if old.effective_to is not null and new.effective_to is distinct from old.effective_to then
    raise exception 'training_programs: effective_to is already set' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- RLS: unchanged. adjustments, workout_sessions and training_programs already have owner-only
-- policies (select / insert / update / delete for authenticated, nothing for anon); new columns
-- are covered by them. Export and deletion (Privacy Center) read whole rows: covered as well.
