# CLAUDE.md

Project You: adaptive fitness + nutrition coach for iOS, Android and Web. Plans adapt to goal, budget, foods at home, schedule, equipment and measured progress. Product spec: `docs/PRODUCT_SPEC.md`.

The owner (Souhayb) writes in French: user-facing replies, docs and UI copy in French (EN also shipped). Code and identifiers in English.

## Stack and architecture

Expo SDK 57 · Expo Router (routes in `src/app`) · React Native Web · TypeScript strict · Supabase (Postgres + RLS, Auth, Storage, Edge Functions) · zustand · Zod · i18next · Jest (jest-expo).

```
app → features → components / state / services / providers → domain
```

- `src/domain`: pure, deterministic engines (nutrition, meals, training, planning, progress, journey, notifications, sync). No React/Expo/Supabase imports (ESLint-enforced). Source of truth for every calculation.
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
6. **One coaching engine.** The Transformation Journey Engine (`src/domain/journey`) is the only motivation engine. `deriveJourneyState` is the single source of truth for the user's state (goal, progress, momentum, difficulties, safety); notifications, the Today screen, check-ins and progress screens consume it and never compute their own copy. Notifications are an output channel of the journey (`src/domain/notifications`), not a parallel system. Design: `docs/TRANSFORMATION_JOURNEY.md`.
7. **No invented estimates.** If a value is not measured by the app or entered by the user, it does not exist: never show muscle gained, fat lost, calories burned or any other estimate about the user's body or activity. Progress uses only real data: weight, waist, loads, reps, regularity, sessions done. (Planning targets such as a calorie target are recommendations, labelled "estimation", not measurements.)
8. **Safety before motivation.** A deterministic safety rule (`src/domain/journey/safety.ts`) detects excess: several consecutive logged days well under the calorie target or under BMR, weight loss faster than the safe rate over several weeks, training above the planned frequency combined with high declared fatigue. When it fires the app never congratulates or pushes: it slows down, explains, proposes to reduce, and suggests a health professional when relevant. No diagnosis, no clinical vocabulary. This rule overrides every motivation, celebration or reminder rule.
9. **Settings: one source of truth each, the past never rewritten.** Every onboarding answer is editable in Réglages; every setting has one source and one write path (`docs/SETTINGS_ARCHITECTURE.md`, D-043). A structural change is previewed (`domain/settings/impact.ts`), confirmed, and versions the future only; it ends a conflicting adaptation with a new journal row, never by rewriting it. Masses are stored in kg only, converted at display/entry. No toggle without a real effect; safety messages cannot be switched off.

Specialised rules: `.claude/rules/` (nutrition, security, ui, database, external-data, testing, privacy, ai).

## Workflow

AUDIT → ARCHITECTURE → DATA MODEL → FOUNDATION → MVP → TEST → REVIEW → NEXT PHASE. Build order and status: `docs/ROADMAP.md`; open tasks: `TODO.md` (update at the end of every session). Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), small and coherent. A feature is DONE only when it works, is tested, documented, responsive, handles loading/empty/error states, and is accessible and secure.
