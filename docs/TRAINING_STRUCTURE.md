# Adaptations structurelles du Workout Coach (W-5, D-037)

> Règle absolue (D-036) : **micro-progression → automatique et réversible ; changement structurel → proposition explicite → acceptation → application → historique de la décision.**

Ce document décrit ce qui change la **structure** de l'entraînement (au-delà d'une micro-progression) : quand c'est proposé, comment l'utilisateur répond, combien de temps ça dure, ce que ça change dans les séances, et comment on suit l'effet. Code : `src/domain/training/structure.ts` (effets sur les séances, faits lus), `src/domain/journey/structural.ts` (règles de proposition), `src/domain/journey/structural-signals.ts` (assemblage des faits), `src/domain/journey/proposal.ts` (formulation), `src/features/journey/ProposalCard.tsx` (écran).

## 1. Un seul moteur

Pas de second moteur. Le flux est :

```
Progression Engine (par exercice) ─┐
faits stockés (séances, raisons,  ─┼─▶ signaux structurés ─▶ Adaptation Engine `adapt()` ─▶ proposition
check-ins, programme, décisions)  ─┘        (StructuralSignals)       (mode: 'proposed')
                                                                                │
   suivi de l'effet ◀── nouvelle prescription / nouvelle version ◀── réponse de l'utilisateur (journal `adjustments`)
```

- Sous la règle de sécurité, `adapt()` retourne avant toute règle structurelle : aucune proposition structurelle, aucune intensification, le message de sécurité reste affiché (CLAUDE.md règle 8).
- `noPush` (mineur, poids bas) : rien ne monte en charge (`gateProgression`), aucune règle structurelle n'augmente l'intensité ou le volume ; les propositions W-5 ne font que réduire ou remplacer.
- Jamais sur une seule séance : chaque signal est une répétition (séances, jours, occurrences).
- Jamais de changement d'alimentation à partir d'une stagnation d'entraînement seule.

## 2. Types d'adaptation (audit)

Audit des types existants avant ajout : `light_week` et `sessions_per_week` existaient (Adaptation Engine), `reduce_load` / `add_recovery` / `training` sont des `kind` existants. Ajouts **minimaux**, comme clés de changement (`change_key`), pas comme nouveaux `kind` (la contrainte SQL des `kind` est inchangée) :

| Clé | `kind` | Portée | Effet | Nouvelle version ? |
|---|---|---|---|---|
| `light_week` (existant) | `reduce_load` | semaine (7 j) | version allégée de chaque séance (variante du jour) + aucune hausse de charge (`held_deload`) | non |
| `restart` | `reduce_load` | séances (2, 14 j max) | une série de moins, effort cible ≤ 7, charge un palier sous la dernière (`progression.reason.restart`) | non |
| `reduce_volume` | `reduce_load` | semaines (14 j) | une série de moins par exercice, jamais sous 2 (4→3, 3→2, 2→2) ; aucune hausse (`held_volume`) | non |
| `easier_variant` | `training` | séances (2, 21 j max) | l'exercice est remplacé par la variante plus facile du catalogue (mêmes séries et fourchette), la ligne garde l'exercice qu'elle remplace (`purpose_target`) | non |
| `exercise_change` | `training` | durable | l'exercice est exclu de la version suivante ; le moteur met à sa place ce qu'il connaît (aperçu montré avant) | **oui** (`program.reason.adaptation`) |
| `cycle_review` | `training` | choix | bilan de fin de cycle : continuer / semaine allégée / faire évoluer | `evolve` seulement (`program.reason.cycle`) |
| `sessions_per_week` (existant) | `training` | durable | fréquence ; le split suit la fréquence | oui (inchangé) |

Types candidats non créés : `deload_week` (= `light_week`), `frequency_change` (= `sessions_per_week`), `split_change` (le moteur dérive le split de la fréquence, il n'existe pas de split indépendant à changer), `restart_after_break` (= `restart`).

## 3. Règles de déclenchement (`structural.ts`, `adaptation.ts`)

Ordre (le Daily Coach montre la première non répondue, une par jour au plus) :

1. **Sécurité** active → rien de structurel (seulement repos conseillé + semaine allégée si `training_load`, comme avant).
2. **Reprise** (`restart`) : aucune séance depuis ≥ 14 jours, au moins 2 séances avant la pause, une séance prévue dans les 7 jours. Prioritaire : les autres signaux datent d'avant la pause ; les règles 3 à 6 se taisent.
3. **Fatigue répétée** : fatigue déclarée ≥ 4/5 sur 3 jours des 7 derniers, ou effort ressenti ≥ 9 deux semaines de suite.
   - s'il y a eu un vrai entraînement à alléger (≥ 2 séances complètes en 14 jours et plus de complètes que de courtes/allégées) → semaine allégée proposée ;
   - sinon → conseil de repos (`fatigue_rest`), pas de changement de structure.
4. **Baisse de performance** sur ≥ 2 exercices (tendance, jamais une séance) → semaine allégée proposée.
5. **Plateau qui dure** (≥ 35 jours sans meilleure séance) **et** séances récentes très dures → semaine allégée proposée (`stagnation_hard`).
6. **Volume incomplet** : sur les 3 dernières séances complètes (hors arrêt pour manque de temps, hors jour de fatigue), ≥ 2 avec des séries en moins sur ≥ 2 exercices → `reduce_volume`.
7. **Par exercice** (dans l'ordre) :
   - gêne (`discomfort`) sur ≥ 2 séances → question de changement durable (« Cet exercice t'a gêné plusieurs fois. Veux-tu le remplacer dans ton programme ? ») ;
   - préférence (`preference`, `dislike`) sur ≥ 2 séances → question de changement durable ;
   - trop difficile (`cant_do`, `too_hard_today`, `easier`) ≥ 2 fois **ou** ≥ 3 séances sur 4 sous la fourchette → variante plus facile (groupées, 3 au plus, une seule proposition) ;
   - encore trop difficile après une variante terminée (ou aucune variante au catalogue) → question de changement durable.
8. **Fin de cycle** (6 semaines depuis le début de la version ou la dernière réponse au bilan) → `cycle_review`.

Stagnation simple (≥ 21 jours) : **conseil** (`progression_review`), jamais un changement. Stagnation qui dure : conseil avec l'ordre de prudence (continuer, revoir le repos, alléger un peu le volume, changer de variante, semaine plus légère) ; à la fin du cycle, les exercices stagnants sont les candidats de l'évolution.

Raisons de remplacement (`REASON_CATEGORY`) :

| Catégorie | Raisons | Effet possible |
|---|---|---|
| temporaire | `busy_equipment`, `no_equipment`, `no_time`, `other` | **jamais** un changement de programme |
| préférence | `preference`, `dislike` | question durable après répétition |
| trop difficile | `cant_do`, `too_hard_today`, `easier` | variante plus facile, puis question durable |
| sécurité | `discomfort` | question durable, sans diagnostic |
| aucune | `harder` | rien |

## 4. Réponses : appliquer, pas maintenant, refuser, revenir en arrière

Chaque réponse est une **nouvelle ligne** du journal `adjustments` (append-only, trigger `adjustments_immutable`), avec l'id stable de la proposition (`proposal_id = kind:change[.cible]:lundi`), la raison et les faits.

| Réponse | Statut | Effet | Proposé à nouveau |
|---|---|---|---|
| Appliquer (libellé propre : « Alléger cette semaine », « Réduire le volume »…) | `applied` | s'applique aux séances pas encore commencées (ou version suivante) | pas tant qu'il est en vigueur ; puis 14 jours d'écart (temps de voir l'effet) |
| Pas maintenant | `postponed` | rien | après 7 jours, si le signal est toujours là |
| Refuser (« Le garder » pour un exercice) | `declined` | rien | après 28 jours, et pour un exercice seulement avec de **nouvelles** occurrences |
| Revenir en arrière | `reverted` (nouvelle ligne) | les séances pas commencées sont re-prescrites sans la structure ; une version durable est suivie d'une nouvelle version qui la défait | après 28 jours |

- Changement durable d'exercice : deux étapes (« Le remplacer » → « C'est un changement durable… On confirme ? » → « Confirmer »).
- Fin de cycle : un bouton par option, plus « Pas maintenant » ; chaque option a sa portée (`cycleOptionScope`).
- « Pourquoi ? » : les faits lus par la règle (`evidence`), un par ligne, jamais une estimation.
- Ce qu'affiche chaque proposition : ce qui change (exact, avec les noms d'exercices), pourquoi (raison factuelle), la durée, l'impact concret.

## 5. Durée (portée)

Toute adaptation a une fin connue **avant** l'acceptation (`scope`, `effective_to`, `session_count`) :

| Portée | Fin |
|---|---|
| `week` | `effective_from + 6` (7 jours) |
| `weeks` | `effective_from + jours − 1` |
| `sessions` | après N séances faites sous la décision (`workout_sessions.adjustment_id`), ou au maximum de jours |
| `durable` | aucune date ; seul « Revenir en arrière » ou une nouvelle décision la termine |

Une semaine allégée décidée avant W-5 (sans `effective_to`) dure 7 jours, comme avant. À l'échéance, le programme reprend ; les règles réévaluent ensuite avec des faits nouveaux.

## 6. Ce que ça change dans les séances

- Temporaire (`restart`, `reduce_volume`, `easier_variant`) : `ensureWeek` / `refreshWeek` re-prescrivent **les séances pas commencées** via `shapeTemplate`, liées à la décision (`adjustment_id`). L'empreinte de la prescription inclut la structure : appliquer, expirer ou revenir en arrière produit une nouvelle prescription (l'ancienne passe `superseded`), jamais une modification. Les séances faites, ouvertes, adaptées ou déplacées ne bougent pas (D-033).
- Semaine allégée : la séance du jour est proposée en version allégée par le Daily Coach (variante du jour, `workout.light_week`), les autres jours de la semaine aussi à l'ouverture ; les exercices principaux restent ; `gateProgression` bloque toute hausse (`held_deload`). Le programme entier n'est jamais transformé.
- Durable (`exercise_change`, `cycle_review` → `evolve`) : nouvelle version de programme (`durableTraining` → `ensureProgram`), raison `program.reason.adaptation` ou `program.reason.cycle`, liée à la décision. Le profil n'est pas modifié : les exclusions du profil et celles décidées ici s'additionnent.
- Pause longue sans reprise acceptée : la règle micro `held_break` (aucune hausse si aucune séance depuis 14 jours) s'applique seule, sans rien changer d'autre.

## 7. Nouvelle version de programme : quand

| Oui | Non |
|---|---|
| changement durable d'exercice | semaine allégée |
| changement de fréquence (split dérivé) | reprise après pause (séances re-prescrites) |
| évolution de fin de cycle (rotation d'exercices) | volume réduit, variante plus facile (temporaires) |
| revenir en arrière sur un changement durable | « continuer » en fin de cycle (le cycle redémarre à la date de la réponse) |
| | séance courte, allégée du jour, micro-progression |

## 8. Catalogue (`exercises.ts`)

Audit : chaque exercice a `pattern`, `muscles`, `equipment`, `level`, `compound`, `loadIncrementKg`. Il manquait les relations : ajout de `EASIER_VARIANTS` (ids → ids, 22 entrées), `easierVariants()` et `harderVariants()` (relation inverse). Test : chaque paire existe, garde le même mouvement et n'est jamais plus difficile. Aucune relation par nom ; aucun exercice inventé ; sans variante connue (ou sans le matériel), rien n'est proposé. Les alternatives restent celles du moteur (même mouvement, matériel, niveau).

## 9. Suivi de l'effet (`adaptationEffects`)

Pour chaque adaptation appliquée : cause (raison + faits), intervention, période, avant/après sur le même nombre de jours (séances prévues, faites, jours de fatigue), observations. Jamais une causalité : « Après cette adaptation, tes séances ont été mieux complétées (14 jours comparés aux 14 jours d'avant). » L'apprentissage (ajuster les règles selon l'effet) est laissé à W-6.

## 10. Écrans

- **Aujourd'hui** : une proposition structurelle au plus (`primaryProposal`), jamais sous sécurité.
- **Progression** : seulement « Programme allégé cette semaine » et « Exercice remplacé après confirmation » (pas de refonte, W-6) ; la section « Ton plan cette semaine » liste les propositions et la dernière décision, avec « Revenir en arrière » et les observations d'effet.
- **Programme** : le libellé de la structure du jour (semaine allégée, volume réduit, variante, reprise).
- **Fin de séance** : la question de préférence écrit la même décision `exercise_change` que le Daily Coach (une seule source).

## 11. Multi-appareil et hors ligne

- Une décision est une ligne : aucune n'est perdue. Deux appareils qui répondent différemment hors ligne gardent leurs deux lignes ; la décision en vigueur est la plus récente (`decided_at`, puis id), la même partout (`effectiveDecisions`). Une annulation est toujours postérieure à ce qu'elle annule.
- Les prescriptions convergent : après la sync, chaque appareil re-prescrit à partir de la décision en vigueur, avec les mêmes ids.
- Hors ligne : voir, répondre et s'entraîner fonctionne (tout est local) ; la sync pousse les réponses ensuite.

## 12. Mémoire (`keptExercises`)

Décision : **pas de nouvelle table**. « Le garder » est une décision `declined` sur `exercise_change` (synchronisée, exportée, supprimée avec le journal, sans texte libre). La mémoire compte les séances de préférence jusqu'à la réponse ; la question ne revient qu'avec autant de nouvelles. Les réponses locales d'avant W-5 (`keptExercises`) sont encore lues, plus écrites. Les raisons temporaires ne deviennent jamais des préférences.

## 13. Seuils (`STRUCTURE`, tous à faire relire par un professionnel) [relire]

| Paramètre | Valeur |
|---|---|
| durée d'une semaine allégée | 7 jours |
| volume réduit | 14 jours, −1 série, minimum 2 séries |
| variante plus facile | 2 séances, 21 jours max |
| reprise | après 14 jours sans séance (≥ 2 séances avant), 2 séances, −1 série, effort ≤ 7, −1 palier |
| répétition minimale | 2 occurrences |
| en difficulté | 3 séances sous la fourchette sur 4 |
| séances incomplètes | 2 sur 3, au moins 2 exercices |
| fatigue → semaine allégée | 3 jours ≥ 4/5 en 7 jours et ≥ 2 séances complètes en 14 jours |
| plateau qui dure | 35 jours |
| refus / annulation | 28 jours avant de reproposer |
| pas maintenant | 7 jours |
| écart après une adaptation terminée | 14 jours |
| propositions groupées | 3 exercices max |
| fenêtre des raisons | 42 jours |
| cycle | 6 semaines (`cycle_weeks` de la version) |
