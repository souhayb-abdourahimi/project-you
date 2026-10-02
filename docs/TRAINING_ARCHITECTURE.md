# Architecture de l'entraînement

Statut : **architecture validée le 2026-10-02 ; W-1 (modèle de données) livré**, étapes suivantes en attente de validation. Décisions : `docs/DECISIONS.md` D-030, D-031.
Règles métier et audit : `docs/WORKOUT_ENGINE.md`. Schéma existant : `docs/DATABASE.md`. Sync : D-015. Moteur unique : D-024, D-028.

---

## 1. Où vit quoi

```
src/domain/training/         Workout Coach Engine : calcul pur, aucun état, aucun texte affiché
  exercises.ts               catalogue (inchangé, ids jamais renommés)
  engine.ts                  génération des modèles de séance (inchangé)
  program.ts        (W-1 ✓)  versions publiées, prescriptions figées, raisons structurées, historique reconstitué
  week.ts           (W-2)    figer une semaine : séances prévues + prescriptions
  session.ts        (W-3)    logique de saisie (série suivante, correction, fin de séance)
  compare.ts        (W-4)    prévu vs fait, statut, raison déclarée
  progression.ts    (W-4)    double progression v2 (contexte, variante, stagnation, gêne)
  replacement.ts / adapt.ts  remplacements, séances courtes et allégées (étendus)

src/domain/journey/          Transformation Journey Engine : le seul état utilisateur
  state.ts                   lit les faits d'entraînement (séances, écarts, difficulté)
  adaptation.ts              + règles d'entraînement (W-5), même Recommendation
  daily-plan.ts              séance du jour depuis la séance figée (W-6)
  progress-facts.ts          records, tendances (inchangés) + prévu/fait en faits
  memory.ts                  suggestions → question à l'utilisateur → confirmation (W-5)
  explain.ts                 « Pourquoi cette charge ? » / « Pourquoi cet exercice ? » (W-6)
  safety.ts                  inchangé ; la fatigue de fin de séance arrive par daily_checkins

src/hooks/usePlan.ts         lit le programme et la semaine figés (au lieu de les recalculer)
src/hooks/useJourney.ts      point d'assemblage unique (inchangé dans son rôle)
src/state/data.ts            stockage local (v4, W-2)
src/domain/sync/projection.ts  projection et fusion des nouvelles tables (W-2)
```

**Règle** : `training/` ne connaît ni la voix, ni les notifications, ni la sécurité ; il reçoit en entrée ce que `journey` a décidé (fatigue, `training_load`, variante du jour) et rend des faits et des prescriptions. `journey` reste le seul à décider quoi dire et quoi proposer (CLAUDE.md règle 6). Aucun hook ni écran ne recalcule un écart ou une progression lui-même.

---

## 2. Modèle de données (W-1, livré)

Migration : `supabase/migrations/20261002000001_workout_coach_foundation.sql`. Principe : **le prévu est publié et figé, le fait est enregistré, l'écart est dérivé**. Les tables existantes sont étendues (`workout_sessions` reste la séance, `exercise_logs` la série, `exercise_substitutions` le remplacement, `adjustments` la décision) ; deux tables seulement sont nouvelles.

```
training_programs  (1 ligne = 1 version publiée, immuable)          lineage_id + version : « programme X v1, v2… »
  └─ workout_sessions.program_id                                     séance prescrite (focus, durée, raison) puis vécue (statut, début/fin, difficulté, notes)
       └─ planned_exercises.session_id  (immuable, par variante)     exercice, ordre, séries, fourchette, unité, repos, RPE cible, charge proposée, raison
            ├─ exercise_logs.planned_exercise_id                     séries faites : répétitions ou secondes, charge, RPE, notes
            └─ exercise_substitutions.planned_exercise_id            exercice de remplacement + raison déclarée
adjustments.id ← training_programs.adjustment_id                      décision de l'Adaptation Engine à l'origine d'une version
```

### 2.1 `training_programs` (nouvelle) : une version publiée par ligne

| Colonne | Rôle |
|---|---|
| `lineage_id`, `version` | le « programme X » et son numéro de version ; `unique (user_id, lineage_id, version)` |
| `source` | `engine` (généré) ou `reconstructed` (regroupe l'historique antérieur à W-1) |
| `status` | `active` → `superseded` (remplacée par v+1) ou `ended` ; jamais de retour en arrière |
| `reason_key`, `adjustment_id` | pourquoi cette version existe (`program.reason.first`, `.profile_changed`, `.adjustment`, `.new_cycle`, `.reconstructed`) et la décision d'adaptation qui l'a produite (référence souple, sans clé étrangère) |
| `engine_version`, `goal`, `split`, `sessions_per_week`, `session_minutes`, `level`, `equipment`, `excluded_exercise_ids` | paramètres figés à la publication ; **obligatoires** pour `engine`, **tous nuls** pour `reconstructed` (contraintes) |
| `cycle_weeks` | 6 par défaut (D-031) |
| `effective_from`, `effective_to`, `published_at` | période de validité ; `effective_to` posé une seule fois |

Index uniques partiels : **un seul programme actif** par utilisateur, **un seul programme reconstitué** par utilisateur. Trigger `training_programs_immutable` : tout changement autre que l'avancement de `status` et la pose unique d'`effective_to` est refusé.

### 2.2 `workout_sessions` (étendue)

| Colonne | Statut | Type de donnée (D-031 B) |
|---|---|---|
| `program_id` | nouvelle, clé étrangère vers la version ; politique restrictive « mon programme » | lien |
| `focus`, `planned_minutes`, `purpose` | nouvelles : séance prescrite et sa raison structurée | RECOMMENDATION |
| `prescription_source` | nouvelle : `engine` · `off_plan` (séance hors programme) · `unknown` (historique) | — |
| `prescribed_at` | nouvelle : moment où la prescription a été donnée | RECOMMENDATION |
| `adapted_minutes`, `adaptation_reason` | nouvelles : adaptation du jour (la durée **annoncée**, ex. 20 min) | RECOMMENDATION |
| `variant`, `status`, `started_at`, `completed_at` | existantes ; `status` accepte `superseded` (séance future remplacée par une nouvelle version) | FACT |
| `rescheduled_to` | nouvelle : report synchronisé (seulement si `status = 'rescheduled'`) | FACT |
| `difficulty` | nouvelle : 1 à 5, saisie en mots (« Très facile » … « Très difficile ») | USER_REPORTED |
| `outcome_reason`, `replaced_by`, `notes` | existantes | USER_REPORTED |
| `plan_id` | existante, **non utilisée** (`workout_plans` jamais écrite ; suppression décidée plus tard) | — |

Contraintes : une séance `engine` porte son programme, sa date de prescription, son focus et sa durée ; une séance `unknown` n'a ni focus, ni durée, ni raison, ni date de prescription. Trigger `workout_sessions_prescription_immutable` : une séance ne change jamais de programme (rattachement nul → programme permis une fois) ; `prescription_source` ne change plus une fois posé ; la prescription d'une séance prescrite est figée ; l'adaptation du jour est figée une fois la séance terminée, sautée, remplacée, reportée ou remplacée par une nouvelle version.

### 2.3 `planned_exercises` (nouvelle, immuable)

Une ligne par exercice prescrit et par **variante** (`full`, `short`, `light`) : l'adaptation du jour ajoute ses propres lignes, la prescription complète reste telle qu'elle a été donnée. Colonnes : `position` (ordre), `exercise_id`, `sets`, `reps_min`/`reps_max` (fourchette, contrôlée), `unit` (`reps` ou `seconds`), `rest_seconds`, `target_rpe`, `target_load_kg` (**nul** quand le moteur n'avait aucune base), `progression_action` + `progression_reason`, `purpose` (raison structurée : `strength`, `hypertrophy`, `muscular_endurance`, `technique`, `maintenance`, `recovery`, `progression`) et `purpose_target` (muscle, schéma moteur ou exercice). Trigger `planned_exercises_immutable` : un upsert identique (second appareil) est accepté, tout changement est refusé. Politique restrictive « ma séance ».

### 2.4 `exercise_logs` et `exercise_substitutions` (étendues)

- `planned_exercise_id` (nullable, `on delete set null`, politique restrictive « ma prescription ») relie la série ou le remplacement à l'exercice prescrit. Nul pour un exercice ajouté librement ou pour l'historique.
- `exercise_logs` : contrainte « répétitions **ou** secondes » (la colonne `seconds` existait, inutilisée). Les séries restent corrigibles : ce sont des faits saisis, pas des prescriptions.
- `exercise_substitutions.reason` : liste fermée élargie (`REPLACEMENT_REASONS`, `src/domain/training/replacement.ts`) : `dislike` (historique), `cant_do` (technique inconnue), `no_equipment` (matériel indisponible), `easier`, `harder`, `busy_equipment` (machine prise), `discomfort` (mouvement gênant / inconfort), `too_hard_today`, `no_time`, `preference`, `other`.

### 2.5 `adjustments` (statut élargi)

`status` accepte `postponed` (« plus tard ») : la semaine allégée de fin de cycle peut être acceptée, refusée ou reportée, jamais imposée. Les décisions d'entraînement passent par l'Adaptation Engine existant (`kind` `training` / `reduce_load`, nouvelles `change_key` en W-5).

### 2.6 Types de données (D-031 B)

| Type | Définition | Où |
|---|---|---|
| **FACT** | enregistré directement | séries (`reps`, `seconds`, `load_kg`), `status`, `variant`, `started_at`, `completed_at`, `rescheduled_to`, exercice de remplacement |
| **USER_REPORTED** | déclaré par l'utilisateur | `difficulty`, `rpe`, raisons (`outcome_reason`, `replaced_by`, `exercise_substitutions.reason`), `notes`, fatigue (`daily_checkins`), décision sur une proposition (`adjustments.status`) |
| **DERIVED** | calculé, recalculable, **jamais stocké** | écart prévu/fait, statut « partielle », tendances, records, stagnation, adhérence, `JourneyState` |
| **RECOMMENDATION** | produit par le moteur, figé quand il est donné | versions de programme, séances et exercices prescrits, charge proposée, adaptation du jour, propositions d'adaptation |

La table de correspondance est aussi dans le code (`TRAINING_DATA_KINDS`, `src/domain/training/program.ts`), testée : aucune colonne n'est de type DERIVED.

### 2.7 Catalogue d'exercices

Reste dans l'app (D-014). Les ids sont permanents : un exercice retiré du catalogue garde une entrée archivée pour que l'historique s'affiche. La table serveur `exercises` reste vide.

---

## 3. RLS et sécurité

- `training_programs`, `planned_exercises` : RLS propriétaire (`(select auth.uid()) = user_id`) en select / insert / update / delete, aucun privilège `anon`, `on delete cascade` depuis `auth.users`. Ils entrent automatiquement dans l'audit générique de `supabase/tests/rls.sql` (B ne lit, ne modifie ni ne supprime rien de A ; politiques ; anon ; cascade).
- Politiques **restrictives** de rattachement : `workout_sessions.program_id` (mon programme), `planned_exercises.session_id` (ma séance), `exercise_logs.planned_exercise_id` et `exercise_substitutions.planned_exercise_id` (ma prescription).
- Fonction `attach_reconstructed_training_history()` : `security invoker` (RLS appliquée), exécutable par `authenticated` seulement.
- Tests de comportement : `supabase/tests/training.sql` (57 vérifications), lancé par `npm run test:db`.
- Privacy Center : `training_programs` et `planned_exercises` sont exportés (`EXPORT_ONLY_TABLES`) et supprimés avec la catégorie « séances » (`CATEGORY_TABLES.workouts`, enfants d'abord puis programmes). **Effacer n'est pas réécrire** : l'immuabilité interdit de modifier une prescription, pas de supprimer ses données.

---

## 4. Serveur, local, cache, dérivé

| Donnée | Serveur (source de vérité multi-appareil) | Local (appareil) | Cache | Dérivé (jamais stocké) |
|---|---|---|---|---|
| Versions de programme | `training_programs` | copie (W-2) pour travailler hors connexion | — | programme actif = `status = 'active'` |
| Séances prescrites et exercices prévus | `workout_sessions` + `planned_exercises` | copie de la semaine (W-2), créée hors connexion puis poussée | — | — |
| Séries, remplacements, difficulté, notes | `exercise_logs`, `exercise_substitutions`, `workout_sessions` | saisis d'abord sur l'appareil (local d'abord) | — | — |
| Reports | `workout_sessions.status/rescheduled_to` | `rescheduled` (aujourd'hui seul endroit, synchronisé à partir de W-2) | — | — |
| Fatigue du jour | `daily_checkins` (existant) | `dayLogs` | — | — |
| Modèles de séance du moteur | — | — | recalculés à la demande (`generateWorkoutPlan`) pour **proposer**, jamais pour relire le passé | — |
| Écart prévu/fait, statut partiel, tendances, records, progression, adhérence | — | — | mémorisés dans les hooks | ✓ |

Une prescription passée n'existe jamais seulement sur l'appareil : elle est synchronisée comme les séances (W-2).

---

## 5. Offline et synchronisation (préparés en W-1, construits en W-2)

Le modèle ne demande aucun aller-retour serveur pour ouvrir une séance ou saisir une série :

- **ids générés par l'appareil** (uuid aléatoires) pour les versions, séances et exercices prescrits : une semaine peut être figée et une séance ouverte hors connexion ;
- **upserts idempotents** : une prescription poussée deux fois à l'identique est acceptée, une version différente est refusée (trigger) ; la sync par différence (D-015) peut donc rejouer sans risque ;
- **ordre parents → enfants** : `training_programs` → `workout_sessions` → `planned_exercises` → `exercise_logs` / `exercise_substitutions` ;
- les séries restent des lignes modifiables (`exercise_logs`) ; leur suppression passe par `deleted_at` (W-2 : `deleteOnMissing`) ;
- conflit possible à traiter en W-2 : deux appareils hors connexion qui publient chacun une version pour le même changement de profil → l'index « un seul actif » refuse la seconde ; l'appareil perdant doit reprendre la version du serveur et rattacher ses séances non commencées.

En W-1, l'app ne lit ni n'écrit encore ces nouvelles colonnes : `SessionKey` `${date}#${index}`, `setLogs` et la projection actuelle fonctionnent comme avant (vérifié par `sync.db.test.ts` sur le nouveau schéma).

---

## 6. Historique antérieur : programme « reconstitué »

Règle (D-031) : **aucune prescription inconnue n'est fabriquée** ; ce qui a été réellement enregistré est gardé ; le reste est inconnu.

- Serveur : `public.attach_reconstructed_training_history()` crée au besoin **un** programme `source = 'reconstructed'`, `status = 'ended'`, sans aucun paramètre (contraintes), `effective_from` = première séance connue ; puis rattache les séances sans programme et sans `prescription_source` avec `prescription_source = 'unknown'`. Aucune ligne `planned_exercises` n'est créée. Séries, issues, variantes et remplacements restent tels quels. Idempotente : un second appel (second appareil) ne crée rien ; une séance ancienne synchronisée plus tard par une vieille version de l'app rejoint le même programme au prochain appel.
- Domaine : `reconstructedProgram` et `attachLegacySessions` (`src/domain/training/program.ts`) appliquent la même règle pour le mode local ; `plannedFor` répond `unknown` pour ces séances.
- Une séance `unknown` ne peut plus recevoir de prescription après coup (trigger).
- Appel de la fonction par l'app : W-2 (au premier pull après mise à jour).

## 7. Flux

### 7.1 Semaine

```
usePlan (ouverture de l'app)
  ├─ programme actif ? non → publishProgram(profil)                 → training_programs v1 (+ adjustments si issu d'une adaptation)
  ├─ profil d'entraînement changé ? (programParamsChanged) → publishProgram(previous) : v1 superseded, v2 active (raison : profile_changed)
  └─ semaine figée ? non → week.freeze(version, planWeek(...)) → prescribeSession → workout_sessions + planned_exercises (statut planned)
```

### 7.2 Séance du jour

```
useJourney → DailyPlan : séance du jour = plannedSessions[aujourd'hui]
  └─ adaptation du jour (courte / allégée / semaine allégée / repos) choisie par le coach ou l'utilisateur
       └─ avant le début : adaptPrescription ajoute les exercices de la variante (adapted_minutes, adaptation_reason) ; la prescription complète ne bouge pas
écran séance (UI fonctionnelle)
  ├─ « Commencer » ou 1re série → started_at
  ├─ série : session.logSet / editSet / deleteSet
  ├─ remplacer : findReplacements → l'utilisateur choisit → exerciseSwaps + raison
  │    └─ discomfort → message de sécurité existant, alternative plus facile
  └─ « Terminer » → completed_at, difficulté (facultative), fatigue → daily_checkins (facultative)
```

### 7.3 Après la séance et en fin de semaine

```
compare(prévu, fait, raisons déclarées)   → faits (séance, exercices)       [dérivé]
progression v2(historique, contexte)       → prescription de la prochaine occurrence, figée à son tour
journey (state, progress-facts, milestones) → records, régularité, jalons, voix
adaptation (bilan de semaine)              → recommandations (proposées / conseils) → adjustments
fin de cycle                               → proposition de semaine allégée / nouveau cycle
```

### 7.4 Changement de profil en cours de semaine

Les séances déjà faites, sautées ou commencées gardent leur prescription. Les séances `planned` futures de la semaine passent en `superseded` (leur prescription reste lisible) et une nouvelle séance est prescrite par la nouvelle version. L'historique n'est jamais réécrit.

---

---

## 8. Intégrations

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

## 9. Tests

Livrés en W-1 :

- `src/domain/training/__tests__/program.test.ts` : création d'un programme, version v2 dans la même lignée, v1 inchangée, détection d'un changement de profil, prescription (ordre, séries, fourchette, repos, raison, charge proposée), charge nulle sans base, **modifier le profil après une prescription ne change pas la prescription historique**, adaptation du jour sous sa propre variante, lien série → exercice prescrit (y compris via un remplacement), historique reconstitué sans paramètre ni prescription, idempotence du rattachement, échelle de difficulté, aucune colonne DERIVED, nouvelles raisons de remplacement.
- `src/domain/journey/__tests__/retention-memory.test.ts` : une préférence répétée devient une question, une gêne ou une machine prise jamais.
- `supabase/tests/training.sql` (57 vérifications) et `supabase/tests/rls.sql` (audit générique étendu aux deux nouvelles tables) : versions, immuabilité (programme, séance prescrite, exercice prescrit, adaptation d'une séance passée), upsert identique d'un second appareil accepté et upsert différent refusé, réalisation reliée au programme, historique reconstitué, RLS lecture / écriture / modification / suppression / rattachement croisé, effacement par l'utilisateur, cascade de suppression du compte.
- `src/services/__tests__/sync.db.test.ts` (existant) : la sync actuelle passe sur le nouveau schéma.

À venir : figer une semaine et la sync des nouvelles tables (W-2, dont deux appareils réels via `sync.db.test.ts`), comparaison et progression v2 (W-4), règles d'adaptation (W-5), E2E (W-7).
