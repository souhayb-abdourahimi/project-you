-- W-11 (D-046): what motivates the user, as zero, one or several reasons (multi-select), next to
-- the single main goal (public.goals.type). A reason only changes the coach's wording, never a
-- target. Additive and idempotent: existing rows get the empty list, nothing is rewritten.
-- public.motivations already has owner-only RLS (core migration, tested in supabase/tests/rls.sql).

alter table public.motivations
  add column if not exists reasons text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.motivations'::regclass and conname = 'motivations_reasons_known'
  ) then
    alter table public.motivations
      add constraint motivations_reasons_known check (
        reasons <@ array['weight', 'health', 'body_confidence', 'energy', 'strength', 'endurance', 'performance',
          'habits', 'mental', 'event']::text[]
        and cardinality(reasons) <= 10
      );
  end if;
end;
$$;
