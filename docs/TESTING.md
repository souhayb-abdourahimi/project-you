# Tests

| Niveau | Outil | Commande | Contenu |
|---|---|---|---|
| Unitaires | Jest (jest-expo) | `npm test` | moteurs du domaine, i18n (parité FR/EN), contraste des tokens, providers, sync |
| Base de données | psql + Postgres 16 | `npm run test:db` | migrations + isolation RLS (2 utilisateurs + anon), cascade de suppression |
| Build | Expo | `npm run build:web` | export web de production |
| E2E | Playwright (web) | à venir (M-22) | parcours inscription → progression |

CI : `.github/workflows/ci.yml` (lint, typecheck, tests, build web, tests DB sur service Postgres).

Scénarios MOCK partagés : `src/domain/scenarios` (étudiant budget faible/moyen, prise de masse, perte de gras, recomposition, débutant, avancé, sans salle, vegan, emploi du temps chargé). Scénarios « voyage » et « hors connexion » à ajouter avec la sync (M-19).

Priorités : onboarding, nutrition, progression, workout, RLS, sync, IA structurée. Un bug corrigé commence par un test qui échoue.
