# Architecture de l'entraînement

Statut : **architecture validée le 2026-10-02 ; W-1 (modèle de données) et W-2 (publication, stockage local, sync) livrés**, étapes suivantes en attente de validation. Décisions : `docs/DECISIONS.md` D-030, D-031, D-032.
Règles métier et audit : `docs/WORKOUT_ENGINE.md`. Schéma existant : `docs/DATABASE.md`. Sync : D-015. Moteur unique : D-024, D-028.

---

## 1. Où vit quoi

```
src/domain/training/         Workout Coach Engine : calcul pur, aucun état, aucun texte affiché
  exercises.ts               catalogue (inchangé, ids jamais renommés)
  engine.ts                  génération des modèles de séance (inchangé)
  program.ts        (W-1 ✓)  versions publiées, prescriptions figées, raisons structurées, historique reconstitué
  week.ts           (W-2 ✓)  ids stables, publier une version, figer une semaine, variantes, report
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
src/state/data.ts            stockage local (v4, W-2 ✓)
src/domain/sync/projection.ts  projection et fusion des nouvelles tables (W-2 ✓)
src/domain/scenarios/training.ts  MOCK : la semaine publiée d'un scénario, par les mêmes moteurs que usePlan
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
| Versions de programme | `training_programs` | `programs` (copie, publiée hors connexion puis poussée) | — | programme actif = `status = 'active'` |
| Séances prescrites et exercices prévus | `workout_sessions` (colonnes de prescription) + `planned_exercises` | `prescriptions`, `superseded`, `sessionIds` (copie, figée hors connexion puis poussée) | — | — |
| Variante choisie, source hors programme | `workout_sessions.variant`, `prescription_source` | `sessionVariants`, `sessionSources` | — | — |
| Séries, remplacements, difficulté, notes | `exercise_logs`, `exercise_substitutions`, `workout_sessions` | saisis d'abord sur l'appareil (local d'abord) | — | — |
| Reports | `workout_sessions.status/rescheduled_to` (séance d'origine gardée) | `rescheduled` | — | — |
| Difficulté de fin de séance | `workout_sessions.difficulty` | `sessionDifficulty` | — | — |
| Fatigue du jour | `daily_checkins` (existant) | `dayLogs` | — | — |
| Modèles de séance du moteur | — | — | recalculés à la demande (`generateWorkoutPlan`) pour **proposer**, jamais pour relire le passé | — |
| Écart prévu/fait, statut partiel, tendances, records, progression, adhérence | — | — | mémorisés dans les hooks | ✓ |

Une prescription passée n'existe jamais seulement sur l'appareil : elle est synchronisée comme les séances.

**Qui gagne (D-032)** : pour une version de programme ou une prescription, **le serveur** (immuables, une fois poussées elles font foi pour tous les appareils ; la copie locale n'est qu'un cache) ; pour le réalisé (séries, remplacements, issue, difficulté, report), **la modification locale non encore poussée** puis le serveur (règle D-015 inchangée). Le dérivé n'est jamais stocké.

---

## 5. Offline et synchronisation (W-2, livré)

**Publication** (`usePlan`, à l'ouverture et à chaque changement de profil) : lire l'existant ; sinon `ensureProgram` publie la version (v1, ou v+1 si un déclencheur s'applique) ; puis `ensureWeek` fige chaque séance prévue de la semaine depuis la version en vigueur ce jour-là ; le tout est enregistré dans le stockage local (`applyTraining`) puis poussé par la sync. L'écran de séance, le Daily Coach et la page Programme **relisent la prescription enregistrée** (`plan.sessionTemplate`, `plan.prescription`) ; le moteur ne sert plus qu'à proposer une séance hors programme.

**Ids stables** (`trainingIds`, `src/domain/shared/ids.ts`) : lignée = f(compte), version = f(lignée, numéro), séance = f(version, `date#index`), exercice prévu = f(séance, variante, position), copie reportée = f(séance, nouvelle date). Un redémarrage, une nouvelle tentative, un plantage ou un second appareil qui refait le même calcul produisent **les mêmes ids** : l'upsert est idempotent, aucun doublon.

**Déclencheurs d'une nouvelle version** (`versionReason`) : fréquence (ou adaptation si elle vient d'une décision `adjustments`), matériel, objectif, niveau, durée de séance, exercices exclus, version du moteur, reprise après une version terminée. **Rien d'autre** : choisir une variante, reporter, noter une difficulté, saisir ou corriger une série ne crée jamais de version. La v1 n'est jamais modifiée, seulement remplacée (`superseded`) ou terminée.

**Ordre parents → enfants** (`SYNC_TABLES`) : `training_programs` → `workout_sessions` → `planned_exercises` → `exercise_logs` / `exercise_substitutions`. Programmes et exercices prévus ne sont jamais supprimés par la sync (`deleteOnMissing: false`).

**Conflit entre appareils** (`applyRemote`, D-032), déterministe :

1. Programme : le serveur gagne. Seule exception : fermer localement une version que le serveur n'a pas changée depuis la dernière sync (vérification à trois points sur l'empreinte synchronisée).
2. Même id, paramètres différents : la version locale est « perdue » ; ses séances non commencées et jamais poussées sont abandonnées puis re-prescrites par `ensureWeek` depuis la version du serveur. Les faits (séries, issue) ne sont jamais abandonnés.
3. Plusieurs versions actives : la plus haute gagne ; à égalité, celle du serveur. La perdante, si elle n'existe que localement et n'a aucune séance commencée, est abandonnée ; sinon elle est fermée (`superseded`, `effective_to` = début de la gagnante − 1 jour).
4. Colonnes de prescription d'une séance : toujours celles du serveur, même si la ligne locale est en attente. Colonnes du réalisé : la modification locale en attente gagne.
5. Après la fusion, `ensureProgram` réévalue avec le profil fusionné et publie v+1 si besoin : le système converge.

**Hors connexion** : publier, figer, choisir une variante, ouvrir la séance, saisir les séries, reporter et noter la difficulté se font sans réseau ; tout part à la sync suivante, sans perte (test `sync.training.test.ts`).

**Report** : la séance d'origine garde son id, sa prescription, `status = 'rescheduled'` et `rescheduled_to` ; une copie est créée à la nouvelle date (la contrainte W-1 interdit `rescheduled_to` sur une séance qui ne serait pas `rescheduled`).

**Séance hors programme** : une séance commencée un jour sans séance prévue reçoit `prescription_source = 'off_plan'`, aucune ligne `planned_exercises`.

**Erreurs structurées** (`SyncError`, `src/services/sync.ts`) : `conflict`, `offline`, `rls`, `validation`, `server`, `invalid_data`, avec la phase (`attach`, `pull`, `push`), la table et le nombre de lignes. Aucun message technique n'est montré à l'utilisateur.

**Stockage local v4** : la migration remet `lastPulledAt` à zéro, le compte est donc relu en entier une fois après la mise à jour.

## 6. Historique antérieur : programme « reconstitué »

Règle (D-031) : **aucune prescription inconnue n'est fabriquée** ; ce qui a été réellement enregistré est gardé ; le reste est inconnu.

- Serveur : `public.attach_reconstructed_training_history()` crée au besoin **un** programme `source = 'reconstructed'`, `status = 'ended'`, sans aucun paramètre (contraintes), `effective_from` = première séance connue ; puis rattache les séances sans programme et sans `prescription_source` avec `prescription_source = 'unknown'`. Aucune ligne `planned_exercises` n'est créée. Séries, issues, variantes et remplacements restent tels quels. Idempotente : un second appel (second appareil) ne crée rien ; une séance ancienne synchronisée plus tard par une vieille version de l'app rejoint le même programme au prochain appel.
- Domaine : `reconstructedProgram` et `attachLegacySessions` (`src/domain/training/program.ts`) appliquent la même règle pour le mode local ; `plannedFor` répond `unknown` pour ces séances.
- Une séance `unknown` ne peut plus recevoir de prescription après coup (trigger).
- Appel de la fonction par l'app (W-2) : `runSync` l'appelle **avant le pull** tant qu'une séance n'a ni programme ni source (`needsHistoryAttach`). Idempotente : deux appareils qui l'appellent, ou un historique déjà en partie rattaché, ne créent qu'un seul programme reconstitué.

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

Livrés en W-2 :

- `src/domain/training/__tests__/week.test.ts` : publication v1, ids stables, aucune version pour une petite interaction, v2 sur changement de fréquence / matériel, prescription de lundi inchangée après un changement de profil, variantes stockées sans toucher la complète, charge proposée ou nulle, report, hors programme.
- `src/services/__tests__/sync.training.test.ts` : serveur en mémoire avec les règles W-1 : deux appareils, hors connexion puis sync sans perte, conflit de versions (la plus haute gagne, le serveur n'est jamais écrasé), aucun doublon après une nouvelle tentative, historique reconstitué A / B / partiel, hors programme, report, classement des erreurs.
- `src/services/__tests__/sync.db.test.ts` : sur Postgres réel avec RLS : deux appareils avec versions, profil changé sans toucher le passé, report et difficulté, rattachement A / B, intrus bloqué par RLS (`rls`), export et effacement.
- `src/state/__tests__/training.test.ts`, `src/domain/privacy/__tests__/data.test.ts`, `src/domain/sync/__tests__/projection.test.ts` (étendus).
- `e2e/workout-coach.spec.ts` : semaine publiée une fois puis relue, variante allégée stockée à part, séance hors programme.

À venir : comparaison et progression v2 (W-4), règles d'adaptation (W-5), E2E (W-7).
