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

-- W-11 (D-046): motivation reasons, a multi-select stored with the owner's other motivation answers.
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'e@example.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'f@example.test');
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into public.motivations (user_id, why, reasons)
  values ('00000000-0000-0000-0000-0000000000e1', null, array['weight', 'health', 'energy']);
select pg_temp.expect(
  (select reasons = array['weight', 'health', 'energy'] from public.motivations),
  'owner stores several motivation reasons');
update public.motivations set reasons = '{}';
select pg_temp.expect((select cardinality(reasons) = 0 from public.motivations), 'owner clears the reasons');
commit;

begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((select count(*) from public.motivations) = 0, 'F cannot read E motivation reasons');
with u as (update public.motivations set reasons = array['health'] returning 1)
  select pg_temp.expect((select count(*) from u) = 0, 'F cannot change E motivation reasons');
commit;

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true);
  begin
    insert into public.motivations (user_id, reasons) values ('00000000-0000-0000-0000-0000000000f1', array['lose_10kg']);
    raise exception 'SETTINGS TEST FAILED: unknown motivation reason accepted';
  exception when check_violation then
    raise notice 'ok - an unknown motivation reason is refused';
  end;
end;
$$;

reset role;
-- Applying the migration again changes nothing (it is pasted by hand in the SQL editor).
\i supabase/migrations/20261025000001_motivation_reasons.sql
select pg_temp.expect(
  (select count(*) from pg_constraint where conname = 'motivations_reasons_known') = 1,
  'motivation reasons migration is idempotent');
select pg_temp.expect(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'motivations' and column_name = 'reasons') = '''{}''::text[]',
  'existing accounts read as "no reason given"');

-- iCal link (D-049): only times are stored, never what the events are; owner-only; re-runnable.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'g@example.test');
select pg_temp.expect(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
    where table_schema = 'public' and table_name = 'calendar_feeds')
  = array['busy', 'busy_from', 'busy_to', 'created_at', 'enabled', 'event_count', 'last_error', 'last_synced_at',
          'status', 'updated_at', 'url_ciphertext', 'url_host', 'user_id'],
  'calendar_feeds holds no title, description, location or attendee column');
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2"}', true);
  insert into public.calendar_feeds (user_id, url_ciphertext, url_host)
    values ('00000000-0000-0000-0000-0000000000f2', 'v1:aaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbb', 'edt.example.test');
  begin
    update public.calendar_feeds set busy = '{"start":"x"}'::jsonb;
    raise exception 'SETTINGS TEST FAILED: busy accepted a non-array';
  exception when check_violation then
    raise notice 'ok - busy is always a list of ranges';
  end;
  begin
    update public.calendar_feeds set last_error = 'something else';
    raise exception 'SETTINGS TEST FAILED: unknown feed error accepted';
  exception when check_violation then
    raise notice 'ok - feed errors are a closed list';
  end;
  delete from public.calendar_feeds;
  if exists (select 1 from public.calendar_feeds) then
    raise exception 'SETTINGS TEST FAILED: the owner could not delete their link';
  end if;
  raise notice 'ok - the owner deletes their link and its busy times';
  perform set_config('role', 'postgres', true);
end;
$$;
reset role;
\i supabase/migrations/20261026000001_calendar_feeds.sql
select pg_temp.expect(
  (select count(*) from pg_policies where tablename = 'calendar_feeds') = 4,
  'calendar feeds migration is idempotent');
