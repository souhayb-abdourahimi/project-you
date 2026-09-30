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

-- Deleting the auth user cascades to all personal data.
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from public.weight_logs) = 0 and (select count(*) from public.motivations) = 0, 'account deletion cascades');
