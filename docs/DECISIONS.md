# Décisions d'architecture

Format : Decision · Reason · Alternatives · Trade-offs · Date. On ajoute, on ne réécrit pas : une décision remplacée est marquée « Remplacée par D-xxx ».

## D-000 — État initial (audit)

- **Constat** : le 2026-09-30, le repository ne contenait qu'un `CLAUDE.md` (commit `a1abf57`) ; aucune dépendance, aucun script, aucune configuration, aucun code. Une autre branche (`claude/project-thread-99zbbu`) contient le même `CLAUDE.md`. Outils disponibles : Node 22, npm 10, Postgres 16 local (pas de Docker, donc pas de `supabase start`), accès au registre npm ; l'API `api.expo.dev` est bloquée par le proxy (utiliser `EXPO_OFFLINE=1 npx expo install`).
- **Conséquence** : initialisation d'une architecture propre ; ce `CLAUDE.md` est remplacé.
- **Date** : 2026-09-30

## D-001 — Stack : Expo SDK 57 + Expo Router + React Native Web + TypeScript strict

- **Reason** : une base de code pour iOS, Android et Web ; routage fichier partagé ; SDK stable courant (template officiel `create-expo-app` du 2026-09-30).
- **Alternatives** : Flutter (pas de TS), Next.js + RN séparés (deux apps), Ionic (moins natif).
- **Trade-offs** : certaines fonctions natives n'ont pas d'équivalent web → fallback obligatoire ; les SDK Expo changent vite → toujours vérifier la doc versionnée.
- **Date** : 2026-09-30

## D-002 — Un seul package, logique métier pure dans `src/domain`

- **Reason** : simplicité (pas de monorepo à maintenir) tout en isolant les moteurs, testables sans React et réutilisables par des Edge Functions (TS pur, sans import natif).
- **Alternatives** : monorepo (apps/mobile, packages/domain) dès le départ.
- **Trade-offs** : si le web diverge beaucoup ou si les Edge Functions importent massivement le domaine, passer en workspace npm. Règle d'import vérifiée par ESLint (`no-restricted-imports` dans `src/domain`).
- **Date** : 2026-09-30

## D-003 — Routes dans `src/app` (convention du template SDK 57)

- **Reason** : c'est la convention du template officiel ; le schéma du brief (`app/`, `components/`, `lib/`… à la racine) est respecté en esprit sous `src/`.
- **Alternatives** : dossiers à la racine.
- **Trade-offs** : aucun fonctionnel ; alias `@/` → `src/`.
- **Date** : 2026-09-30

## D-004 — Moteurs déterministes ; l'IA n'est jamais source de vérité

- **Reason** : exactitude, reproductibilité, testabilité, sécurité santé.
- **Alternatives** : calcul par LLM.
- **Trade-offs** : plus de code à maintenir ; les règles doivent être documentées (`NUTRITION_ENGINE.md`, `WORKOUT_ENGINE.md`).
- **Date** : 2026-09-30

## D-005 — Estimation énergétique : Mifflin-St Jeor + facteurs d'activité, bornes de sécurité

- **Reason** : équation la plus validée chez l'adulte pour la dépense de repos ; simple et explicable.
- **Alternatives** : Harris-Benedict (plus ancienne), Katch-McArdle (nécessite la masse grasse, rarement connue).
- **Trade-offs** : estimation ±10 % → présentée comme estimation, recalibrée par la tendance de poids réelle (phase 1.5).
- **Date** : 2026-09-30

## D-006 — Offline-first : stores locaux + outbox + last-write-wins par ligne

- **Reason** : séance, repas, poids doivent marcher sans réseau ; LWW sur `updated_at` suffit pour des données mono-utilisateur rarement éditées sur deux appareils à la fois.
- **Alternatives** : WatermelonDB / PowerSync / ElectricSQL (sync plus riche, dépendance lourde), CRDT.
- **Trade-offs** : conflit simultané sur deux appareils → la dernière écriture gagne ; suppressions logiques nécessaires. Réévaluer si le multi-appareil devient courant.
- **Date** : 2026-09-30

## D-007 — État client : zustand + persistance AsyncStorage

- **Reason** : léger, sans boilerplate, persistance simple, fonctionne sur web (AsyncStorage → localStorage).
- **Alternatives** : Redux Toolkit (plus lourd), React Query seul (cache serveur, pas source locale), SQLite (utile quand les volumes grossiront).
- **Trade-offs** : volumes limités (quelques Mo) ; migrer vers expo-sqlite si l'historique d'entraînement grossit.
- **Date** : 2026-09-30

## D-008 — Validation : Zod v4

- **Reason** : schémas partagés formulaire / stockage / sorties IA, inférence de types.
- **Alternatives** : Valibot, Yup.
- **Trade-offs** : taille du bundle acceptable.
- **Date** : 2026-09-30

## D-009 — Tests : Jest (jest-expo) + tests SQL RLS sur Postgres local

- **Reason** : jest-expo est l'outil officiel Expo ; un seul runner pour domaine et composants. Docker indisponible → schéma `auth` minimal simulant Supabase pour tester les politiques RLS avec `psql`.
- **Alternatives** : Vitest (plus rapide mais second runner), pgTAP via `supabase test db` (nécessite Docker).
- **Trade-offs** : la simulation `auth` doit rester fidèle à Supabase (`auth.uid()` lit `request.jwt.claims`). Passer à `supabase test db` quand Docker est disponible.
- **Date** : 2026-09-30

## D-010 — Provider-first avec `ProviderResult` explicite

- **Reason** : aucune dépendance forte à un fournisseur ; l'absence de donnée est un cas normal (`status: 'unavailable'`), jamais comblée par une invention.
- **Alternatives** : appels directs aux SDK.
- **Trade-offs** : une couche d'indirection par intégration.
- **Date** : 2026-09-30

## D-011 — Catalogue d'aliments MOCK en attendant CIQUAL

- **Reason** : la fondation a besoin de données pour tester les moteurs ; nous ne pouvons pas vérifier ici les valeurs officielles CIQUAL → valeurs de démonstration explicitement `isMock: true`, affichées avec badge MOCK.
- **Alternatives** : bloquer le plan alimentaire jusqu'à l'import CIQUAL.
- **Trade-offs** : les apports affichés sont approximatifs tant que P2-01 n'est pas fait ; bloquant pour la bêta.
- **Date** : 2026-09-30

## D-012 — Langue : code et identifiants en anglais, docs produit et UI en français (FR défaut, EN)

- **Reason** : le propriétaire travaille en français ; le code reste lisible par tout outil/développeur.
- **Date** : 2026-09-30

## D-013 — Plan repas : choix par journée plutôt que repas par repas

- **Contexte** : les plans vegan (et certains plans omnivores en perte de gras) restaient sous la cible de protéines (ex. 92–111 g pour 141 g), car chaque repas était choisi isolément et seule la calorie guidait la portion.
- **Décision** : recherche exhaustive des combinaisons de la journée parmi quelques candidats par créneau, avec une pénalité forte sous 90 % de la cible protéique ; ajout de recettes et d'aliments vegan riches en protéines (tofu, tempeh, seitan, soja texturé, edamame, yaourt soja ; valeurs MOCK) ; couverture protéique exposée et affichée.
- **Alternatives** : programmation linéaire (plus lourde, moins lisible) ; ajout automatique de compléments protéinés (contraire à la règle « pas de produit imposé »).
- **Trade-offs** : ≤ 7⁵ combinaisons par jour (quelques ms) ; si les contraintes empêchent d'atteindre la cible, l'app le dit plutôt que de tricher.
- **Tests** : `src/domain/meals/__tests__/protein.test.ts` (vegan, vegan perte de gras, vegan prise de masse, allergies multiples, budget faible micro-ondes, inventaire limité, cible inatteignable).
- **Date** : 2026-09-30

## D-014 — Pas de clé étrangère des données utilisateur vers les catalogues

- **Contexte** : `inventory_items.food_id`, `meal_plan_items.recipe_id`, `exercise_logs.exercise_id` référençaient des tables catalogue vides côté serveur → toute synchronisation aurait échoué.
- **Décision** : identifiants texte validés par `check` de format, sans FK. Le catalogue fait foi côté client (versionné avec l'app) jusqu'à l'import CIQUAL.
- **Alternatives** : peupler les catalogues par migration (double source de vérité, dérive), ou les servir depuis Supabase (dépendance réseau pour afficher une recette).
- **Trade-offs** : un identifiant inconnu est possible ; le client l'affiche comme « aliment inconnu » plutôt que de planter.
- **Date** : 2026-10-01
