-- W-10: meals the user adds outside the plan (a photo estimate or a meal composed by hand), saved
-- only after an explicit confirmation (docs/MEAL_PHOTO_ANALYSIS.md).
-- Only catalogue food ids and grams are stored, with the Ciqual estimate computed by the app at the
-- time of saving. Never the photo, never a label typed by the vision service.
-- Owner-only RLS, no anon privilege, deleted with the account (on delete cascade).

create table public.logged_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  eaten_on date not null,
  slot text check (slot in ('breakfast', 'lunch', 'snack', 'dinner')),
  source text not null check (source in ('photo_estimate', 'manual')),
  -- [{ "food_id": "chicken_breast", "grams": 150 }, …], 1 to 12 items.
  items jsonb not null check (
    jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 12
  ),
  kcal numeric(6, 1) not null check (kcal >= 0 and kcal < 10000),
  protein_g numeric(6, 1) not null check (protein_g >= 0 and protein_g < 1000),
  carbs_g numeric(6, 1) not null check (carbs_g >= 0 and carbs_g < 1000),
  fat_g numeric(6, 1) not null check (fat_g >= 0 and fat_g < 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index logged_meals_sync_idx on public.logged_meals (user_id, updated_at);
create index logged_meals_user_day_idx on public.logged_meals (user_id, eaten_on);

create trigger set_updated_at before update on public.logged_meals
  for each row execute function public.set_updated_at();

alter table public.logged_meals enable row level security;
create policy logged_meals_select_own on public.logged_meals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy logged_meals_insert_own on public.logged_meals for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy logged_meals_update_own on public.logged_meals for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy logged_meals_delete_own on public.logged_meals for delete to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.logged_meals from anon;
grant select, insert, update, delete on public.logged_meals to authenticated;
