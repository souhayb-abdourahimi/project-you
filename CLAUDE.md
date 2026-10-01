# CLAUDE.md

Project You: adaptive fitness + nutrition coach for iOS, Android and Web. Plans adapt to goal, budget, foods at home, schedule, equipment and measured progress. Product spec: `docs/PRODUCT_SPEC.md`.

The owner (Souhayb) writes in French: user-facing replies, docs and UI copy in French (EN also shipped). Code and identifiers in English.

## Stack and architecture

Expo SDK 57 · Expo Router (routes in `src/app`) · React Native Web · TypeScript strict · Supabase (Postgres + RLS, Auth, Storage, Edge Functions) · zustand · Zod · i18next · Jest (jest-expo).

```
app → features → components / state / services / providers → domain
```

- `src/domain`: pure, deterministic engines (nutrition, meals, training, planning, progress, motivation, sync). No React/Expo/Supabase imports (ESLint-enforced). Source of truth for every calculation.
- `src/providers`: interfaces for all external data + clearly flagged MOCK implementations.
- `supabase/migrations`: versioned SQL; every table has RLS.
- Details: `docs/ARCHITECTURE.md`, decisions in `docs/DECISIONS.md`.

## Commands

```bash
npm start                 # Expo dev server (w = web, i = iOS, a = Android)
npm run web               # web only
npm run check             # lint + typecheck + unit tests (run before every commit)
npm test                  # unit tests; single file: npx jest src/domain/nutrition
npm run test:db           # migrations + RLS tests on Postgres ($DATABASE_URL or local cluster)
npm run build:web         # production web export
npm run test:e2e          # Playwright on the web export (build:web first; PW_CHROMIUM_PATH for a local Chromium)
npm run test:live         # auth/RLS/sync against the real Supabase project (needs network + 2 test accounts in .env.local)
EXPO_OFFLINE=1 npx expo install <pkg>   # add a dependency (api.expo.dev is blocked here)
```

Expo changes every SDK: check https://docs.expo.dev/versions/v57.0.0/ before using an Expo API from memory.

## Critical rules

1. **Never invent external data** (prices, promos, hours, crowding, addresses, safety, travel times). Missing → "Donnée indisponible". Demo data → `isMock: true` + MOCK badge.
2. **Deterministic engines compute; AI only explains.** AI outputs that change data go through Zod schemas (`src/domain/ai/schemas.ts`) and are re-validated by an engine.
3. **Honesty and safety**: no guaranteed results, no extreme restriction, no deficit for minors/underweight users, no medical diagnosis, never guilt the user.
4. **Security**: RLS on every table (+ test in `supabase/tests/rls.sql`); only `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` in the client; never commit `.env*`; never log health data.
5. No business logic in components; no hard-coded UI strings or colours.

Specialised rules: `.claude/rules/` (nutrition, security, ui, database, external-data, testing, privacy, ai).

## Workflow

AUDIT → ARCHITECTURE → DATA MODEL → FOUNDATION → MVP → TEST → REVIEW → NEXT PHASE. Build order and status: `docs/ROADMAP.md`; open tasks: `TODO.md` (update at the end of every session). Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), small and coherent. A feature is DONE only when it works, is tested, documented, responsive, handles loading/empty/error states, and is accessible and secure.
