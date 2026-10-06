-- Workout Coach Engine, W-3: the session experience (docs/DECISIONS.md D-034;
-- docs/TRAINING_ARCHITECTURE.md §7).
--
-- One new table, nothing rewritten:
--   workout_sessions
--     ├─ planned_exercises (unchanged: the prescription stays as given)
--     └─ exercise_reports (new: what the user declared about one prescribed exercise of the
--        session: "je ne fais pas cet exercice" and its reason, and the felt difficulty)
--
-- Planned ≠ done: a prescribed exercise not performed keeps its planned row; the fact lives here.
-- Felt difficulty of the session stays in workout_sessions.difficulty (W-1); daily fatigue stays in
-- daily_checkins (Journey). A session stopped early is `completed` with an `outcome_reason`.
-- Sets removed by a correction are soft-deleted in exercise_logs (deleted_at, already present).

create table public.exercise_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  -- The prescribed exercise the report is about (stable id of the exercise catalogue).
  exercise_id text not null check (exercise_id ~ '^[a-z0-9_:-]{1,64}$'),
  planned_exercise_id uuid references public.planned_exercises (id) on delete set null,
  not_performed boolean not null default false,
  -- Same closed list as REPLACEMENT_REASONS (src/domain/training/replacement.ts).
  not_performed_reason text check (not_performed_reason in (
    'dislike', 'cant_do', 'no_equipment', 'easier', 'harder',
    'busy_equipment', 'discomfort', 'too_hard_today', 'no_time', 'preference', 'other'
  )),
  -- Declared by the user, in words: 1 very easy … 5 very hard.
  difficulty smallint check (difficulty between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (session_id, exercise_id),
  check (not_performed_reason is null or not_performed),
  -- A report always says something.
  check (not_performed or difficulty is not null)
);

create index exercise_reports_sync_idx on public.exercise_reports (user_id, updated_at);
create index exercise_reports_session_idx on public.exercise_reports (session_id);
create index exercise_reports_planned_idx on public.exercise_reports (planned_exercise_id);

create trigger set_updated_at before update on public.exercise_reports
  for each row execute function public.set_updated_at();
alter table public.exercise_reports enable row level security;
create policy exercise_reports_select_own on public.exercise_reports for select to authenticated
  using ((select auth.uid()) = user_id);
create policy exercise_reports_insert_own on public.exercise_reports for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy exercise_reports_update_own on public.exercise_reports for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy exercise_reports_delete_own on public.exercise_reports for delete to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.exercise_reports from anon;
grant select, insert, update, delete on public.exercise_reports to authenticated;

-- A report can only point to a session and a prescription of the same user (same rule as exercise_logs).
create policy exercise_reports_own_session on public.exercise_reports as restrictive for all to authenticated
  using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy exercise_reports_own_prescription on public.exercise_reports as restrictive for all to authenticated
  using (planned_exercise_id is null or exists (select 1 from public.planned_exercises p where p.id = planned_exercise_id and p.user_id = (select auth.uid())))
  with check (planned_exercise_id is null or exists (select 1 from public.planned_exercises p where p.id = planned_exercise_id and p.user_id = (select auth.uid())));
