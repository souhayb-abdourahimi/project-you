# Database rules

- Schema changes only via new files in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`. Never edit a pushed migration.
- User tables: `user_id uuid not null references auth.users(id) on delete cascade`, `created_at`, `updated_at` (trigger `set_updated_at`), `deleted_at` when synced.
- Money in integer cents + currency. Use `check` constraints for enums and ranges.
- External data columns: `provider, external_id, source, fetched_at, confidence, is_mock`.
- Index every `user_id` and the columns used by sync (`updated_at`).
- Run `npm run test:db` after any migration change; update `docs/DATABASE.md`.
