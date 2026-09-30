-- Project You — core schema v1 (see docs/DATABASE.md).
-- Every table in public has RLS enabled. User tables are owner-only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile, goal, motivation, preferences
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  birth_year integer not null check (birth_year between 1900 and 2100),
  height_cm numeric(5, 1) not null check (height_cm between 120 and 230),
  sex text not null default 'unspecified' check (sex in ('female', 'male', 'unspecified')),
  activity_level text not null check (activity_level in ('sedentary', 'light', 'moderate', 'active')),
  life_status text check (life_status in ('student', 'employee', 'self_employed', 'unemployed', 'other')),
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('fat_loss', 'weight_loss', 'muscle_gain', 'recomposition', 'maintenance', 'fitness', 'performance')),
  start_weight_kg numeric(5, 1) not null check (start_weight_kg between 35 and 300),
  target_weight_kg numeric(5, 1) check (target_weight_kg between 35 and 300),
  target_date date,
  priorities jsonb not null default '{}'::jsonb check (jsonb_typeof(priorities) = 'object'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index goals_one_active_per_user on public.goals (user_id) where status = 'active';

create table public.motivations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  why text check (char_length(why) <= 500),
  change text check (char_length(change) <= 500),
  feel text check (char_length(feel) <= 500),
  quit_risk text check (char_length(quit_risk) <= 500),
  proud_of text check (char_length(proud_of) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Validated client-side with Zod (src/domain/profile/schemas.ts); shapes checked here.
  nutrition jsonb not null default '{}'::jsonb check (jsonb_typeof(nutrition) = 'object'),
  training jsonb not null default '{}'::jsonb check (jsonb_typeof(training) = 'object'),
  schedule jsonb not null default '{}'::jsonb check (jsonb_typeof(schedule) = 'object'),
  kitchen text[] not null default '{}',
  weekly_food_budget_cents integer check (weekly_food_budget_cents between 0 and 100000),
  currency text not null default 'EUR' check (currency = 'EUR'),
  motivation_style text not null default 'gentle' check (motivation_style in ('gentle', 'direct')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catalogues (shared, read-only for users)
-- ---------------------------------------------------------------------------

create table public.foods (
  id text primary key,
  name_fr text not null,
  name_en text not null,
  category text not null,
  kcal_100g numeric(6, 1) not null check (kcal_100g >= 0),
  protein_100g numeric(5, 1) not null check (protein_100g >= 0),
  carbs_100g numeric(5, 1) not null check (carbs_100g >= 0),
  fat_100g numeric(5, 1) not null check (fat_100g >= 0),
  allergens text[] not null default '{}',
  animal text check (animal in ('meat', 'fish', 'dairy', 'egg')),
  grams_per_piece numeric(6, 1),
  provider text not null,
  external_id text,
  source text not null,
  fetched_at timestamptz not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  is_mock boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id text primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  name_fr text not null,
  name_en text not null,
  slots text[] not null,
  ingredients jsonb not null check (jsonb_typeof(ingredients) = 'array'),
  minutes integer not null check (minutes between 0 and 600),
  difficulty smallint not null check (difficulty between 1 and 3),
  equipment text[] not null default '{}',
  steps jsonb not null check (jsonb_typeof(steps) = 'object'),
  substitutions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id text primary key,
  name_fr text not null,
  name_en text not null,
  pattern text not null,
  primary_muscles text[] not null,
  secondary_muscles text[] not null default '{}',
  equipment text[] not null,
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  cues jsonb not null,
  mistakes jsonb not null,
  media_url text,
  media_source text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Nutrition: inventory, meal plan, shopping, budget
-- ---------------------------------------------------------------------------

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id text references public.foods (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  quantity numeric(10, 2) not null check (quantity >= 0),
  unit text not null check (unit in ('g', 'ml', 'piece')),
  category text not null default 'other',
  expires_on date,
  nutrition jsonb,
  source text not null default 'manual' check (source in ('manual', 'barcode', 'receipt', 'photo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'snack', 'dinner')),
  recipe_id text not null references public.recipes (id),
  servings numeric(4, 2) not null check (servings > 0),
  ingredients jsonb not null check (jsonb_typeof(ingredients) = 'array'),
  status text not null default 'planned' check (status in ('planned', 'eaten', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id text references public.foods (id),
  name text not null,
  grams numeric(10, 1) not null check (grams > 0),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  -- Null = "Donnée indisponible". Only set from a real price source.
  estimated_cost_cents integer check (estimated_cost_cents >= 0),
  price_source text,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((estimated_cost_cents is null) = (price_source is null))
);

create table public.food_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents integer not null check (amount_cents between 0 and 1000000),
  currency text not null default 'EUR',
  spent_on date not null,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Training
-- ---------------------------------------------------------------------------

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  engine_version integer not null,
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid references public.workout_plans (id) on delete set null,
  session_index integer,
  scheduled_for date,
  variant text not null default 'full' check (variant in ('full', 'short', 'light')),
  location text check (location in ('gym', 'home', 'outdoor')),
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'skipped', 'rescheduled')),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.workout_sessions (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  set_index smallint not null check (set_index between 0 and 50),
  reps smallint check (reps between 0 and 1000),
  seconds smallint check (seconds between 0 and 3600),
  load_kg numeric(6, 2) check (load_kg between 0 and 1000),
  rpe numeric(3, 1) check (rpe between 1 and 10),
  notes text check (char_length(notes) <= 500),
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Progress and check-ins
-- ---------------------------------------------------------------------------

create table public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 25 and 400),
  source text not null default 'manual' check (source in ('manual', 'health')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  kind text not null check (kind in ('waist', 'hips', 'chest', 'arm', 'thigh', 'neck')),
  value_cm numeric(5, 1) not null check (value_cm between 10 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  taken_on date not null,
  pose text not null check (pose in ('front', 'side', 'back')),
  -- Path inside the private bucket progress-photos/<user_id>/...
  storage_path text not null check (storage_path like user_id::text || '/%'),
  created_at timestamptz not null default now()
);

create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  energy smallint check (energy between 1 and 5),
  motivation smallint check (motivation between 1 and 5),
  fatigue smallint check (fatigue between 1 and 5),
  available_minutes smallint check (available_minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, date)
);

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  sessions_done smallint,
  nutrition_rating smallint check (nutrition_rating between 1 and 5),
  fatigue smallint check (fatigue between 1 and 5),
  satisfaction smallint check (satisfaction between 1 and 5),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ---------------------------------------------------------------------------
-- Notifications, integrations, coach
-- ---------------------------------------------------------------------------

create table public.notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('training', 'meals', 'hydration', 'motivation', 'progress', 'weigh_in', 'shopping', 'calendar', 'promotions')),
  enabled boolean not null default true,
  quiet_start time,
  quiet_end time,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('calendar', 'health')),
  provider text not null check (provider in ('apple_calendar', 'google_calendar', 'healthkit', 'health_connect')),
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'revoked', 'error')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table public.coach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('disliked_food', 'refused_exercise', 'motivation_style', 'preferred_slot', 'equipment', 'habit')),
  value text not null check (char_length(value) <= 120),
  created_at timestamptz not null default now()
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 4000),
  structured_action jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes, triggers, RLS
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  owner_tables text[] := array[
    'profiles', 'goals', 'motivations', 'user_preferences', 'inventory_items', 'meal_plan_items',
    'shopping_list_items', 'food_expenses', 'workout_plans', 'workout_sessions', 'exercise_logs',
    'weight_logs', 'body_measurements', 'progress_photos', 'daily_checkins', 'weekly_reviews',
    'notification_preferences', 'integration_connections', 'coach_memory', 'ai_conversations', 'ai_messages'
  ];
begin
  foreach t in array owner_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
    if t not in ('profiles', 'motivations', 'user_preferences', 'notification_preferences') then
      execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'updated_at') then
      execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
      execute format('create index if not exists %I on public.%I (user_id, updated_at)', t || '_sync_idx', t);
    end if;
  end loop;
end;
$$;

-- An AI message must belong to one of the user's own conversations.
create policy ai_messages_own_conversation on public.ai_messages as restrictive for all to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

-- Catalogues: readable by signed-in users, writable only by service_role (no write policy).
alter table public.foods enable row level security;
alter table public.exercises enable row level security;
alter table public.recipes enable row level security;
create policy foods_read on public.foods for select to authenticated using (true);
create policy exercises_read on public.exercises for select to authenticated using (true);
create policy recipes_read on public.recipes for select to authenticated using (owner_id is null or owner_id = (select auth.uid()));
create policy recipes_insert_own on public.recipes for insert to authenticated with check (owner_id = (select auth.uid()));
create policy recipes_update_own on public.recipes for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy recipes_delete_own on public.recipes for delete to authenticated using (owner_id = (select auth.uid()));
create trigger set_updated_at before update on public.recipes for each row execute function public.set_updated_at();

-- anon gets nothing; authenticated gets table privileges filtered by RLS.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.foods, public.exercises from authenticated;
