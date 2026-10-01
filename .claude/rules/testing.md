# Testing rules

- Commands: `npm test` (all), `npx jest path/to/file` (single), `npm run test:db` (RLS, needs local Postgres), `npm run check` (lint + typecheck + tests).
- Domain engines: unit tests next to the code in `__tests__/`, including edge cases (minors, extreme goals, empty inventory, no equipment, allergies).
- Every bug fix starts with a failing test.
- A feature is DONE only when: works, tested, documented, responsive, loading/empty/error handled, accessible, security checked.
- Use the MOCK scenarios in `src/domain/scenarios` instead of ad-hoc fixtures.
