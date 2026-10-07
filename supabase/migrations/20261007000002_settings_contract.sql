-- W-8 (D-043): settings contract, photo storage, foreign key indexes.
-- Additive only. Nothing existing is dropped or rewritten; safe to run once after
-- 20261007000001_decision_revision.sql. Order of deployment: this migration, then the app version.
--
-- 1. notification_settings: the reminder preferences become the account's (synced). The table
--    exists since 20261001000002 (one row per user, owner-only RLS, deleted with the account);
--    two columns are added: the quiet hours switch and the per-category switches (the categories
--    shown by the app: training, meals, weigh_in, checkin, progress, milestones, motivation,
--    shopping). `notification_preferences` (one row per category, never written) stays as is:
--    legacy, exported, deleted with the account.
-- 2. user_preferences.weight_unit: how masses are shown and typed (kg | lb). Every stored value
--    stays in kg; the app converts at display and entry only. Pushed by the app only once the
--    user chose a unit, so an app without W-8 keeps working.
-- 3. Storage bucket `progress-photos` (private) and its policies: a user reads and writes only
--    under `<user_id>/…`, the path convention of `progress_photos.storage_path` (core migration)
--    and of the `delete-account` Edge Function. The app does not upload photos yet. Skipped on a
--    database without the Storage schema (plain Postgres of the tests runs a stub of it).
-- 4. Indexes on two foreign keys reported by the Supabase advisor, each on a real path:
--    - recipes.owner_id: RLS read policy (owner_id = auth.uid()), the Privacy Center export
--      (owner_id is not null) and the cascade when an account is deleted;
--    - ai_messages.conversation_id: the cascade when a conversation (or the account) is deleted,
--      and reading a conversation's messages.
--    Not indexed on purpose: workout_sessions.plan_id (always null, `workout_plans` is never
--    written; the column is a removal candidate, docs/DATABASE.md). Indexes reported "unused" by
--    the advisor are kept: the database has little traffic yet.
--
-- RLS: unchanged for public tables (new columns inherit the owner-only policies). Export: the
-- columns are in their table's rows. Deletion: notification_settings and user_preferences are
-- deleted with the account (on delete cascade); photos by `delete-account`.

-- 1. Reminder preferences -------------------------------------------------------------------
alter table public.notification_settings
  add column if not exists quiet_enabled boolean not null default true,
  add column if not exists categories jsonb not null default '{}'::jsonb;

alter table public.notification_settings drop constraint if exists notification_settings_categories_object;
alter table public.notification_settings
  add constraint notification_settings_categories_object check (jsonb_typeof(categories) = 'object');

-- 2. Mass unit -------------------------------------------------------------------------------
alter table public.user_preferences
  add column if not exists weight_unit text not null default 'kg';

alter table public.user_preferences drop constraint if exists user_preferences_weight_unit_check;
alter table public.user_preferences
  add constraint user_preferences_weight_unit_check check (weight_unit in ('kg', 'lb'));

-- 3. Photo storage ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Storage schema absent: bucket progress-photos not created';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('progress-photos', 'progress-photos', false, 10485760,
          array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
  on conflict (id) do update set public = false;

  drop policy if exists progress_photos_select_own on storage.objects;
  drop policy if exists progress_photos_insert_own on storage.objects;
  drop policy if exists progress_photos_update_own on storage.objects;
  drop policy if exists progress_photos_delete_own on storage.objects;

  create policy progress_photos_select_own on storage.objects for select to authenticated
    using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
  create policy progress_photos_insert_own on storage.objects for insert to authenticated
    with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
  create policy progress_photos_update_own on storage.objects for update to authenticated
    using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
    with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
  create policy progress_photos_delete_own on storage.objects for delete to authenticated
    using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
end;
$$;

-- 4. Foreign key indexes ---------------------------------------------------------------------
create index if not exists recipes_owner_id_idx on public.recipes (owner_id);
create index if not exists ai_messages_conversation_id_idx on public.ai_messages (conversation_id);
