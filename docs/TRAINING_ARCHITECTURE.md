# Architecture de l'entraînement

Statut : **proposition (phase 5), en attente de validation**. Date : 2026-10-01. Décision : `docs/DECISIONS.md` D-030.
Règles métier et audit : `docs/WORKOUT_ENGINE.md`. Schéma existant : `docs/DATABASE.md`. Sync : D-015. Moteur unique : D-024, D-028.

---

## 1. Où vit quoi

```
src/domain/training/         Workout Coach Engine : calcul pur, aucun état, aucun texte affiché
  exercises.ts               catalogue (inchangé, ids jamais renommés)
  engine.ts                  génération des modèles de séance (inchangé)
  program.ts        (W-1)    programme versionné, cycle, raison du changement
  week.ts           (W-1)    figer une semaine : séances prévues + prescriptions
  session.ts        (W-1)    logique de saisie (série suivante, correction, fin de séance)
  compare.ts        (W-1)    prévu vs fait, statut, raison déclarée
  progression.ts    (W-5)    double progression v2 (contexte, variante, stagnation, gêne)
  replacement.ts / adapt.ts  remplacements, séances courtes et allégées (étendus)

src/domain/journey/          Transformation Journey Engine : le seul état utilisateur
  state.ts                   lit les faits d'entraînement (séances, écarts, difficulté)
  adaptation.ts              + règles d'entraînement (W-6), même Recommendation
  daily-plan.ts              séance du jour depuis la séance figée (W-7)
  progress-facts.ts          records, tendances (inchangés) + prévu/fait en faits
  memory.ts                  suggestions → écran de confirmation (W-6)
  explain.ts                 « Pourquoi cette charge ? » (W-7)
  safety.ts                  inchangé ; la fatigue de fin de séance arrive par daily_checkins

src/hooks/usePlan.ts         lit le programme et la semaine figés (au lieu de les recalculer)
src/hooks/useJourney.ts      point d'assemblage unique (inchangé dans son rôle)
src/state/data.ts            stockage local (v4)
src/domain/sync/projection.ts  projection et fusion des nouvelles tables
```

**Règle** : `training/` ne connaît ni la voix, ni les notifications, ni la sécurité ; il reçoit en entrée ce que `journey` a décidé (fatigue, `training_load`, variante du jour) et rend des faits et des prescriptions. `journey` reste le seul à décider quoi dire et quoi proposer (CLAUDE.md règle 6). Aucun hook ni écran ne recalcule un écart ou une progression lui-même.

---

## 2. Modèle de données proposé

Principe : **le prévu est stocké et figé, le fait est stocké, l'écart est dérivé**. Les tables existantes sont étendues plutôt que doublées (`workout_sessions` est déjà la séance, `exercise_logs` la série). `workout_plans` (jamais écrite) est remplacée par `training_programs` et supprimée dans la même migration après vérification qu'elle est vide en production.

### 2.1 `training_programs` (nouvelle)

```sql
create table public.training_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null check (version >= 1),
  engine_version integer not null,
  goal text not null,                                  -- objectif au moment de la génération
  split text not null check (split ~ '^[a-z_,]{1,80}$'), -- ex. 'full_a,full_b,full_a'
  sessions_per_week smallint not null check (sessions_per_week between 1 and 6),
  session_minutes smallint not null check (session_minutes between 10 and 150),
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  equipment text[] not null,
  cycle_weeks smallint check (cycle_weeks between 1 and 12),
  started_on date not null,
  ended_on date,
  reason_key text not null check (reason_key ~ '^[a-z0-9_.]{1,80}$'), -- 'program.reason.first', '.profile_changed', '.adjustment', '.new_cycle', '.reconstructed'
  adjustment_id uuid references public.adjustments (id) on delete set null,
  reconstructed boolean not null default false,        -- historique antérieur à la phase 5 (§6)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, version),
  check (ended_on is null or ended_on >= started_on)
);
-- Un seul programme actif par utilisateur.
create unique index training_programs_one_active on public.training_programs (user_id) where ended_on is null and deleted_at is null;
```

Les modèles de séance (exercices de chaque `focus`) ne sont pas stockés ici : ils sont recalculables de façon déterministe à partir des paramètres et de `engine_version`, et la prescription réellement donnée est figée séance par séance dans `planned_exercises`.

### 2.2 `workout_sessions` (étendue)

| Colonne | Statut | Rôle |
|---|---|---|
| `program_id uuid` | **nouvelle** | programme qui a produit la séance (null = hors programme) ; politique restrictive « mon programme » comme `plan_id` |
| `plan_id` | supprimée avec `workout_plans` | — |
| `session_index`, `scheduled_for`, `variant`, `location`, `status`, `outcome_reason`, `replaced_by` | existantes | inchangées ; `status` garde `planned`, `in_progress`, `completed`, `skipped`, `rescheduled`, `replaced` (`partial` est **dérivé**, pas stocké) |
| `focus text` | **nouvelle** | `full_a`, `full_b`, `upper`, `lower`, `custom` |
| `planned_minutes smallint` | **nouvelle** | durée prévue après adaptation du jour |
| `adaptation_reason text` | **nouvelle** | clé du Daily Coach qui a changé la séance (`workout.light_week`, `workout.short_slot`…), format contrôlé |
| `rescheduled_to date` | **nouvelle** | report synchronisé (lève A9) ; contrainte : non nul seulement si `status = 'rescheduled'` |
| `started_at`, `completed_at` | existantes | enfin écrites ; durée réelle = différence |
| `difficulty smallint` | **nouvelle** | 1–5, facultative, fin de séance |
| `notes` | existante | **non utilisée** (minimisation : pas de texte libre) |

### 2.3 `planned_exercises` (nouvelle)

```sql
create table public.planned_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  position smallint not null check (position between 0 and 30),
  exercise_id text not null check (exercise_id ~ '^[a-z0-9_:-]{1,64}$'),
  sets smallint not null check (sets between 1 and 10),
  reps_min smallint not null check (reps_min between 1 and 300),
  reps_max smallint not null check (reps_max >= reps_min and reps_max <= 300),
  unit text not null check (unit in ('reps', 'seconds')),
  rest_seconds smallint not null check (rest_seconds between 0 and 600),
  target_rpe numeric(3, 1) check (target_rpe between 1 and 10),
  target_load_kg numeric(6, 2) check (target_load_kg between 0 and 1000),
  progression_action text check (progression_action in ('increase_load', 'add_reps', 'keep', 'deload', 'first_time')),
  progression_reason text check (progression_reason ~ '^[a-z0-9_.]{1,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (session_id, position)
);
```

Politique restrictive : `session_id` doit appartenir à l'utilisateur (même forme que `exercise_logs_own_session`).

### 2.4 `exercise_logs` (étendue)

- `planned_exercise_id uuid` (nouvelle, nullable, restrictive « ma séance ») : relie la série à l'exercice prévu (ou à l'exercice prévu remplacé).
- `seconds` (existante) **utilisée** pour les exercices en secondes ; contrainte : `reps` ou `seconds`, pas les deux.
- `deleted_at` (existante) : une série supprimée par l'utilisateur est supprimée logiquement ; `SYNC_TABLES.exercise_logs.deleteOnMissing` passe à `true`.
- Clé idempotente existante `(session_id, exercise_id, set_index)` conservée.

### 2.5 `exercise_substitutions` (étendue)

- `reason` : + `busy_equipment`, `discomfort` (contrainte élargie).
- `planned_exercise_id uuid` (nouvelle) : l'exercice prévu remplacé (la clé `(session_id, from_exercise_id)` reste).

### 2.6 `adjustments` (inchangée)

Les décisions d'entraînement utilisent les `kind` existants (`training`, `reduce_load`) et de nouvelles `change_key` (`session_minutes`, `exercise_swap`, `sets_per_exercise`, `progression_review`, `new_cycle`). `from_value` / `to_value` ≤ 128 octets suffisent (ex. `{"from":"leg_press","to":"goblet_squat"}`). Aucune migration.

### 2.7 Ce qui n'est **pas** stocké

Écart prévu/fait, statut `partial`, stagnation, records, tendances, adhérence, `JourneyState` : dérivés à la lecture (D-028). Pas de 1RM, pas de score de forme, pas de calories (règle 7).

### 2.8 Catalogue d'exercices

Reste dans l'app (D-014). Les ids sont permanents : un exercice retiré du catalogue garde une entrée « archivée » pour que l'historique s'affiche. La table serveur `exercises` reste vide ; elle sera remplie seulement quand des médias de sources légitimes existeront (`media_url`, `media_source`).

---

## 3. RLS et sécurité

- Toutes les nouvelles tables : RLS propriétaire (`user_id = auth.uid()`) en lecture/écriture, aucun privilège `anon`, `on delete cascade` depuis `auth.users` (suppression de compte).
- Politiques **restrictives** de rattachement : `workout_sessions.program_id` → programme de l'utilisateur ; `planned_exercises.session_id` et `exercise_logs.planned_exercise_id` → séance / exercice prévu de l'utilisateur (même motif que `…_own_session`, `…_own_plan`).
- Formats contrôlés (regex) pour toute clé textuelle ; aucun texte libre nouveau.
- Tests (`supabase/tests/rls.sql`) : lecture croisée refusée, insertion rattachée à la séance d'un autre refusée, un seul programme actif, cascade à la suppression de compte, contraintes `reps`/`seconds`, `rescheduled_to` seulement si reporté.
- Export et suppression (Privacy Center) : `training_programs` et `planned_exercises` ajoutés à la catégorie « séances » (`src/domain/privacy/data.ts`).

---

## 4. Stockage local, offline et synchronisation

- `py.data.v1` passe en **version 4** (migration persistante) avec :
  - `programs: TrainingProgram[]` (actif + clos) ;
  - `plannedSessions: Record<SessionKey, PlannedSession>` (séance figée : programme, focus, variante, durée prévue, prescriptions, report) ;
  - `sessionMeta: Record<SessionKey, { startedAt?, difficulty? }>` ;
  - `setLogs` devient modifiable (`editSet`, `deleteSet`) ;
  - `rescheduled` reste la source locale mais est projeté dans `workout_sessions` (statut `rescheduled`, `rescheduled_to`).
- `SessionKey` `${date}#${index}` est conservée (aucune donnée existante à réécrire). Le sens de l'index vient de `plannedSessions[key]`, plus du programme recalculé.
- Projection (`project`) : programmes, puis séances (toutes les séances figées, plus seulement celles commencées), puis exercices prévus, puis séries et remplacements (ordre parents → enfants, `SYNC_TABLES`). Ids des lignes enfants dérivés de l'id de la séance (comme `setRowId`, `swapRowId`) pour des upserts idempotents.
- Fusion (`applyRemote`) : validation Zod de chaque ligne (lignes invalides comptées et ignorées) ; règle existante : un changement local non poussé gagne, sinon le serveur gagne.
- Conflit « deux appareils figent la même semaine » : la semaine est figée avec des ids déterministes dérivés de `(programme, date, index)` ; deux appareils produisent les mêmes lignes, l'upsert est sans effet.
- Tout fonctionne hors connexion : figer la semaine, adapter, saisir, comparer, progresser. La sync envoie ensuite.

---

## 5. Flux

### 5.1 Semaine

```
usePlan (ouverture de l'app)
  ├─ programme actif ? non → program.create(profil)              → programs (+ adjustments si issu d'une adaptation)
  ├─ profil d'entraînement changé ? → program.close + create        (raison : profile_changed)
  └─ semaine figée ? non → week.freeze(programme, planWeek(...))   → plannedSessions (statut planned)
```

### 5.2 Séance du jour

```
useJourney → DailyPlan : séance du jour = plannedSessions[aujourd'hui]
  └─ adaptation du jour (courte / allégée / semaine allégée / repos) choisie par le coach ou l'utilisateur
       └─ avant le début : prescription du jour réécrite (variant, planned_minutes, adaptation_reason)
écran séance (UI fonctionnelle)
  ├─ « Commencer » ou 1re série → started_at
  ├─ série : session.logSet / editSet / deleteSet
  ├─ remplacer : findReplacements → l'utilisateur choisit → exerciseSwaps + raison
  │    └─ discomfort → message de sécurité existant, alternative plus facile
  └─ « Terminer » → completed_at, difficulté (facultative), fatigue → daily_checkins (facultative)
```

### 5.3 Après la séance et en fin de semaine

```
compare(prévu, fait, raisons déclarées)   → faits (séance, exercices)       [dérivé]
progression v2(historique, contexte)       → prescription de la prochaine occurrence, figée à son tour
journey (state, progress-facts, milestones) → records, régularité, jalons, voix
adaptation (bilan de semaine)              → recommandations (proposées / conseils) → adjustments
fin de cycle                               → proposition de semaine allégée / nouveau cycle
```

### 5.4 Changement de profil en cours de semaine

Les séances déjà faites, sautées ou commencées gardent leur prescription. Les séances `planned` futures de la semaine sont refigées avec le nouveau programme (ancienne ligne supprimée logiquement, nouvelle créée). L'historique n'est jamais réécrit.

---

## 6. Données existantes (avant la phase 5)

Les séances et séries déjà enregistrées n'ont pas de prescription figée. À la migration locale (v4) :

- un programme `version 1`, `reconstructed = true`, `reason_key = 'program.reason.reconstructed'`, couvrant la période jusqu'à la première semaine figée, avec les paramètres du profil actuel ;
- les séances existantes y sont rattachées **sans** `planned_exercises` : la comparaison les marque « prévu non connu » et ne calcule pas d'écart. Aucune prescription n'est inventée a posteriori (règle « ne jamais afficher une valeur non mesurée »).

Records, tendances, régularité et progression continuent de fonctionner : ils ne lisent que les séries.

---

## 7. Intégrations

| Module | Aujourd'hui | Après |
|---|---|---|
| **Daily Coach** (`daily-plan.ts`) | modèle recalculé, durée = `sessionMinutes` du profil ; l'écran de séance ignore la durée annoncée | lit la séance figée ; la durée et la variante annoncées sont celles que l'écran applique (A4) ; « séance hors programme » possible un jour de repos, jamais présentée comme un rattrapage |
| **Progress Journey** | records, tendances, séances, semaines | + faits prévu/fait formulés positivement (« 14 séries sur 15 cette semaine ») ; historique des séances ; aucune nouvelle estimation |
| **Adaptation Engine** | calories, séances/sem, semaine allégée, conseils | + règles d'entraînement (`WORKOUT_ENGINE.md` §4.6) dans la même liste, même blocage sécurité / calibration / faible adhérence, mêmes décisions dans `adjustments` ; `APPLICABLE_CHANGES` += `session_minutes`, `exercise_swap` |
| **Sécurité** (`safety.ts`) | `training_load` sur fréquence + fatigue déclarée | inchangée ; la fatigue saisie en fin de séance arrive par `daily_checkins` (même source) ; `training_load` bloque toute hausse de charge. Proposition à valider : compter « très difficile » en fin de séance comme un jour de fatigue déclarée (seuils D-026 inchangés) |
| **Notifications** | `session_planned`, `session_planned_tired`, `success_session`… | aucun nouveau déclencheur prévu : elles lisent la séance figée (durée, variante) via le `DailyPlan`. Tout nouveau déclencheur exigera une migration des contraintes de `notification_history` |
| **Mémoire** (`memory.ts`) | suggestion « retirer l'exercice » calculée, non affichée | écran de confirmation ; + suggestion de garder un remplaçant pour matériel absent/occupé |
| **Explications** (`explain.ts`) | « Pourquoi cette séance ? » | + « Pourquoi cette charge ? » (action, raison, séances utilisées) |
| **Planification** (`planning/engine.ts`) | inchangée | reçoit le programme actif ; les reports sont synchronisés |

---

## 8. Tests prévus

- Unitaires (`training/__tests__`) : figer une semaine (déterminisme, ids stables), changement de profil en cours de semaine, comparaison (chaque statut, chaque source de raison, raison inconnue), progression v2 (fatigue, sécurité, variante, stagnation, gêne), séries corrigées/supprimées.
- Journey : nouvelles règles d'adaptation et leurs blocages ; aucune règle ne propose une hausse sous `training_load`.
- Sync : projection et fusion des nouvelles tables, suppression logique d'une série, deux appareils qui figent la même semaine, migration v3 → v4 avec historique reconstitué.
- DB : tests RLS §3.
- Ton : toutes les nouvelles chaînes FR/EN passent le garde-fou récursif (D-029).
- E2E (W-8) : semaine figée → séance → remplacement avec raison → fin → bilan avec proposition.
