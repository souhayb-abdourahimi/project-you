-- Sync hardening (docs/DECISIONS.md D-014, docs/AUDIT.md).
-- 1. User rows reference the client catalogues (foods, recipes, exercises) by text id without a
--    foreign key: the catalogues ship with the app (MOCK today, CIQUAL later, ids will change) and
--    are not seeded server-side, so the FKs made every inventory / meal / set sync fail.
-- 2. A user can no longer attach rows to another user's plan or session (a cascade from B's
--    delete would have removed A's logs).
-- 3. Tables created by later migrations get no anon privileges by default.
-- 4. Missing sync columns (deleted_at on weekly_reviews, updated_at index on exercise_logs).

alter table public.inventory_items drop constraint if exists inventory_items_food_id_fkey;
alter table public.shopping_list_items drop constraint if exists shopping_list_items_food_id_fkey;
alter table public.meal_plan_items drop constraint if exists meal_plan_items_recipe_id_fkey;
alter table public.exercise_logs drop constraint if exists exercise_logs_exercise_id_fkey;

alter table public.inventory_items add constraint inventory_items_food_id_format check (food_id ~ '^[a-z0-9_:-]{1,64}$');
alter table public.shopping_list_items add constraint shopping_list_items_food_id_format check (food_id ~ '^[a-z0-9_:-]{1,64}$');
alter table public.meal_plan_items add constraint meal_plan_items_recipe_id_format check (recipe_id ~ '^[a-z0-9_:-]{1,64}$');
alter table public.exercise_logs add constraint exercise_logs_exercise_id_format check (exercise_id ~ '^[a-z0-9_:-]{1,64}$');

-- One log row per set: lets the client upsert idempotently.
alter table public.exercise_logs add constraint exercise_logs_session_set_unique unique (session_id, exercise_id, set_index);

create policy workout_sessions_own_plan on public.workout_sessions as restrictive for all to authenticated
  using (plan_id is null or exists (select 1 from public.workout_plans p where p.id = plan_id and p.user_id = (select auth.uid())))
  with check (plan_id is null or exists (select 1 from public.workout_plans p where p.id = plan_id and p.user_id = (select auth.uid())));

create policy exercise_logs_own_session on public.exercise_logs as restrictive for all to authenticated
  using (session_id is null or exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())))
  with check (session_id is null or exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())));

alter table public.weekly_reviews add column if not exists deleted_at timestamptz;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
