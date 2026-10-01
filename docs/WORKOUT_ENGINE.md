# Workout Coach Engine — moteur de coaching sportif

Statut : **audit et architecture proposés (phase 5), en attente de validation**. Aucun code applicatif n'est écrit avant l'accord de Souhayb.
Date : 2026-10-01. Décision : `docs/DECISIONS.md` D-030. Modèle de données, flux et intégrations : `docs/TRAINING_ARCHITECTURE.md`.
Documents liés : `docs/TRANSFORMATION_JOURNEY.md` (moteur unique), `docs/DAILY_COACH.md`, `docs/ADAPTATION_ENGINE.md`, `docs/PROGRESS_JOURNEY.md`, `docs/PLANNING_ENGINE.md`.

Objectif produit : faire de Project You un **coach sportif longitudinal**. L'application doit suivre le programme, les séances prévues et réalisées, les exercices, séries, répétitions, charges, la difficulté ressentie, la fatigue, les exercices remplacés et pourquoi, la progression et les adaptations. Elle doit comprendre :

```
ce qui était prévu  →  ce qui a réellement été fait  →  pourquoi il y a eu une différence  →  quelle adaptation proposer
```

Le Workout Coach Engine **n'est pas un second moteur de coaching** (CLAUDE.md règle 6). C'est le moteur de calcul de l'entraînement (`src/domain/training`, fonctions pures) : il prescrit, compare et calcule la progression. L'état de l'utilisateur, la sécurité, la voix, l'adaptation et les notifications restent dans `src/domain/journey`, qui lit ses sorties (`docs/TRAINING_ARCHITECTURE.md` §1).

---

## 1. Audit du code existant (main = 8ec03f0)

### 1.1 Ce qui existe

| Domaine | Existant | Où |
|---|---|---|
| Exercices | 35 exercices éditoriaux FR/EN : schéma moteur (9), muscles principaux/secondaires, matériel requis, niveau, polyarticulaire, incrément de charge, consignes, erreurs fréquentes | `src/domain/training/exercises.ts` |
| Catalogue serveur | table `exercises` (lecture seule pour `authenticated`, champs `media_url` / `media_source`) **vide** : le catalogue vit dans l'app, les FK vers lui ont été retirées (D-014) | migrations `…000001_core`, `…000001_sync_hardening` |
| Programme | `generateWorkoutPlan` : split selon séances/sem (full body A/B, haut/bas…), nombre d'exercices selon la durée, choix par schéma moteur, matériel, niveau, exercices refusés, rotation des variantes, prescription par objectif et niveau | `src/domain/training/engine.ts` |
| Calendrier sportif | `planWeek` : jours de séance selon créneaux, contraintes, trajet saisi, salle/maison/courte ; reports (`rescheduleOptions`, `withReschedules`) ; créneaux occupés du calendrier pour la semaine en cours | `src/domain/planning/engine.ts`, `src/hooks/usePlan.ts` |
| Séances adaptées | « J'ai 15 minutes » (`shortSession`), version allégée (`lightSession`, −40 % de séries, RPE ≤ 6) | `src/domain/training/adapt.ts`, `src/app/adapt.tsx` |
| Logs d'entraînement | séries (répétitions, charge, RPE facultatif) par séance `${date}#${sessionIndex}` ; séance terminée avec sa variante ; issue d'une séance non faite (sautée / remplacée par marche, mobilité, repos, autre sport) + raison facultative | `src/state/data.ts`, `src/app/workout/[date].tsx`, `src/features/training/ExerciseCard.tsx` |
| Remplacements | `findReplacements` (n'aime pas, ne sait pas faire, pas la machine, plus facile, plus difficile) ; échange et raison enregistrés et synchronisés (`exercise_substitutions`, D-028) | `src/domain/training/replacement.ts` |
| Progression | double progression prudente sur la dernière séance : haut de fourchette et RPE ≤ 9 → +incrément ; sinon +1 rép ; RPE ≥ 9,5 ou sous la fourchette → on consolide ; fatigue élevée → charge gardée ; 2 échecs de suite → −10 % | `src/domain/training/progression.ts` |
| Performances | records (charge ou répétitions, jamais à la première séance), tendance par exercice sur 14 jours (meilleure série), aucune estimation (pas de 1RM, pas de calories) | `src/domain/journey/progress-facts.ts` |
| Adaptation existante | adhérence 14/28 j ; règles `training_load` (sécurité), semaine allégée (RPE moyen ≥ 9 deux semaines ou fatigue), −1 séance/sem si adhérence faible, séances plus courtes (conseil), retour au nombre initial, plateau de recomposition (conseil « progression revue ») ; décisions tracées dans `adjustments` | `src/domain/journey/adaptation.ts`, `adherence.ts`, `adjustments.ts` |
| Daily Coach | séance du jour adaptée (sécurité, fatigue, mode du jour, retour, semaine allégée, créneau court) | `src/domain/journey/daily-plan.ts` |
| Mémoire utilisateur | jour d'entraînement habituel ; suggestion de retirer un exercice remplacé 2× pour « n'aime pas / ne peut pas » (calculée, **pas d'écran de confirmation**) | `src/domain/journey/memory.ts` |
| Sync / offline | local d'abord (Zustand persistant `py.data.v1` v3), sync par différence (D-015) de `workout_sessions`, `exercise_logs`, `exercise_substitutions`, `daily_checkins`, `adjustments` ; RLS propriétaire + politiques restrictives (une ligne ne peut pas viser la séance d'un autre) ; tests RLS | `src/domain/sync/projection.ts`, `supabase/tests/rls.sql` |

### 1.2 Ce qui est incomplet

| # | Constat | Conséquence pour un coach longitudinal | Où |
|---|---|---|---|
| A1 | **Le plan prévu n'est jamais stocké.** `generateWorkoutPlan` et `planWeek` sont recalculés à chaque rendu depuis le profil actuel ; la table `workout_plans` existe mais n'est jamais écrite. D-028 l'a accepté comme compromis. | « Ce qui était prévu » est faux dès que le profil change : `sessionIndex` 2 ne désigne plus la même séance après un passage de 3 à 4 séances/sem (adaptation acceptée comprise). Comparaison prévu/fait impossible sur l'historique. | `src/hooks/usePlan.ts`, `scheduleOfWeek` |
| A2 | **La prescription par exercice n'est pas gardée** (séries, fourchette, repos, RPE cible, charge proposée). La suggestion de progression est recalculée à l'affichage et oubliée. | On ne sait pas a posteriori quelle charge avait été proposée, ni si l'utilisateur l'a suivie. | `ExerciseCard.tsx` |
| A3 | La progression reçoit `fatigue: 'normal'` **codé en dur**. La fatigue déclarée et la sécurité `training_load` ne l'influencent pas, contrairement à ce que dit la doc. | Une hausse de charge peut être proposée un jour de fatigue élevée. | `ExerciseCard.tsx` l. 40 |
| A4 | L'écran de séance ignore la durée décidée par le Daily Coach : la version courte fait toujours 15 min (le Daily Coach peut en annoncer 20) ; avec salle, la version courte est au poids du corps seul, même si l'utilisateur a du matériel à la maison. La semaine allégée n'apparaît pas dans l'onglet Programme (ouvrir une séance depuis Programme donne la version complète). | Le coach dit une chose, l'écran en fait une autre. | `src/app/workout/[date].tsx`, `program.tsx` |
| A5 | Saisie des séries **en ajout seul** : pas de correction ni de suppression d'une série ; séries en secondes (gainage) stockées dans `reps` (colonne `seconds` inutilisée). | Une faute de frappe fausse records, tendances et progression pour toujours. | `src/state/data.ts`, `projection.ts` |
| A6 | Pas de difficulté ressentie de séance, pas de durée réelle (`started_at` jamais écrit), pas d'heure de début. Terminer une séance sans aucune série la compte comme faite. | Impossible de distinguer séance complète, partielle ou cochée. | `workout_sessions` |
| A7 | Remplacement : la première alternative est choisie automatiquement ; un seul échange par exercice prévu et par séance (écrasé) ; pas de raison « machine occupée » ni « ça me gêne ». | L'utilisateur ne choisit pas ; la raison la plus fréquente en salle manque. | `ExerciseCard.tsx`, `replacement.ts` |
| A8 | Progression limitée à la dernière séance : pas de détection de stagnation par exercice, pas de semaine allégée planifiée, la variante n'est pas prise en compte (une séance allégée à RPE 6 peut déclencher une hausse de charge à la séance suivante). | Pas de vision sur plusieurs semaines. | `progression.ts` |
| A9 | Reports gardés sur l'appareil (D-028). | Un second appareil ne voit pas qu'une séance a été déplacée. | `rescheduled` |
| A10 | Adaptation : aucune règle à l'échelle de l'exercice (stagnation, échecs répétés, remplacement récurrent pour matériel, séries non terminées). « Séances plus courtes » n'est qu'un conseil. | L'adaptation reste grossière (calories, nombre de séances, semaine allégée). | `adaptation.ts` |
| A11 | Mémoire : la suggestion « retirer cet exercice » n'a pas d'écran (TODO D-028). | La préférence n'arrive jamais au programme. | `memory.ts` |
| A12 | Une séance faite un jour sans séance prévue prend le modèle n° 0 (`date#0`). | Pas de notion de séance hors programme. | `workout/[date].tsx` |

### 1.3 Ce qui doit être refactoré

- **`usePlan` → plan figé** : le programme et la semaine sont générés puis **figés** (stockés), et non plus recalculés à chaque rendu. Les moteurs restent purs ; seule la source change (A1, A2, A9). Lève le compromis de D-028 sur l'adhérence passée.
- **`ExerciseCard` / `workout/[date].tsx`** : la logique (série suivante, suggestion, fin de séance) sort de l'écran vers `training/session.ts` (pur, testé) ; l'écran ne fait plus qu'afficher (A3, A4, A6).
- **`progression.ts`** : reçoit le contexte (fatigue, sécurité, variante, historique sur plusieurs séances) au lieu d'une valeur fixe (A3, A8).
- **`SessionKey` `${date}#${index}`** : gardée pour la compatibilité, mais le sens d'un index vient désormais de la séance figée (`planned_sessions`), plus du programme recalculé.
- **`setLogs` en ajout seul** → séries modifiables et supprimables (suppression logique côté serveur, `deleted_at`) (A5).

### 1.4 Ce qui manque

- Programme versionné (cycle de plusieurs semaines, version, raison de chaque changement).
- Séances prévues figées par semaine, avec la prescription de chaque exercice.
- Comparaison prévu / fait (séance, exercice, série) et classification de l'écart.
- Raison de l'écart **déclarée** (jamais devinée), reliée à l'écart.
- Difficulté ressentie de la séance, durée réelle, séance partielle.
- Règles d'adaptation à l'échelle de l'exercice et de la séance, passant par l'Adaptation Engine existant.
- Historique des séances consultable (ce qui a été fait, semaine par semaine).

---

## 2. Principes du moteur

1. **Prévu figé, fait enregistré, écart calculé.** Le prévu est écrit une fois (au moment où la semaine est planifiée ou la séance adaptée) et n'est plus réécrit ; le fait est saisi par l'utilisateur ; l'écart est **dérivé**, jamais stocké (comme `JourneyState`, D-028).
2. **Raisons jamais devinées** (D-028). Une différence sans raison déclarée est « raison non renseignée ». Les règles d'adaptation n'utilisent que des signaux mesurés ou déclarés.
3. **Seulement des valeurs mesurées ou saisies** (règle 7). Pas de 1RM estimé, pas de calories dépensées, pas de muscle gagné, pas de « volume » présenté comme un résultat. Les records et tendances restent ceux de `progress-facts.ts`.
4. **La sécurité prime** (règle 8). `training_load` actif ou fatigue élevée → aucune hausse de charge, version allégée ou repos proposés ; une gêne déclarée sur un exercice → arrêt de l'exercice proposé, aucune progression sur cet exercice ce jour-là, recommandation de consulter un professionnel si elle revient. Aucun diagnostic, aucun vocabulaire clinique.
5. **Déterministe.** Mêmes entrées → même prescription, sur tous les appareils. Pas de LLM pour calculer.
6. **Proposer, pas imposer.** La progression normale (charge suivante) est une suggestion préremplie que l'utilisateur peut changer. Tout changement du programme (exercice, durée, séances, cycle) passe par une recommandation de l'Adaptation Engine, appliquée en un geste, tracée dans `adjustments`, annulable.
7. **Local d'abord.** Toute la séance fonctionne hors connexion ; la sync par différence envoie ensuite.

---

## 3. Modèle (résumé)

Détail des tables, colonnes, RLS et sync : `docs/TRAINING_ARCHITECTURE.md` §2–4.

```
Programme (training_programs)            version, cycle, split, paramètres, début/fin, raison du changement
  └─ Séance prévue (workout_sessions)    date prévue, modèle (focus), variante, durée prévue, statut, report
       ├─ Exercice prévu (planned_exercises)  exercice, ordre, séries, fourchette, unité, repos, RPE cible, charge proposée, action de progression
       │    ├─ Séries faites (exercise_logs)  répétitions ou secondes, charge, RPE, ordre
       │    └─ Remplacement (exercise_substitutions)  vers quel exercice, raison
       └─ Ressenti                        difficulté de séance (1–5), durée réelle ; fatigue du jour → daily_checkins (une seule source)
Décisions (adjustments)                  changements de programme proposés / appliqués / refusés / annulés
```

---

## 4. Règles métier

Tous les seuils ci-dessous sont des **paramètres de conception** (constante `WORKOUT` dans le code), à faire relire par un professionnel avec ceux de D-024, D-026 et D-028.

### 4.1 Programme

- Un seul programme **actif** par utilisateur. Il garde ses exercices pendant un **cycle de 6 semaines** (choix par défaut ; voir §7) : la rotation de variantes reste celle d'aujourd'hui, mais elle ne change plus quand on rouvre l'app.
- Une nouvelle version du programme est créée seulement quand : le profil d'entraînement change (matériel, séances/sem, durée, niveau, exercices refusés), une adaptation est appliquée, ou le cycle se termine et l'utilisateur accepte le suivant. La version précédente est close (`ended_on`) avec la raison (`reason_key`), jamais modifiée.
- Fin de cycle : le moteur propose (recommandation) soit de continuer, soit une **semaine allégée** puis un nouveau cycle avec des variantes. Jamais imposé.

### 4.2 Semaine et séance prévue

- La semaine est figée au premier affichage de la semaine (lundi ou plus tard) : une ligne `workout_sessions` en statut `planned` par séance prévue, avec ses `planned_exercises`.
- Un report met la séance en `rescheduled` avec `rescheduled_to` et crée la séance du nouveau jour (même prescription) : les deux appareils voient le report (lève A9).
- Une adaptation du jour (courte, allégée, semaine allégée) **remplace la prescription de la séance du jour avant qu'elle commence** ; la séance garde `variant` et la raison (`adaptation_reason` : clé du Daily Coach) ; la prescription d'origine reste lisible dans le programme.
- Séance faite un jour sans séance prévue : séance **hors programme** (`session_index` nul, `focus` choisi par l'utilisateur ou séance courte), comptée comme une séance faite, jamais comme un rattrapage (A12).

### 4.3 Saisie pendant la séance

- La séance démarre (`started_at`) à la première série ou au bouton « Commencer ».
- Chaque série : répétitions **ou** secondes selon l'unité, charge si l'exercice est chargé, RPE facultatif. Une série peut être corrigée ou supprimée (A5).
- Remplacement : l'utilisateur **choisit** parmi les alternatives (A7). Raisons : `dislike`, `cant_do`, `no_equipment`, `busy_equipment` (machine occupée, nouveau), `easier`, `harder`, `discomfort` (« ça me gêne », nouveau). `discomfort` affiche le message existant (arrêter l'exercice si la gêne est importante ou persiste, en parler à un professionnel) et propose une alternative plus facile ; jamais de diagnostic.
- Fin de séance : difficulté ressentie sur 5 niveaux en mots (« très facile » → « très difficile ») ; fatigue du jour facultative, écrite dans `daily_checkins` (une seule source pour la fatigue, lue par la sécurité). Les deux sont facultatives.
- Une séance terminée sans aucune série reste « faite » si l'utilisateur la termine (on le croit), mais la comparaison la marque « non détaillée » : elle compte pour la régularité, pas pour la progression.

### 4.4 Comparaison prévu / fait (`training/compare.ts`, dérivé)

Par **exercice prévu** :

| Statut | Condition |
|---|---|
| `as_planned` | toutes les séries prévues faites, répétitions dans la fourchette, charge ≥ charge proposée − 1 incrément |
| `more` | plus de séries, ou charge au-dessus de la proposition, ou répétitions au-dessus de la fourchette |
| `less` | moins de séries, ou répétitions sous la fourchette, ou charge en dessous de la proposition |
| `replaced` | un remplacement existe (comparaison faite ensuite sur l'exercice de remplacement, contre la même prescription) |
| `not_done` | aucune série, séance terminée |
| `not_detailed` | séance terminée sans aucune série saisie |

Par **séance** : statut (`completed`, `partial` = au moins un exercice `less` / `not_done`, `skipped`, `replaced`, `rescheduled`), part des séries prévues faites, durée réelle vs prévue, difficulté ressentie.

**Pourquoi** : la raison est cherchée **uniquement** dans ce qui a été déclaré, dans cet ordre : raison du remplacement → raison de l'issue de séance (`outcome_reason`) → mode du jour (journée difficile, peu de temps, pas envie) → adaptation du jour décidée par le coach → fatigue déclarée le jour même. Sinon : `unknown`. Le moteur ne déduit jamais « tu étais fatigué » d'une série ratée.

### 4.5 Progression (`progression.ts` v2)

Garde la double progression actuelle et ajoute :

- **Contexte réel** : fatigue du jour et sécurité lues depuis `JourneyState` (A3). `training_load` actif ou fatigue élevée → `keep` (jamais `increase_load`).
- **Variante** : les séries d'une séance `light` ou `short` ne déclenchent jamais de hausse de charge ; elles comptent pour la régularité et les records, pas pour l'échec (une séance allégée n'est pas un échec).
- **Échecs répétés** (existant) : 2 séances de suite sous la fourchette → −10 %.
- **Stagnation** : même meilleure série (charge et répétitions) sur **3 séances complètes** de l'exercice réparties sur au moins 3 semaines, sans fatigue élevée → recommandation (conseil) : changer de variante ou de fourchette. Jamais avant 3 semaines.
- **Gêne déclarée** (`discomfort`) : aucune hausse sur cet exercice à la séance suivante ; deux fois sur 14 jours → suggestion mémoire de le retirer + phrase « parles-en à un professionnel si ça persiste ».
- La charge proposée est **figée** dans `planned_exercises.target_load_kg` avec l'action et la raison, au moment où la séance est figée ou ouverte.

### 4.6 Adaptations proposées (passent par `journey/adaptation.ts`)

Nouvelles règles, ajoutées à la liste existante (même `Recommendation`, même cooldown, même blocage sous sécurité) :

| Signal (mesuré ou déclaré) | Recommandation | Mode |
|---|---|---|
| Séances terminées en moyenne < 75 % de la durée prévue sur les 3 dernières, ou 3 versions courtes sur les 4 dernières | `session_minutes` : durée prévue réduite au palier inférieur (ex. 60 → 45) | **appliquée en un geste** (nouvelle valeur de `APPLICABLE_CHANGES`) |
| Même exercice remplacé 2× pour `no_equipment` / `busy_equipment` | `exercise_swap` : garder le remplaçant dans le programme | appliquée en un geste |
| Même exercice remplacé 2× pour `dislike` / `cant_do` | suggestion mémoire existante, avec enfin son écran (A11) | confirmée par l'utilisateur → `refusedExerciseIds` |
| Dernière série non faite sur ≥ 3 exercices, 2 séances de suite (hors fatigue) | `sets_per_exercise` −1 sur les accessoires | conseil |
| Stagnation (§4.5) | `progression_review` sur l'exercice | conseil |
| Difficulté ressentie « très difficile » 2 séances de suite + échecs | semaine allégée (`light_week`, existant) | appliquée en un geste |
| Fin de cycle | continuer / semaine allégée puis nouveau cycle | appliquée en un geste |

Ce qui ne change pas : `training_load`, semaine allégée, −1 séance/sem, retour au nombre initial, plateau, blocage sous sécurité et sous faible adhérence (on simplifie le plan, D-028).

### 4.7 Ce qui est affiché

- Pendant la séance : prescription, charge proposée avec sa raison courte (« +2 kg : toutes les séries en haut de la fourchette la dernière fois »), séries faites.
- Après la séance : faits uniquement (« 14 séries sur 15 », « record au développé couché »), jamais « tu as raté ». La comparaison détaillée est disponible, formulée en constats neutres (D-029).
- Historique : séances par semaine, prévu vs fait, adaptations et leur raison.

---

## 5. Flux utilisateur

Détail écran par écran et séquence de données : `docs/TRAINING_ARCHITECTURE.md` §5. Résumé :

1. **Début de semaine** → le programme actif fige la semaine (séances prévues + prescriptions).
2. **Aujourd'hui** → le Daily Coach propose la séance (complète, courte, allégée, repos) ; l'adaptation choisie réécrit la prescription du jour avant le début.
3. **Séance** → séries saisies, corrigées, exercices remplacés avec raison ; gêne → message de sécurité.
4. **Fin** → difficulté ressentie, fatigue facultative ; résumé en faits.
5. **Derrière** → comparaison prévu/fait, progression de la séance suivante, faits pour le parcours (records, régularité).
6. **Bilan de semaine** → l'Adaptation Engine lit les écarts de la semaine et propose (ou non) un changement, expliqué.
7. **Fin de cycle** → proposition de semaine allégée et de nouveau cycle.

---

## 6. Plan d'implémentation par étapes

Chaque étape : code + tests unitaires + `npm run check` ; migrations avec tests RLS (`TMPDIR=/tmp npm run test:db`) ; E2E à la fin. Une PR par phase, fusionnée uniquement sur décision de Souhayb.

| Étape | Contenu | Corrige |
|---|---|---|
| **W-1** Domaine pur | types `TrainingProgram`, `PlannedSession`, `PlannedExercise` ; `training/program.ts` (création, version, cycle), `training/week.ts` (figer une semaine), `training/compare.ts`, `training/session.ts` (logique de saisie sortie de l'écran) ; tests | A1, A2, A12 |
| **W-2** Migration + RLS | `training_programs`, `planned_exercises`, colonnes de `workout_sessions` et `exercise_logs`, raisons élargies, statut `partial` dérivé (non stocké) ; tests RLS (lecture/écriture croisée refusées, cascade) | A1, A2, A5, A6, A9 |
| **W-3** Stockage local + sync | `py.data.v1` v4 avec migration ; projection/`applyRemote` des nouvelles tables ; séries modifiables (suppression logique) ; **historique existant reconstitué et marqué** `reconstructed` (voir §7) | A5, A9 |
| **W-4** Séance (UI fonctionnelle, pas finale) | démarrer, saisir/corriger/supprimer une série, secondes, choisir l'alternative, nouvelles raisons, fin de séance (difficulté, fatigue) ; l'écran respecte la durée du Daily Coach et le matériel maison | A3, A4, A5, A6, A7 |
| **W-5** Progression v2 | contexte fatigue/sécurité/variante, stagnation, gêne, charge figée dans la prescription | A3, A8 |
| **W-6** Adaptation + mémoire | nouvelles règles §4.6 dans `journey/adaptation.ts`, `APPLICABLE_CHANGES` += `session_minutes`, `exercise_swap` ; écran de confirmation des suggestions mémoire ; fin de cycle | A10, A11 |
| **W-7** Intégrations | Daily Coach lit la séance figée ; Programme affiche semaine allégée et reports ; Progress Journey : prévu/fait en faits ; `explain.ts` : « Pourquoi cette charge ? » ; notifications : aucun nouveau déclencheur prévu (si un est ajouté : migration des contraintes de `notification_history`) | A4 |
| **W-8** E2E + revue | parcours complet (semaine figée → séance → remplacement → fin → adaptation proposée), changement de profil en cours de semaine, deux appareils simulés, revue critique | — |

---

## 7. Points à valider par Souhayb

1. **Cycle de 6 semaines** avec semaine allégée proposée à la fin (recommandé) — ou pas de cycle (programme continu, seulement les règles d'adaptation).
2. **Difficulté ressentie** : 5 niveaux en mots en fin de séance (recommandé), le RPE par série restant facultatif — ou RPE 1–10 obligatoire.
3. **Historique existant** : séances passées rattachées à un programme « reconstitué » marqué comme tel, sans prescription inventée (recommandé) — ou historique ancien laissé sans programme.
4. **Nouvelles raisons de remplacement** `busy_equipment` (« la machine est prise ») et `discomfort` (« ça me gêne ») (recommandé).

Les seuils des §4.5–4.6 sont des paramètres de conception à faire relire, comme ceux des phases précédentes.
