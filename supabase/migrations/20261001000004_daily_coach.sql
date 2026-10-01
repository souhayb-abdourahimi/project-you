-- Daily Coach + Progress Journey (docs/DECISIONS.md D-028, docs/DAILY_COACH.md §9).
-- The journey's history lives on the server so a second device sees the same story:
-- 1. meals: `replaced` status and an optional reason (closed list, never free text);
-- 2. sessions: `replaced` status, what replaced it and an optional reason;
-- 3. daily_checkins: the mode of the day and a light activity (synced from now on);
-- 4. new tables weekly_checkins, exercise_substitutions, journey_milestones, adjustments;
-- 5. notification_history accepts the new coach triggers.
-- Every new table: owner-only RLS, no anon privilege, deleted with the account (on delete cascade).

-- 1. Meals
alter table public.meal_plan_items drop constraint if exists meal_plan_items_status_check;
alter table public.meal_plan_items add constraint meal_plan_items_status_check
  check (status in ('planned', 'eaten', 'skipped', 'replaced'));
alter table public.meal_plan_items add column reason text
  check (reason in ('not_hungry', 'no_time', 'missing_ingredient', 'restaurant', 'wanted_else', 'forgot'));
alter table public.meal_plan_items add constraint meal_plan_items_reason_status
  check (reason is null or status in ('skipped', 'replaced'));

-- 2. Sessions
alter table public.workout_sessions drop constraint if exists workout_sessions_status_check;
alter table public.workout_sessions add constraint workout_sessions_status_check
  check (status in ('planned', 'in_progress', 'completed', 'skipped', 'rescheduled', 'replaced'));
alter table public.workout_sessions add column outcome_reason text
  check (outcome_reason in ('no_time', 'no_motivation', 'tired', 'pain', 'schedule', 'other'));
alter table public.workout_sessions add column replaced_by text
  check (replaced_by in ('walk', 'mobility', 'rest', 'other_sport'));
alter table public.workout_sessions add constraint workout_sessions_replaced_by_status
  check (replaced_by is null or status = 'replaced');

-- 3. Daily check-ins
alter table public.daily_checkins add column day_mode text
  check (day_mode in ('normal', 'difficult', 'short', 'low_motivation'));
alter table public.daily_checkins add column activity text check (activity in ('walk', 'mobility', 'rest'));
alter table public.daily_checkins add column activity_minutes smallint check (activity_minutes between 0 and 600);

-- 4. New tables
create table public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  week_rating smallint not null check (week_rating between 1 and 5),
  energy smallint check (energy between 1 and 5),
  motivation smallint check (motivation between 1 and 5),
  fatigue smallint check (fatigue between 1 and 5),
  nutrition smallint check (nutrition between 1 and 5),
  training smallint check (training between 1 and 5),
  difficulty smallint check (difficulty between 1 and 5),
  main_problem text check (main_problem in (
    'none', 'time', 'hunger', 'cravings', 'fatigue', 'pain', 'motivation', 'budget', 'social', 'sleep', 'schedule', 'other'
  )),
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, week_start)
);

create table public.exercise_substitutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  from_exercise_id text not null check (from_exercise_id ~ '^[a-z0-9_:-]{1,64}$'),
  to_exercise_id text not null check (to_exercise_id ~ '^[a-z0-9_:-]{1,64}$'),
  reason text check (reason in ('dislike', 'cant_do', 'no_equipment', 'easier', 'harder')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (session_id, from_exercise_id)
);

create table public.journey_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  milestone_id text not null check (milestone_id ~ '^[a-z0-9_]{1,40}$'),
  reached_on date not null,
  celebrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, milestone_id)
);

-- Adaptation decisions: an append-only journal (only `status` changes after creation).
create table public.adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('nutrition', 'training', 'planning', 'reduce_load', 'add_recovery', 'simplify_tracking')),
  change_key text not null check (change_key ~ '^[a-z0-9_.]{1,60}$'),
  from_value jsonb check (from_value is null or pg_column_size(from_value) <= 128),
  to_value jsonb check (to_value is null or pg_column_size(to_value) <= 128),
  reason_key text not null check (reason_key ~ '^[a-z0-9_.]{1,80}$'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object' and pg_column_size(evidence) <= 1024),
  status text not null check (status in ('proposed', 'applied', 'declined', 'reverted')),
  effective_from date not null,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index weekly_checkins_sync_idx on public.weekly_checkins (user_id, updated_at);
create index exercise_substitutions_sync_idx on public.exercise_substitutions (user_id, updated_at);
create index exercise_substitutions_session_idx on public.exercise_substitutions (session_id);
create index journey_milestones_sync_idx on public.journey_milestones (user_id, updated_at);
create index adjustments_sync_idx on public.adjustments (user_id, updated_at);

do $$
declare
  t text;
begin
  foreach t in array array['weekly_checkins', 'exercise_substitutions', 'journey_milestones', 'adjustments'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- A substitution can only point to a session of the same user (same rule as exercise_logs).
create policy exercise_substitutions_own_session on public.exercise_substitutions as restrictive for all to authenticated
  using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())));

-- 5. Notification history: the coach's new triggers (same list as src/domain/journey/voice/types.ts).
alter table public.notification_history drop constraint notification_history_trigger_check;
alter table public.notification_history add constraint notification_history_trigger_check check (trigger in (
  'session_planned', 'session_planned_tired', 'meal_planned', 'weigh_in', 'shopping',
  'weekly_progress', 'weekly_checkin', 'success_session', 'success_streak',
  'absence_gentle', 'absence_comeback', 'absence_last', 'fatigue_recovery', 'daily_why',
  'safety_low_intake', 'safety_fast_loss', 'safety_training_load', 'safety_low_logging',
  'first_day', 'comeback_welcome', 'difficult_day', 'rest_day', 'daily_tip', 'daily_reflection',
  'progress_note', 'milestone_reached', 'encouragement_kept_going'
));
