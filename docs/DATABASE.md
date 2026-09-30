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
| `workout_plans` | WorkoutPlan | plan hebdo sérialisé (`jsonb`) + version du moteur |
| `workout_sessions` | WorkoutSession | variante `full` / `short` / `light` |
| `exercise_logs` | ExerciseLog / ExerciseHistory | une ligne par série |
| `weight_logs` | WeightLog | |
| `body_measurements` | BodyMeasurement | tour de taille, etc. |
| `progress_photos` | ProgressPhoto | chemin dans le bucket **privé** `progress-photos/<user_id>/…` |
| `daily_checkins` / `weekly_reviews` | check-ins, WeeklyReview | |
| `notification_preferences` | Notification | une ligne par catégorie |
| `integration_connections` | CalendarConnection, HealthConnection | `kind` = calendar/health, scopes, statut ; aucun token en clair côté client |
| `coach_memory` | mémoire structurée du coach | `kind` énuméré (aliment détesté, créneau préféré…) |
| `ai_conversations` / `ai_messages` | AIConversation, AIMessage | phase 3 ; tables créées mais inutilisées au MVP |

## Migration `20261001000001_sync_hardening.sql`

- Plus de clé étrangère des tables utilisateur vers les catalogues (`foods`, `recipes`, `exercises`) : ces catalogues sont livrés avec l'app et non peuplés côté serveur (MOCK aujourd'hui, CIQUAL demain, identifiants appelés à changer). Les FK faisaient échouer toute synchronisation d'inventaire, de repas et de séries. Remplacées par un `check` de format d'identifiant (D-014).
- Politiques restrictives : une séance ne peut pointer que vers un plan du même utilisateur, une série que vers une séance du même utilisateur (sinon la suppression par B aurait effacé des lignes de A par cascade).
- `exercise_logs` : unicité `(session_id, exercise_id, set_index)` pour des upserts idempotents.
- `weekly_reviews.deleted_at` ; privilèges par défaut retirés à `anon` pour les futures tables.

## Prévu plus tard (non créé)

`stores`, `prices`, `promotions`, `gyms`, `sports_activities` : phases 2–3, avec la traçabilité complète des données externes. Créés quand un provider réel existe, pour ne pas stocker de données inventées.

## Tests RLS

`supabase/tests/rls.sql` crée deux utilisateurs, simule leurs JWT (`request.jwt.claims`) et vérifie **pour chaque table contenant `user_id`** (liste découverte automatiquement, une nouvelle table est donc testée d'office) : RLS activée, une politique propriétaire pour SELECT/INSERT/UPDATE/DELETE, aucune politique ouverte à tous ou à `anon`, A lit ses lignes, B ne peut ni les lire, ni les modifier, ni les supprimer ; A ne peut pas céder une ligne à B ; B ne peut pas rattacher une séance ou une série aux données de A ; `anon` n'a aucun privilège sur aucune table ; la suppression du compte vide toutes les tables. Les tests ont été vérifiés en injectant volontairement une faille (politique `using (true)`, politique manquante, privilège `anon`) : chacune fait échouer la suite. Lancer : `npm run test:db` (Postgres local requis ; en CI via un service Postgres). Le script installe un schéma `auth` minimal équivalent à Supabase (`auth.uid()`, rôles `anon`/`authenticated`/`service_role`).

## Suppression de compte

Suppression de `auth.users` → cascade sur toutes les tables. Faite par une Edge Function (`delete-account`, service role) déclenchée depuis le Privacy Center ; les photos du bucket sont supprimées avant. (TODO : voir `TODO.md`.)
