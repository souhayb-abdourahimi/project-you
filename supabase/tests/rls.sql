-- RLS isolation tests. Run with `npm run test:db`. Fails (non-zero exit) on the first violation.
\set ON_ERROR_STOP on
\o /dev/null

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

insert into public.foods (id, name_fr, name_en, category, kcal_100g, protein_100g, carbs_100g, fat_100g, provider, source, fetched_at, confidence, is_mock)
values ('rice', 'Riz', 'Rice', 'grain', 355, 7, 78, 0.6, 'project-you-mock', 'MOCK', now(), 'low', true);

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.expect(condition boolean, message text) returns void language plpgsql as $$
begin
  if not condition then raise exception 'RLS TEST FAILED: %', message; end if;
  raise notice 'ok - %', message;
end;
$$;

-- User A writes personal data.
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.profiles (user_id, display_name, birth_year, height_cm, activity_level)
  values ('00000000-0000-0000-0000-00000000000a', 'A', 2000, 175, 'light');
insert into public.weight_logs (user_id, measured_on, weight_kg) values ('00000000-0000-0000-0000-00000000000a', '2026-09-30', 75);
insert into public.motivations (user_id, why) values ('00000000-0000-0000-0000-00000000000a', 'secret reason');
insert into public.inventory_items (user_id, food_id, name, quantity, unit) values ('00000000-0000-0000-0000-00000000000a', 'rice', 'Riz', 500, 'g');
insert into public.ai_conversations (id, user_id) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.weight_logs) = 1, 'owner reads own weight');
select pg_temp.expect((select count(*) from public.foods) = 1, 'authenticated user reads the food catalogue');
commit;

-- User B cannot see or touch A's data.
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.profiles) = 0, 'B cannot read A profile');
select pg_temp.expect((select count(*) from public.weight_logs) = 0, 'B cannot read A weight');
select pg_temp.expect((select count(*) from public.motivations) = 0, 'B cannot read A motivation');
select pg_temp.expect((select count(*) from public.inventory_items) = 0, 'B cannot read A inventory');
with u as (update public.weight_logs set weight_kg = 1 returning 1) select pg_temp.expect((select count(*) from u) = 0, 'B cannot update A weight');
with d as (delete from public.inventory_items returning 1) select pg_temp.expect((select count(*) from d) = 0, 'B cannot delete A inventory');
commit;

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
  begin
    insert into public.weight_logs (user_id, measured_on, weight_kg) values ('00000000-0000-0000-0000-00000000000a', '2026-09-30', 60);
    raise exception 'RLS TEST FAILED: B inserted a row for A';
  exception when insufficient_privilege then
    raise notice 'ok - B cannot insert rows owned by A';
  end;
  begin
    insert into public.ai_messages (conversation_id, user_id, role, content)
      values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000b', 'user', 'hi');
    raise exception 'RLS TEST FAILED: B wrote into A conversation';
  exception when insufficient_privilege then
    raise notice 'ok - B cannot write into A conversation';
  end;
  begin
    insert into public.foods (id, name_fr, name_en, category, kcal_100g, protein_100g, carbs_100g, fat_100g, provider, source, fetched_at, confidence)
      values ('fake', 'Faux', 'Fake', 'grain', 1, 1, 1, 1, 'x', 'x', now(), 'low');
    raise exception 'RLS TEST FAILED: user wrote into the food catalogue';
  exception when insufficient_privilege then
    raise notice 'ok - users cannot write the food catalogue';
  end;
end;
$$;

-- Anonymous visitors see nothing.
begin;
set local role anon;
do $$
begin
  perform count(*) from public.weight_logs;
  raise exception 'RLS TEST FAILED: anon can query weight_logs';
exception when insufficient_privilege then
  raise notice 'ok - anon has no access to personal tables';
end;
$$;
commit;

-- Every public table has RLS enabled.
select pg_temp.expect(
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  'RLS enabled on every public table'
);

-- ---------------------------------------------------------------------------
-- Full audit: every table holding user data, every operation.
-- ---------------------------------------------------------------------------

-- Seed one row for A in every owner table (as the test superuser, bypassing RLS).
reset role;
insert into public.goals (id, user_id, type, start_weight_kg) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a', 'fat_loss', 80);
insert into public.user_preferences (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.meal_plan_items (user_id, date, slot, recipe_id, servings, ingredients) values ('00000000-0000-0000-0000-00000000000a', '2026-09-30', 'lunch', 'lentil_curry', 1, '[]');
insert into public.shopping_list_items (user_id, food_id, name, grams) values ('00000000-0000-0000-0000-00000000000a', 'rice', 'Riz', 500);
insert into public.food_expenses (user_id, amount_cents, spent_on) values ('00000000-0000-0000-0000-00000000000a', 1234, '2026-09-30');
insert into public.workout_plans (id, user_id, week_start, engine_version, plan) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', '2026-09-28', 1, '{}');
insert into public.workout_sessions (id, user_id, plan_id) values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000e1');
insert into public.exercise_logs (user_id, session_id, exercise_id, set_index, reps) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000e2', 'goblet_squat', 0, 10);
insert into public.body_measurements (user_id, measured_on, kind, value_cm) values ('00000000-0000-0000-0000-00000000000a', '2026-09-30', 'waist', 85);
insert into public.progress_photos (user_id, taken_on, pose, storage_path) values ('00000000-0000-0000-0000-00000000000a', '2026-09-30', 'front', '00000000-0000-0000-0000-00000000000a/1.jpg');
insert into public.daily_checkins (user_id, date, energy) values ('00000000-0000-0000-0000-00000000000a', '2026-09-30', 3);
insert into public.weekly_reviews (user_id, week_start) values ('00000000-0000-0000-0000-00000000000a', '2026-09-28');
insert into public.notification_preferences (user_id, category) values ('00000000-0000-0000-0000-00000000000a', 'training');
insert into public.notification_settings (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.notification_history (user_id, client_id, trigger, category, template_id, anchor_slot, local_date, local_time, status, facts)
  values ('00000000-0000-0000-0000-00000000000a', '2026-06-01:daily_why', 'daily_why', 'motivation', 'daily_why|v1|why.v1|v1|v1', 'why', '2026-06-01', '08:30', 'delivered', '{}');
insert into public.integration_connections (user_id, kind, provider) values ('00000000-0000-0000-0000-00000000000a', 'calendar', 'google_calendar');
insert into public.coach_memory (user_id, kind, value) values ('00000000-0000-0000-0000-00000000000a', 'disliked_food', 'brocoli');
insert into public.ai_messages (conversation_id, user_id, role, content) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'user', 'hello');

do $$
declare
  t text;
  n bigint;
  owner_tables text[];
begin
  select array_agg(c.table_name::text order by c.table_name) into owner_tables
  from information_schema.columns c
  join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
  where c.table_schema = 'public' and c.column_name = 'user_id' and tb.table_type = 'BASE TABLE';

  foreach t in array owner_tables loop
    -- Structure: RLS on, one owner policy per command, none open to everyone.
    if not (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass) then
      raise exception 'RLS TEST FAILED: RLS disabled on %', t;
    end if;
    if (select count(distinct cmd) from pg_policies
        where schemaname = 'public' and tablename = t and permissive = 'PERMISSIVE'
          and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
          and coalesce(qual, with_check) like '%auth.uid()%user_id%') <> 4 then
      raise exception 'RLS TEST FAILED: % lacks an owner policy for select/insert/update/delete', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
               and (qual = 'true' or with_check = 'true' or 'public' = any(roles) or 'anon' = any(roles))) then
      raise exception 'RLS TEST FAILED: % has a policy open to everyone or to anon', t;
    end if;
    if has_table_privilege('anon', format('public.%I', t), 'select') then
      raise exception 'RLS TEST FAILED: anon has a privilege on %', t;
    end if;

    -- Behaviour, as A: the seeded row is visible.
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
    execute format('select count(*) from public.%I', t) into n;
    if n = 0 then raise exception 'RLS TEST FAILED: A cannot read own %', t; end if;

    -- As B: nothing to read, update or delete.
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'RLS TEST FAILED: B reads A rows in %', t; end if;
    execute format('with u as (update public.%I set user_id = user_id returning 1) select count(*) from u', t) into n;
    if n <> 0 then raise exception 'RLS TEST FAILED: B updates A rows in %', t; end if;
    execute format('with d as (delete from public.%I returning 1) select count(*) from d', t) into n;
    if n <> 0 then raise exception 'RLS TEST FAILED: B deletes A rows in %', t; end if;
    perform set_config('role', 'postgres', true);
    raise notice 'ok - % isolated (select/update/delete by B, anon, policies)', t;
  end loop;

  -- A cannot move a row to B (update with check).
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
  begin
    update public.weight_logs set user_id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'RLS TEST FAILED: A reassigned a row to B';
  exception when insufficient_privilege then
    raise notice 'ok - A cannot hand a row over to B';
  end;

  -- B cannot attach rows to A's plan or session.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
  begin
    insert into public.workout_sessions (user_id, plan_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000e1');
    raise exception 'RLS TEST FAILED: B attached a session to A plan';
  exception when insufficient_privilege then
    raise notice 'ok - B cannot attach a session to A plan';
  end;
  begin
    insert into public.exercise_logs (user_id, session_id, exercise_id, set_index) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000e2', 'goblet_squat', 0);
    raise exception 'RLS TEST FAILED: B attached a set to A session';
  exception when insufficient_privilege then
    raise notice 'ok - B cannot attach a set to A session';
  end;
  perform set_config('role', 'postgres', true);
end;
$$;

-- User recipes are owned through owner_id (not user_id): same isolation, checked explicitly.
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.recipes (id, owner_id, name_fr, name_en, slots, ingredients, minutes, difficulty, steps)
  values ('a-own-recipe', '00000000-0000-0000-0000-00000000000a', 'Recette A', 'Recipe A', '{lunch}', '[]', 10, 1, '{}');
select pg_temp.expect((select count(*) from public.recipes where id = 'a-own-recipe') = 1, 'owner reads own recipe');
commit;
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.recipes where id = 'a-own-recipe') = 0, 'B cannot read A recipe');
update public.recipes set name_fr = 'pwned' where id = 'a-own-recipe';
delete from public.recipes where id = 'a-own-recipe';
do $$
begin
  insert into public.recipes (id, owner_id, name_fr, name_en, slots, ingredients, minutes, difficulty, steps)
    values ('b-as-a', '00000000-0000-0000-0000-00000000000a', 'x', 'x', '{lunch}', '[]', 10, 1, '{}');
  raise exception 'RLS TEST FAILED: B created a recipe owned by A';
exception when insufficient_privilege then
  raise notice 'ok - B cannot create a recipe owned by A';
end;
$$;
commit;
reset role;
select pg_temp.expect((select name_fr from public.recipes where id = 'a-own-recipe') = 'Recette A', 'B cannot modify or delete A recipe');

-- Anonymous: every public table is closed, catalogues included.
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    if has_table_privilege('anon', format('public.%I', t), 'select')
       or has_table_privilege('anon', format('public.%I', t), 'insert')
       or has_table_privilege('anon', format('public.%I', t), 'update')
       or has_table_privilege('anon', format('public.%I', t), 'delete') then
      raise exception 'RLS TEST FAILED: anon has privileges on %', t;
    end if;
  end loop;
  raise notice 'ok - anon has no privilege on any public table';
end;
$$;

-- Notification engine tables (D-024): content checks and the owner-only prune function.
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.notification_history (user_id, client_id, trigger, category, template_id, anchor_slot, local_date, local_time, facts)
  values ('00000000-0000-0000-0000-00000000000a', '2026-09-30:absence_gentle', 'absence_gentle', 'motivation', 'absence_gentle|v1|change.v2|v1|v2', 'change', current_date, '08:30', '{"since":"2026-09-28","days":"2"}');
insert into public.notification_history (user_id, client_id, trigger, category, template_id, anchor_slot, local_date, local_time)
  values ('00000000-0000-0000-0000-00000000000a', '2026-09-30:absence_gentle', 'absence_gentle', 'motivation', 'absence_gentle|v2|change.v1|v2|v1', 'change', current_date, '09:30')
  on conflict (user_id, client_id) do update set template_id = excluded.template_id, local_time = excluded.local_time;
select pg_temp.expect((select count(*) from public.notification_history where client_id = '2026-09-30:absence_gentle') = 1, 'a re-plan upserts the same history entry');
select pg_temp.expect(public.prune_notification_history(90) = 1, 'owner prunes own history older than 90 days');
select pg_temp.expect((select count(*) from public.notification_history) = 1, 'recent history is kept');
commit;

begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.notification_history (user_id, client_id, trigger, category, template_id, anchor_slot, local_date, local_time)
  values ('00000000-0000-0000-0000-00000000000b', '2020-01-01:daily_why', 'daily_why', 'motivation', 'daily_why|v1|none.v1|v1|v1', 'none', '2020-01-01', '08:30');
select pg_temp.expect(public.prune_notification_history(90) = 1, 'B prunes only own history');
reset role;
select pg_temp.expect((select count(*) from public.notification_history where user_id = '00000000-0000-0000-0000-00000000000a') = 1, 'prune by B leaves A history untouched');
commit;

do $$
begin
  begin
    insert into public.notification_history (user_id, client_id, trigger, category, template_id, anchor_slot, local_date, local_time)
      values ('00000000-0000-0000-0000-00000000000a', '2026-09-30:daily_why', 'daily_why', 'motivation', 'Tu as commencé pour perdre 10 kg', 'why', '2026-09-30', '08:30');
    raise exception 'TEST FAILED: free text accepted as template_id';
  exception when check_violation then
    raise notice 'ok - history stores template ids, never message text';
  end;
  begin
    insert into public.notification_history (user_id, client_id, trigger, category, template_id, anchor_slot, local_date, local_time, facts)
      values ('00000000-0000-0000-0000-00000000000a', '2026-09-30:daily_why', 'daily_why', 'motivation', 'daily_why|v1|why.v1|v1|v1', 'why', '2026-09-30', '08:30', jsonb_build_object('note', repeat('x', 600)));
    raise exception 'TEST FAILED: large facts accepted';
  exception when check_violation then
    raise notice 'ok - history facts stay small';
  end;
  begin
    insert into public.notification_settings (user_id, max_per_day) values ('00000000-0000-0000-0000-00000000000b', 20);
    raise exception 'TEST FAILED: max_per_day 20 accepted';
  exception when check_violation then
    raise notice 'ok - daily cap bounded';
  end;
end;
$$;

-- Deleting the auth user cascades to all personal data.
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$
declare
  t text;
  n bigint;
begin
  for t in select c.table_name from information_schema.columns c where c.table_schema = 'public' and c.column_name = 'user_id' loop
    execute format('select count(*) from public.%I where user_id = %L', t, '00000000-0000-0000-0000-00000000000a') into n;
    if n <> 0 then raise exception 'RLS TEST FAILED: account deletion left rows in %', t; end if;
  end loop;
  raise notice 'ok - account deletion cascades to every user table';
  if exists (select 1 from public.recipes where owner_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'RLS TEST FAILED: account deletion left recipes';
  end if;
end;
$$;

