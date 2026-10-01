-- Notification channel of the Transformation Journey Engine (docs/NOTIFICATIONS.md, docs/DECISIONS.md D-024).
-- 1. notification_settings: one row per user, the engine's global preferences (per-category
--    switches stay in notification_preferences).
-- 2. notification_history: messages scheduled for the user, for anti-repetition across devices
--    and to explain later why a message was sent. Template ids and facts only, never the rendered
--    text: the user's own words stay in public.motivations.
-- Both tables: owner-only RLS, deleted with the account (on delete cascade).

create table public.notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  max_per_day smallint not null default 3 check (max_per_day between 1 and 6),
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:30',
  meal_reminder_time time not null default '12:00',
  motivation_time time not null default '08:30',
  weigh_in_day smallint not null default 1 check (weigh_in_day between 1 and 7),
  weigh_in_time time not null default '08:00',
  quote_personal_words boolean not null default true,
  absence_reminders boolean not null default true,
  celebrations boolean not null default true,
  paused_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- `${date}:${trigger}` on the device; unique per user so a re-plan upserts instead of duplicating.
  client_id text not null check (client_id ~ '^\d{4}-\d{2}-\d{2}:[a-z_]{1,40}$'),
  trigger text not null check (trigger in (
    'session_planned', 'session_planned_tired', 'meal_planned', 'weigh_in', 'shopping',
    'weekly_progress', 'weekly_checkin', 'success_session', 'success_streak',
    'absence_gentle', 'absence_comeback', 'absence_last', 'fatigue_recovery', 'daily_why',
    'safety_low_intake', 'safety_fast_loss', 'safety_training_load'
  )),
  category text not null check (category in ('training', 'meals', 'weigh_in', 'shopping', 'progress', 'motivation', 'calendar')),
  -- `trigger|title|slot.anchor|action|meaning`: catalog ids, no free text.
  template_id text not null check (template_id ~ '^[a-z_]+\|[a-z0-9_]+\|[a-z]+\.[a-z0-9_]+\|[a-z0-9_]+\|[a-z0-9_]+$'),
  anchor_slot text not null check (anchor_slot in ('why', 'change', 'feel', 'private', 'none', 'care')),
  local_date date not null,
  local_time time not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'delivered', 'opened')),
  -- Small, non-personal facts (episode start, streak length…). Bounded to keep free text out.
  facts jsonb not null default '{}'::jsonb check (jsonb_typeof(facts) = 'object' and pg_column_size(facts) <= 512),
  scheduled_at timestamptz not null default now(),
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id),
  check (status <> 'opened' or opened_at is not null)
);

create index notification_history_user_date_idx on public.notification_history (user_id, local_date desc);
create index notification_history_sync_idx on public.notification_history (user_id, updated_at);

create trigger set_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.notification_history
  for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['notification_settings', 'notification_history'] loop
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

-- History is kept 90 days (same rule as the device). Callable by the owner or a scheduled job.
create or replace function public.prune_notification_history(keep_days integer default 90)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with gone as (
    delete from public.notification_history
    where local_date < (current_date - keep_days)
      and user_id = (select auth.uid())
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.prune_notification_history(integer) from public, anon;
grant execute on function public.prune_notification_history(integer) to authenticated;
