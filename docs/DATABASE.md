# Base de données

Supabase / PostgreSQL. Migrations versionnées dans `supabase/migrations/` (horodatées, jamais modifiées une fois publiées : on ajoute une nouvelle migration).

## Principes

- **RLS activée sur toutes les tables** du schéma `public`, sans exception.
- Tables utilisateur : colonne `user_id uuid not null references auth.users on delete cascade` ; politiques `using ((select auth.uid()) = user_id)` et `with check` identique. Aucun utilisateur ne lit les données d'un autre.
- Catalogues partagés (`foods`, `exercises`, `recipes` publiques) : lecture pour `authenticated`, écriture réservée au `service_role` (pas de politique d'écriture).
- `anon` n'a accès à rien.
- Colonnes `created_at`, `updated_at` (trigger), `deleted_at` (suppression logique pour la sync) sur les tables synchronisées.
- Données externes : `provider`, `external_id`, `source`, `fetched_at`, `confidence`, `is_mock`.
- Pas de table artificielle : les préférences structurées peu requêtées (matériel, créneaux) sont en `jsonb` validé côté client par Zod **et** contraint côté base (`jsonb_typeof`).
- Montants en **centimes** (`integer`) + `currency` ; masses en grammes/kg `numeric`.

## Tables (migration `20260930000001_core.sql`)

| Table | Concept(s) | Notes |
|---|---|---|
| `profiles` | User, Profile | 1–1 avec `auth.users` ; pseudo, année de naissance, taille, sexe (facultatif), activité, statut de vie, locale |
| `goals` | Goal | historique ; un seul `active` par utilisateur (index unique partiel) |
| `motivations` | Motivation | réponses libres privées ; jamais envoyées à un tiers sans besoin |
| `user_preferences` | Preference (nutrition, entraînement, planning, budget, cuisine) | `jsonb` pour matériel et créneaux |
| `foods` | Food, Product | catalogue ; valeurs pour 100 g ; traçabilité source |
| `inventory_items` | Inventory | « Ce que j'ai chez moi » |
| `recipes` | Recipe | `owner_id` null = recette publique |
| `meal_plan_items` | MealPlan | un repas planifié par ligne (date, créneau, statut) |
| `shopping_list_items` | ShoppingList | coût estimé seulement si prix réel |
| `food_expenses` | budget réel | dépenses saisies |
| `exercises` | Exercise | catalogue |
| `workout_plans` | WorkoutPlan | **jamais écrite, inutilisée** depuis D-031 (remplacée par `training_programs` + `planned_exercises`) ; suppression à décider |
| `training_programs` | ProgramVersion | une ligne = une version publiée, immuable (`lineage_id` + `version`), un seul `active`, un seul `reconstructed` ; D-031 |
| `workout_sessions` | WorkoutSession | séance prescrite (programme, focus, durée, raison, adaptation du jour) puis vécue (statut, variante, difficulté 1–5, report, notes) ; prescription figée (trigger) |
| `planned_exercises` | PlannedExercise | prescription immuable par variante (séries, fourchette, repos, RPE cible, charge proposée, raison) ; D-031 |
| `exercise_logs` | ExerciseLog / ExerciseHistory | une ligne par série (répétitions **ou** secondes), reliée à l'exercice prescrit (`planned_exercise_id`) |
| `weight_logs` | WeightLog | |
| `body_measurements` | BodyMeasurement | tour de taille, etc. |
| `progress_photos` | ProgressPhoto | chemin dans le bucket **privé** `progress-photos/<user_id>/…` |
| `daily_checkins` / `weekly_reviews` | check-ins, WeeklyReview | |
| `notification_preferences` | Notification | une ligne par catégorie |
| `notification_settings` / `notification_history` | préférences et historique du canal notifications | D-024, voir ci-dessous |
| `integration_connections` | CalendarConnection, HealthConnection | `kind` = calendar/health, scopes, statut ; aucun token en clair côté client |
| `coach_memory` | mémoire structurée du coach | `kind` énuméré (aliment détesté, créneau préféré…) |
| `ai_conversations` / `ai_messages` | AIConversation, AIMessage | phase 3 ; tables créées mais inutilisées au MVP |

## Migration `20261002000001_workout_coach_foundation.sql` (W-1, D-031)

Programmes versionnés et prescriptions immuables : `training_programs`, `planned_exercises` (RLS propriétaire, politiques restrictives de rattachement), colonnes de prescription et de ressenti sur `workout_sessions`, `planned_exercise_id` sur `exercise_logs` et `exercise_substitutions`, raisons de remplacement élargies, `adjustments.status = 'postponed'`, fonction `attach_reconstructed_training_history()`. Détail : `docs/TRAINING_ARCHITECTURE.md` §2–6. Tests : `supabase/tests/training.sql`.

### Synchronisation (W-2, D-032)

Aucune nouvelle migration en W-2. Les tables d'entraînement sont désormais écrites par l'app : ordre de push `training_programs` → `workout_sessions` → `planned_exercises` → `exercise_logs` / `exercise_substitutions` ; `training_programs` et `planned_exercises` ne sont jamais supprimées par la sync (`deleteOnMissing: false`), seulement par l'effacement Privacy Center ou la suppression du compte. Ids stables calculés sur l'appareil (upserts idempotents). L'app appelle `attach_reconstructed_training_history()` avant le pull tant qu'une séance n'a ni programme ni source. **La migration W-1 doit être appliquée sur Supabase avant de publier une version de l'app qui contient W-2.**

## Migration `20261006000002_progression_v2.sql` (W-4, D-035)

`planned_exercises` : contrainte `progression_action` élargie aux actions W-4 (`increase_load`, `increase_reps`, `maintain`, `retry`, `reduce_load`, `no_recommendation`), les valeurs W-2 restent valides pour l'historique ; nouvelles colonnes `target_reps` (répétitions ou secondes visées, dans la plage prescrite), `progression_confidence` (`insufficient` / `low` / `medium` / `high`) et `progression_params` (objet JSON ≤ 512 octets : les faits de la raison, jamais du texte libre), interdites sans action. Figées comme le reste de la ligne par le trigger d'immuabilité de W-1. Aucune nouvelle table, aucune nouvelle politique (RLS de `planned_exercises` inchangée). Appliquer une progression au futur = nouvelle ligne `workout_sessions` + ses `planned_exercises`, l'ancienne passe `superseded`. Tests : `supabase/tests/training.sql`, `sync.db.test.ts`. **À appliquer sur Supabase avant toute version de l'app contenant W-4** (sinon l'envoi des nouvelles prescriptions échoue).

## Migration `20261006000001_workout_session.sql` (W-3, D-034)

Nouvelle table `exercise_reports` : ce que l'utilisateur déclare sur un exercice prescrit d'une séance (« Je ne fais pas cet exercice » et sa raison, difficulté 1–5). Unique `(session_id, exercise_id)`, contraintes (raison seulement si non fait, un rapport dit toujours quelque chose), index `user_id, updated_at`, trigger `set_updated_at`, RLS propriétaire + politiques restrictives (séance et prescription du même utilisateur), aucun privilège `anon`. Synchronisée après `exercise_substitutions` ; supprimée seulement pour une séance encore présente sur l'appareil. Effacée en premier par le Privacy Center (catégorie séances). Tests : `supabase/tests/rls.sql`, `supabase/tests/training.sql`, `sync.db.test.ts`. **À appliquer sur Supabase avant toute version de l'app contenant W-3** (sinon le pull de `exercise_reports` échoue).

## Migration `20261001000001_sync_hardening.sql`

- Plus de clé étrangère des tables utilisateur vers les catalogues (`foods`, `recipes`, `exercises`) : ces catalogues sont livrés avec l'app et non peuplés côté serveur (valeurs Ciqual 2025 depuis D-020 ; les identifiants d'aliments de l'app sont restés stables, le code Ciqual est porté à part). Les FK faisaient échouer toute synchronisation d'inventaire, de repas et de séries. Remplacées par un `check` de format d'identifiant (D-014).
- Politiques restrictives : une séance ne peut pointer que vers un plan du même utilisateur, une série que vers une séance du même utilisateur (sinon la suppression par B aurait effacé des lignes de A par cascade).
- `exercise_logs` : unicité `(session_id, exercise_id, set_index)` pour des upserts idempotents.
- `weekly_reviews.deleted_at` ; privilèges par défaut retirés à `anon` pour les futures tables.

## Migration `20261001000002_notification_engine.sql` (D-024)

- `notification_settings` (clé `user_id`) : interrupteur, plafond quotidien (1–6), heures calmes, heures des rappels, options du coach (citer ses mots, relances d'absence, célébrations), `paused_until`.
- `notification_history` : un message planifié par ligne, `unique (user_id, client_id)` (`client_id` = `date:déclencheur`, upsert idempotent), déclencheur et catégorie énumérés, `template_id` limité par une expression régulière aux identifiants du catalogue (aucun texte libre, donc jamais les mots de l'utilisateur), `facts jsonb` ≤ 512 octets, statut `scheduled` / `delivered` / `opened`.
- RLS propriétaire sur les deux, aucun privilège `anon`, cascade depuis `auth.users`.
- `prune_notification_history(keep_days default 90)` : `security invoker`, ne supprime que les lignes de l'appelant.
- Pas encore alimentées par l'app (sync à brancher, voir TODO) ; exportées par le Centre de confidentialité.

## Migration `20261001000004_daily_coach.sql` (D-028)

- `meal_plan_items` : statut `replaced`, `reason` facultative (liste fermée, uniquement pour un repas sauté ou remplacé).
- `workout_sessions` : statut `replaced`, `outcome_reason` et `replaced_by` (listes fermées).
- `daily_checkins` : `day_mode`, `activity`, `activity_minutes` ; synchronisée depuis cette phase.
- Nouvelles tables, RLS propriétaire, aucun privilège `anon`, cascade depuis `auth.users` : `weekly_checkins` (une ligne par semaine, aucun texte libre), `exercise_substitutions` (politique restrictive : la séance doit appartenir au même utilisateur), `journey_milestones` (un jalon par utilisateur, `celebrated_at`), `adjustments` (journal des propositions de l'Adaptation Engine et des décisions ; seul le statut change ; identifiant uuid aléatoire, la semaine de `effective_from` relie la décision à la recommandation).
- `notification_history` accepte `milestone_reached` et `encouragement_kept_going`.

## Prévu plus tard (non créé)

`stores`, `prices`, `promotions`, `gyms`, `sports_activities` : phases 2–3, avec la traçabilité complète des données externes. Créés quand un provider réel existe, pour ne pas stocker de données inventées.

## Tests RLS

`supabase/tests/rls.sql` crée deux utilisateurs, simule leurs JWT (`request.jwt.claims`) et vérifie **pour chaque table contenant `user_id`** (liste découverte automatiquement, une nouvelle table est donc testée d'office) : RLS activée, une politique propriétaire pour SELECT/INSERT/UPDATE/DELETE, aucune politique ouverte à tous ou à `anon`, A lit ses lignes, B ne peut ni les lire, ni les modifier, ni les supprimer ; A ne peut pas céder une ligne à B ; B ne peut pas rattacher une séance ou une série aux données de A ; `anon` n'a aucun privilège sur aucune table ; la suppression du compte vide toutes les tables. Les tests ont été vérifiés en injectant volontairement une faille (politique `using (true)`, politique manquante, privilège `anon`) : chacune fait échouer la suite. Lancer : `npm run test:db` (Postgres local requis ; en CI via un service Postgres). Le script installe un schéma `auth` minimal équivalent à Supabase (`auth.uid()`, rôles `anon`/`authenticated`/`service_role`).

## Suppression de compte

Suppression de `auth.users` → cascade sur toutes les tables. Faite par une Edge Function (`delete-account`, service role) déclenchée depuis le Privacy Center ; les photos du bucket sont supprimées avant. (TODO : voir `TODO.md`.)
