-- D-049: an iCal (ICS) link the user pastes so their busy times constrain session planning on the
-- web app (no EventKit there). One feed per user. Written only through the `calendar-feed` Edge
-- Function, which fetches and parses the feed server side (SSRF guards, docs/CALENDAR_FEED.md).
--
-- Stored, and nothing more:
-- - the link, encrypted by the function (AES-GCM, secret CALENDAR_FEED_KEY): it often carries a
--   personal token, so it is never stored in clear, never returned, never logged;
-- - its host name only, to show which calendar is linked;
-- - normalised busy ranges (start, end, all-day) for a few weeks: never a title, description,
--   location, organiser or attendee.
-- Owner-only RLS, no anon privilege, deleted with the account (on delete cascade), exported and
-- deletable from the Privacy Center. Idempotent: it is pasted by hand in the SQL Editor.

create table if not exists public.calendar_feeds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  url_ciphertext text not null check (char_length(url_ciphertext) between 20 and 8192),
  url_host text not null check (char_length(url_host) between 1 and 253),
  enabled boolean not null default true,
  status text not null default 'ok' check (status in ('ok', 'error')),
  last_error text check (
    last_error in ('timeout', 'access_denied', 'not_found', 'not_ics', 'too_large', 'unavailable', 'blocked_address')
  ),
  last_synced_at timestamptz,
  -- [{ "start": "2026-10-26T08:00:00.000Z", "end": "…", "allDay": false }, …]
  busy jsonb not null default '[]'::jsonb check (
    jsonb_typeof(busy) = 'array' and jsonb_array_length(busy) <= 3000
  ),
  busy_from timestamptz,
  busy_to timestamptz,
  event_count integer not null default 0 check (event_count between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_feeds_updated_idx on public.calendar_feeds (user_id, updated_at);

drop trigger if exists set_updated_at on public.calendar_feeds;
create trigger set_updated_at before update on public.calendar_feeds
  for each row execute function public.set_updated_at();

alter table public.calendar_feeds enable row level security;
drop policy if exists calendar_feeds_select_own on public.calendar_feeds;
create policy calendar_feeds_select_own on public.calendar_feeds for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists calendar_feeds_insert_own on public.calendar_feeds;
create policy calendar_feeds_insert_own on public.calendar_feeds for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists calendar_feeds_update_own on public.calendar_feeds;
create policy calendar_feeds_update_own on public.calendar_feeds for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists calendar_feeds_delete_own on public.calendar_feeds;
create policy calendar_feeds_delete_own on public.calendar_feeds for delete to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.calendar_feeds from anon;
grant select, insert, update, delete on public.calendar_feeds to authenticated;
