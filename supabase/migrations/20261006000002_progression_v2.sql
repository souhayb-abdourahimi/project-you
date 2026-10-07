-- Workout Coach Engine, W-4: Progression Engine v2 (docs/DECISIONS.md D-035;
-- docs/TRAINING_PROGRESSION.md).
--
-- Nothing rewritten, no new table. A progression decision is part of the prescription it was
-- frozen into (planned_exercises stays immutable): applying it to the future means a NEW
-- prescription of a session not started yet (a new workout_sessions row, the previous one
-- `superseded`), never an edit and never a new program version.
--
--   planned_exercises
--     progression_action      widened: the W-4 actions; the W-2 values stay valid for history
--     target_reps             new: reps (or seconds for a hold) to aim for in each set
--     progression_confidence  new: how much real history the decision stands on
--     progression_params      new: the facts the reason is told with (numbers from the evidence)

alter table public.planned_exercises drop constraint if exists planned_exercises_progression_action_check;
alter table public.planned_exercises add constraint planned_exercises_progression_action_check
  check (progression_action in (
    -- W-4 (src/domain/training/progression.ts PROGRESSION_ACTIONS)
    'increase_load', 'increase_reps', 'maintain', 'retry', 'reduce_load', 'no_recommendation',
    -- W-2, kept for the prescriptions already given (LEGACY_PROGRESSION_ACTIONS)
    'add_reps', 'keep', 'deload', 'first_time'
  ));

alter table public.planned_exercises
  add column target_reps smallint check (target_reps between 1 and 3600),
  add column progression_confidence text
    check (progression_confidence in ('insufficient', 'low', 'medium', 'high')),
  -- A small flat object of numbers and short keys ("sessions": 2, "max": 12), never free text.
  add column progression_params jsonb
    check (progression_params is null
           or (jsonb_typeof(progression_params) = 'object' and pg_column_size(progression_params) <= 512)),
  -- The goal stays inside the prescribed range.
  add constraint planned_exercises_target_in_range
    check (target_reps is null or target_reps between reps_min and reps_max),
  add constraint planned_exercises_target_needs_action
    check ((target_reps is null and progression_confidence is null and progression_params is null)
           or progression_action is not null);

-- planned_exercises_immutable (W-1) compares the whole row: the new columns are frozen with it.
