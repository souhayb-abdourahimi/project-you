# Security rules

- Every new table: `enable row level security` + owner policies using `(select auth.uid()) = user_id`, plus a case in `supabase/tests/rls.sql`. No exceptions.
- Client may only hold `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Any other key goes to Edge Function secrets. Never commit `.env*` (only `.env.example`).
- Validate every external/user/AI input with Zod before use.
- Never log weight, measurements, photos, motivation answers, health data, emails or tokens.
- Dev/debug screens only behind `__DEV__`.
- Checklist before calling a module done: RLS tested · inputs validated · no secret in bundle · errors don't leak internals · deletion path exists.
