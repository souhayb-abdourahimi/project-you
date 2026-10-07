-- W-8 (D-043): reminder preferences, mass unit, photo storage policies, foreign key indexes.
-- Run with `npm run test:db` after the migrations. Fails (non-zero exit) on the first violation.
\set ON_ERROR_STOP on
\o /dev/null

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'c@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@example.test');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.expect(condition boolean, message text) returns void language plpgsql as $$
begin
  if not condition then raise exception 'SETTINGS TEST FAILED: %', message; end if;
  raise notice 'ok - %', message;
end;
$$;

-- Reminder preferences of the account (the shape the app pushes).
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.notification_settings (user_id, enabled, max_per_day, quiet_enabled, quiet_start, quiet_end,
  meal_reminder_time, motivation_time, weigh_in_day, weigh_in_time, quote_personal_words, absence_reminders,
  celebrations, paused_until, categories)
values ('00000000-0000-0000-0000-0000000000c1', true, 2, false, '23:00', '06:30', '12:30', '08:00', 3, '07:45',
  false, true, true, '2026-10-20',
  '{"training": true, "meals": false, "weigh_in": true, "checkin": true, "progress": false, "milestones": true, "motivation": false, "shopping": true}');
select pg_temp.expect(
  (select quiet_enabled = false and categories ->> 'checkin' = 'true' and quiet_start = '23:00'::time
     from public.notification_settings),
  'owner stores the quiet hours switch and the categories');
-- Defaults of an account that never changed them: quiet hours on, categories decided by the app.
select pg_temp.expect(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'notification_settings' and column_name = 'quiet_enabled') = 'true',
  'quiet hours are on by default');
insert into public.user_preferences (user_id, weight_unit) values ('00000000-0000-0000-0000-0000000000c1', 'lb');
select pg_temp.expect((select weight_unit from public.user_preferences) = 'lb', 'owner stores the mass unit');
commit;

begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.expect((select count(*) from public.notification_settings) = 0, 'D cannot read C reminder preferences');
select pg_temp.expect((select count(*) from public.user_preferences) = 0, 'D cannot read C mass unit');
with u as (update public.notification_settings set enabled = false returning 1)
  select pg_temp.expect((select count(*) from u) = 0, 'D cannot change C reminder preferences');
commit;

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true);
  begin
    insert into public.user_preferences (user_id, weight_unit) values ('00000000-0000-0000-0000-0000000000d1', 'stone');
    raise exception 'SETTINGS TEST FAILED: unknown mass unit accepted';
  exception when check_violation then
    raise notice 'ok - only kg and lb are accepted';
  end;
  begin
    insert into public.notification_settings (user_id, categories) values ('00000000-0000-0000-0000-0000000000d1', '[true]');
    raise exception 'SETTINGS TEST FAILED: categories as an array accepted';
  exception when check_violation then
    raise notice 'ok - categories are an object';
  end;
end;
$$;

-- Photo storage: private bucket, each user under its own folder only.
select pg_temp.expect(
  (select public = false from storage.buckets where id = 'progress-photos'),
  'bucket progress-photos exists and is private');

begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into storage.objects (bucket_id, name, owner)
  values ('progress-photos', '00000000-0000-0000-0000-0000000000c1/2026-10-07/front.jpg', '00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect((select count(*) from storage.objects) = 1, 'owner uploads and reads own photo');
commit;

begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.expect((select count(*) from storage.objects) = 0, 'D cannot list C photos');
with d as (delete from storage.objects returning 1)
  select pg_temp.expect((select count(*) from d) = 0, 'D cannot delete C photos');
with u as (update storage.objects set name = '00000000-0000-0000-0000-0000000000d1/x.jpg' returning 1)
  select pg_temp.expect((select count(*) from u) = 0, 'D cannot move C photos');
commit;

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true);
  begin
    insert into storage.objects (bucket_id, name) values ('progress-photos', '00000000-0000-0000-0000-0000000000c1/fake.jpg');
    raise exception 'SETTINGS TEST FAILED: D wrote into C photo folder';
  exception when insufficient_privilege then
    raise notice 'ok - D cannot upload into C folder';
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('progress-photos', 'loose.jpg');
    raise exception 'SETTINGS TEST FAILED: photo outside any user folder accepted';
  exception when insufficient_privilege then
    raise notice 'ok - a photo must be under the user folder';
  end;
end;
$$;

begin;
set local role anon;
do $$
begin
  if (select count(*) from storage.objects) <> 0 then raise exception 'SETTINGS TEST FAILED: anon reads photos'; end if;
  raise notice 'ok - anonymous visitors see no photo';
exception when insufficient_privilege then
  raise notice 'ok - anonymous visitors see no photo';
end;
$$;
commit;

-- Foreign key indexes (advisor): the two added, the one left on purpose.
select pg_temp.expect(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'recipes_owner_id_idx'),
  'recipes.owner_id is indexed');
select pg_temp.expect(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ai_messages_conversation_id_idx'),
  'ai_messages.conversation_id is indexed');

-- The migration can run twice (an operator re-running the SQL Editor script).
\i supabase/migrations/20261007000002_settings_contract.sql
select pg_temp.expect(
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'progress_photos_%') = 4,
  'migration is idempotent (four photo policies)');

-- Account deletion removes the preferences with the rest.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.expect(
  not exists (select 1 from public.notification_settings where user_id = '00000000-0000-0000-0000-0000000000c1')
    and not exists (select 1 from public.user_preferences where user_id = '00000000-0000-0000-0000-0000000000c1'),
  'account deletion removes reminder preferences and mass unit');
