# Progression Engine v2 (Workout Coach W-4)

Décision : D-035 (`docs/DECISIONS.md`). Code : `src/domain/training/progression.ts` (règles), `src/domain/training/history.ts` (historique par exercice), `src/domain/training/week.ts` (`proposedLoads`, `refreshWeek`, `progressionSignals`), `src/domain/journey/adaptation.ts` (`gateProgression`, signaux de plan).

Principe : **une recommandation n'est jamais un fait**. Elle est figée dans une prescription **future** ; le passé n'est jamais réécrit (D-033). Le moteur est prudent : garder la charge, refaire, progresser lentement sont des résultats normaux.

## 1. Pipeline

```
PRESCRIPTION (planned_exercises, figée)
  → RÉALISATION (exercise_logs : charges, répétitions ou secondes)
  → DIFFICULTÉ (exercise_reports.difficulty, workout_sessions.difficulty, RPE « Très difficile » d'une série)
  → FATIGUE / CONTEXTE (daily_checkins via declaredFatigue, variante, arrêt, non fait, remplacement)
  → HISTORIQUE (exerciseHistory : 42 jours, l'exercice seul)
  → ANALYSE (readExposure : sommet, sous la plage, très difficile, neutre)
  → RECOMMANDATION (recommendProgression : action + raison + confiance + preuves)
  → CONTEXTE DU JOUR (gateProgression, Adaptation Engine : sécurité, fatigue du jour, profil protégé)
  → FUTURE PRESCRIPTION (ensureWeek / refreshWeek : nouvelle prescription de séance, jamais une nouvelle version)
```

## 2. Données utilisées (et seulement elles)

| Donnée | Source | Usage |
|---|---|---|
| Prescription du jour (séries, plage, charge proposée) | `planned_exercises` de la séance, variante faite | la plage contre laquelle la séance est lue |
| Séries | `exercise_logs` (charge, répétitions **ou** secondes, RPE facultatif) | charge de travail = la plus lourde ; séries à cette charge |
| Difficulté de l'exercice / de la séance | `exercise_reports.difficulty`, `workout_sessions.difficulty` (1–5) | 5 = très difficile |
| Ressenti d'une série « Très difficile » | RPE 10 stocké par W-3 | très difficile |
| Fatigue déclarée | `daily_checkins` du jour ou de la veille (`declaredFatigue`, la définition du Journey) | séance neutre, pas comptée contre |
| Variante faite | `completedSessions.variant` / `sessionVariants` | allégée = exclue ; courte = neutre si non complète |
| Séance arrêtée | `outcome_reason` (`stopped`) | neutre ; arrêt pour douleur = jamais un succès, bloque la hausse |
| Non fait, remplacé | `exercise_reports.not_performed` + raison, `exercise_substitutions` + raison | voir §6 |
| Régularité | séances prévues avec cet exercice faites / prévues et passées (fenêtre) | condition de stagnation |
| Palier de charge | `getExercise(id).loadIncrementKg` (catalogue) | jamais une micro-charge ; 0 = poids du corps |

Rien d'autre : pas d'estimation de 1RM, pas de volume « score », pas de calories. Une donnée absente reste absente.

## 3. Lecture d'une séance (`readExposure`)

- **Charge de travail** : la charge la plus lourde de l'exercice ce jour-là ; on lit les séries faites à cette charge.
- **Sommet** (`top`) : toutes les séries prescrites faites, chacune ≥ haut de la plage.
- **Solide** : sommet et pas très difficile.
- **Très difficile** (`hard`) : difficulté de l'exercice (ou à défaut de la séance) ≥ 5, ou une série « Très difficile ».
- **Sous la plage** (`miss`) : au moins une série sous le bas de la plage.
- **Neutre** (ni pour ni contre) : allégée (toujours) ; arrêtée pour douleur (toujours) ; arrêtée pour une autre raison, courte ou sous fatigue déclarée **si pas au sommet**.

## 4. Règles de décision (`recommendProgression`)

Lues sur les séances **décisives** (non neutres), la plus récente en dernier :

| Ordre | Situation | Action | Raison |
|---|---|---|---|
| 1 | Aucune séance | `no_recommendation` (aucune charge) | `no_history` / `not_done` |
| 1 bis | Que des séances neutres | `maintain` à la charge réelle (allégée : la charge prescrite, jamais la charge allégée) | `context_light/short/stopped/fatigue` |
| 2 | Dernière séance sous la plage, ≥ 2 sur les 3 dernières, charge et palier connus | `reduce_load` d'**un** palier, objectif = bas de plage | `repeated_misses` |
| 2 bis | idem au poids du corps | `maintain` | `consolidate` |
| 2 ter | Une seule séance sous la plage | `retry` (même charge, bas de plage) | `single_miss` |
| 3 | Séance neutre plus récente encore sous la plage ou très difficile | `maintain`, rien ne monte dessus | `context_*` |
| 4 | Gêne (`discomfort`, arrêt pour douleur) ou « trop difficile aujourd'hui » depuis la dernière séance | `maintain` | `recent_discomfort` / `recent_too_hard` |
| 5 | Une seule séance décisive | `maintain`, même objectif (première lecture) | `first_reading` |
| 6 | Sommet solide **2 fois de suite à la même charge** | `increase_load` d'un palier, objectif = bas de plage | `top_confirmed` |
| 6 bis | idem au poids du corps / maintien | `maintain` au haut de plage (pas de charge inventée) | `bodyweight_top` / `hold_top` |
| 6 ter | idem, palier inconnu du catalogue | `maintain` | `no_increment` |
| 7 | Sommet solide une fois | `maintain`, objectif = haut de plage | `confirm_top` |
| 8 | Très difficile | `maintain` | `hard_effort` |
| 9 | Dans la plage, effort raisonnable | `increase_reps` : +1 répétition (maintien : +5 s), plafonné au haut de plage | `add_rep` / `hold_longer` |

**Double progression** : répétitions d'abord (+1 par séance réussie à partir de la 2ᵉ séance) ; au haut de plage, confirmé une seconde fois → +1 palier et retour au bas de plage.

`reduce_volume` et `regress` (variante plus facile) ne sont **pas** produits : les prescriptions ne savent pas encore représenter une variante plus facile d'un exercice (W-5). Une baisse se fait d'un palier de charge, jamais plus.

## 5. Contexte du jour (`gateProgression`, Adaptation Engine)

Le moteur de progression ne lit pas le contexte du jour : c'est l'Adaptation Engine qui décide, avec `JourneyState` (un seul moteur de sécurité, une seule couche de décision).

| Contexte | Effet |
|---|---|
| Sécurité active (toutes règles, dont `training_load`) | toute hausse → `maintain` à la dernière charge réelle (`held_safety`) |
| Fatigue déclarée élevée **aujourd'hui** | la hausse de la séance **d'aujourd'hui** → `maintain` (`held_fatigue`) ; les autres jours ne changent pas |
| Profil protégé (mineur, IMC bas : `profile.noPush`) | jamais de hausse de charge (`held_protected`) ; +1 répétition dans la plage reste possible |
| Garder, refaire, baisser | passent toujours |

Une séance déjà ouverte n'est plus re-prescrite : si le contexte change ensuite (bilan du jour rempli après ouverture), l'écran de séance garde la charge de la dernière fois (préremplissage W-3, `keep_load`).

## 6. Non fait, remplacé, courte, allégée

| Fait | Lecture |
|---|---|
| Machine prise, manque de temps, pas de matériel | aucun signal (listé dans les preuves exclues) |
| Trop difficile aujourd'hui | bloque une hausse jusqu'à la prochaine séance réelle |
| Gêne / arrêt pour douleur | bloque une hausse ; la raison cite un professionnel de santé si la gêne revient |
| Préférence, n'aime pas | question de programme : déjà traitée par la mémoire du Journey (« retirer cet exercice ? »), jamais une baisse de niveau |
| Remplacé | les séries vont à l'historique **du remplaçant** ; l'exercice remplacé reçoit seulement « remplacé » + raison |
| Courte | moins de volume ≠ incapacité : neutre si incomplète, comptée si au sommet |
| Allégée | jamais une baisse, une stagnation ou un mauvais score ; exclue des tendances de Progression |

## 7. Stagnation et tendance (signaux de plan)

- **Stagnation** (`stagnation`) : ≥ 4 séances décisives complètes de l'exercice, étalées sur ≥ 21 jours, régularité ≥ 70 %, aucune ne bat la première (charge puis répétitions), moins de la moitié sous fatigue déclarée. Sinon : pas de plateau, avec la raison (`not_enough_data`, `low_adherence`, `fatigue`, `moving`). Régularité inconnue → pas de plateau.
- **Tendance à la baisse** (`downwardTrend`) : les 3 dernières séances décisives chacune sous la précédente (moins de répétitions à la même charge, ou charge plus basse **non prescrite** : une baisse prévue est un choix).
- **Adaptation Engine** (`adapt({ progression })`) : ≥ 1 exercice en stagnation → conseil `progression_review` (« c'est normal par moments ; varier l'exercice, le repos ou la technique ») ; ≥ 2 exercices en baisse → semaine allégée **proposée** (`light_week`, un geste, jamais imposée). Sous sécurité, seule la sécurité parle.

## 8. Vers la prochaine prescription (sans nouvelle version)

| Changement | Nouvelle version de programme ? | Nouvelle prescription de séance ? |
|---|---|---|
| Fréquence, matériel, objectif, niveau, durée, exercices refusés, moteur (D-032) | **oui** | oui (à partir de la date d'effet) |
| Progression d'un exercice (charge, objectif de répétitions, maintien, baisse) | **non** | oui, pour les séances **non commencées** de la semaine |
| Variante du jour (courte, allégée) | non | non (lignes ajoutées sous leur variante, D-034) |

- `ensureWeek` fige les séances de la semaine avec les propositions du moment (sans contexte du jour).
- `refreshWeek` (appelé par `useJourney` avec le contexte) re-prescrit une séance si : date ≥ aujourd'hui, version active, **aucun fait** (pas même ouverte), pas d'adaptation du jour, pas une copie déplacée, et les propositions diffèrent de celles stockées. Nouvel id = `revision(programme, séance, empreinte des propositions)` : tous les appareils calculent le même. Une prescription identique plus ancienne est **ressuscitée**, jamais copiée ; la précédente est `superseded`, jamais modifiée ni supprimée.
- Exemple : lundi 70 kg × 10 × 3 (2ᵉ fois) → mercredi prescrit 72,5 kg × 6 ; lundi reste 70 kg pour toujours.
- Les propositions sont appliquées à la prochaine prescription automatiquement, comme en W-2 ; l'utilisateur garde la main pendant la séance (« Proposé » se modifie, rien n'est imposé).

## 9. Ce que l'utilisateur voit

- **Séance** : « Proposé : 72,5 kg × 6 reps » (ou « Objectif : 10 reps par série » au poids du corps), une ligne courte (« Petite hausse proposée. », « On garde la même charge. », « Tu peux viser une répétition de plus. », « On refait la même chose. », « Charge un peu plus légère pour repartir sereinement. »), et sous « Pourquoi cet exercice ? » la raison avec ses faits (« Tu as atteint le haut de ta plage (10) 2 fois : petite hausse proposée (+2,5 kg)… ») et la confiance (« Basé sur une seule séance : c'est une première lecture. »).
- **Daily Coach** : sur une séance complète seulement, « Objectif de la séance : garder la charge » / « tu peux viser une répétition de plus » / « une petite hausse de charge, prévue », lu dans la prescription stockée (`sessionGoal`).
- **Progression** : records de durée pour les maintiens (temps mesuré) ; tendances sans les séances allégées ni courtes. Aucun score.

## 10. Seuils (`PROGRESSION`, à faire relire par un professionnel)

| Seuil | Valeur | Rôle |
|---|---|---|
| `windowDays` | 42 | historique lu (un cycle de 6 semaines) |
| `minSessionsToIncrease` | 2 | une séance = première lecture, jamais une hausse |
| `confirmations` | 2 | sommets solides de suite à la même charge avant +1 palier |
| `missesForReduce` / `missWindow` | 2 / 3 | séances sous la plage avant −1 palier |
| `reduceSteps` | 1 | jamais plus d'un palier de baisse |
| `holdStepSeconds` | 5 | progression d'un maintien |
| `hardDifficulty` | 5 | « très difficile » (1–5) |
| `hardRpe` | 9,5 | série « Très difficile » (RPE 10 stocké) |
| `plateauSessions` / `plateauMinDays` / `plateauMinAdherence` | 4 / 21 / 0,7 | stagnation |
| `trendSessions` | 3 | tendance à la baisse |
| `PERFORMANCE_DOWN_EXERCISES` (adaptation) | 2 | exercices en baisse avant de proposer une semaine allégée |

## 11. Tests

- `src/domain/training/__tests__/progression.test.ts` : matrice (bonne séance, mauvaise isolée, plusieurs mauvaises, fatigue, courte, allégée, remplacement, non fait, manque de temps, machine prise, très difficile, répétitions, charge, secondes, poids du corps, données insuffisantes, sécurité, profil protégé, stagnation, tendance, explication).
- `src/domain/training/__tests__/progression-week.test.ts` : historique réel (variante, remplaçant, non fait, régularité), futur seulement (lundi reste 70, mercredi 72,5), même id sur deux appareils, résurrection, séance ouverte / adaptée / déplacée / passée jamais touchée, fatigue du jour seulement, changement de profil (v1 intact, D-033).
- `src/services/__tests__/sync.training.test.ts` et `sync.db.test.ts` (Postgres réel) : la re-prescription passe par la sync existante sans conflit.
- `e2e/progression.spec.ts` : séance réussie → séance suivante proposée → « Pourquoi ? » ; fatigue → maintien ; courte → pas de régression ; allégée → pas de plateau ni de baisse.
