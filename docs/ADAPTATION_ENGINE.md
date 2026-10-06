# Adaptation Engine, Weekly Check-in et adhérence

Statut : **architecture validée** (D-028). Modules : `src/domain/journey/adaptation.ts`, `adherence.ts`, `weight-basis.ts`, `weekly-checkin.ts`.
Date : 2026-10-01. Base : `docs/TRANSFORMATION_JOURNEY.md` §4.3 (règles générales et fourchettes de rythme, reprises ici et rendues exécutables).

Principe : **Données → règles → moteur → recommandation → explication**. Chaque recommandation porte les données qui la justifient, une explication lisible et ce qu'elle change exactement. Les changements importants sont **proposés** ; rien de ce qui touche aux calories ou au nombre de séances n'est appliqué sans un geste de l'utilisateur.

## 1. Entrées

`JourneyState` (sécurité, objectif, tendance, profil), adhérence (§3), base de poids (§4), check-ins quotidiens et hebdomadaires, issues des repas et des séances, séries (charges, répétitions, RPE), budget et dépenses, changements de disponibilité (profil), décisions passées (`adjustments`).

## 2. Sorties

```ts
type AdaptationKind =
  | 'none' | 'nutrition' | 'training' | 'planning' | 'reduce_load' | 'add_recovery' | 'simplify_tracking';

interface Recommendation {
  id: string;                          // `${kind}:${weekStart}` : une recommandation par type et par semaine
  kind: AdaptationKind;
  change: { key: string; from?: number | string; to?: number | string };   // valeur précise (kcal/jour, séances/semaine…)
  reason: { key: string; params: Record<string, string | number> };        // explication affichée
  evidence: Record<string, string | number>;                                // données utilisées (tendance, adhérence, RPE…)
  mode: 'proposed' | 'advice';         // proposed : un geste pour appliquer ; advice : conseil sans changement du plan
  blockedBy?: 'safety' | 'calibration' | 'not_enough_data' | 'cooldown' | 'low_adherence';
}
```

Toujours au moins une sortie : `none` avec sa raison (« Ton plan fonctionne : on ne change rien » ou « Pas assez de pesées pour conclure : on ne change pas tes calories »).

## 3. Adhérence (`adherence.ts`)

Adhérence ≠ perfection. Elle répond à « est-ce que le plan est faisable ? », jamais « est-ce que tu as bien fait ? ».

### Séances

| Issue | Compte comme | Source |
|---|---|---|
| faite (complète) | faite | `completedSessions` |
| raccourcie (15–20 min) ou allégée | **faite** | variante `short` / `light` |
| remplacée (marche, mobilité, autre sport) | « adaptée » : comptée à part, ni faite ni manquée | issue `replaced` |
| reportée puis faite | faite (à sa nouvelle date) | `rescheduled` |
| reportée, pas encore faite | ni l'un ni l'autre tant que la nouvelle date n'est pas passée | |
| sautée (choix explicite) | non faite, raison gardée si donnée | issue `skipped` |
| jour passé sans rien noter | « non renseignée » (pas « ignorée ») | |
| repos planifié | hors calcul | plan |

`sessionAdherence = faites / (prévues jusqu'à aujourd'hui − remplacées)`, sur 14 et 28 jours. Exemple : 3 prévues, 2 faites → 67 %. Affiché seulement en phrase positive (« 2 séances sur 3 cette semaine »), jamais en rouge, jamais seul ; il sert surtout aux règles.

### Repas

Statuts : `planned` (non renseigné), `eaten`, `skipped`, `replaced` (mangé autre chose), avec une **raison facultative** : pas faim, pas le temps, ingrédient manquant, restaurant, envie d'autre chose, oubli. La raison n'est jamais devinée : sans réponse, elle reste vide. `mealLogging = repas notés / repas prévus` (14 jours). Un repas remplacé est noté mais ses calories sont inconnues (§ sécurité, `docs/DAILY_COACH.md` §5).

### Exercices

Exercice prévu, réalisé (séries), remplacé (vers quel exercice) et **raison du remplacement** (`dislike`, `cant_do`, `no_equipment`, `easier`, `harder`). Deux remplacements « je n'aime pas » ou « je ne peux pas » du même exercice, sur deux séances différentes → la mémoire du parcours propose de le retirer du programme (l'utilisateur confirme ; il rejoint alors `refusedExerciseIds`, déjà synchronisé).

## 4. Poids de référence (`weight-basis.ts`)

Le poids saisi à l'onboarding ne sert pas indéfiniment, mais une pesée isolée ne change rien.

- **Paliers** tous les **14 jours** depuis le début du parcours.
- À chaque palier : s'il y a au moins **4 pesées dans les 14 derniers jours**, la moyenne des 7 derniers jours (au moins 2 pesées, sinon des 14) devient candidate.
- La base change seulement si l'écart avec la base actuelle est d'au moins **1 kg** ; elle est arrondie à 0,5 kg.
- **Gelée vers le bas** tant qu'une règle de sécurité est active : elle ne baisse pas (ce qui augmenterait le déficit), elle peut monter.
- Calcul **déterministe à partir du journal des pesées** (rejoué du début à aujourd'hui) : rien à stocker, deux appareils obtiennent la même base.
- La base remplace `snapshot.user.weightKg` dans le calcul des cibles (`computeNutritionTargets`) ; le plancher (métabolisme de base, D-022) est recalculé avec elle. Le plan repas est régénéré (repas déjà notés gardés). L'écran Nutrition dit : « Tes besoins ont été recalculés avec ta moyenne de poids récente (78,5 kg). »

## 5. Règles de l'Adaptation Engine

Évaluées dans cet ordre ; la première qui bloque est dite à l'utilisateur.

1. **Sécurité active** : aucune adaptation qui augmente le déficit ou le volume. Seules sorties possibles : `add_recovery`, `reduce_load`, et pour `fast_weight_loss` / `low_intake` une proposition `nutrition` de **+100 à +150 kcal/jour**.
2. **Calibration** (14 premiers jours) : pas d'adaptation calorique (« on apprend à te connaître »).
3. **Adhérence faible** (séances < 70 % ou repas notés < 70 % sur 14 jours) : on simplifie le **plan**, jamais les calories. `training` −1 séance/semaine si 2 séances non faites deux semaines de suite ; `planning` (créneau habituel, séances plus courtes) ; `simplify_tracking` (conseil : noter seulement le repas principal ne suffit pas pour la règle de sécurité, donc le conseil porte sur la pesée 2×/semaine et un repas « type » à marquer en un geste).
4. **Données suffisantes** pour les calories : au moins 6 pesées sur 14 jours. Sinon `none` + « pas assez de pesées ».
5. **Cooldown** : une adaptation calorique au plus tous les **14 jours** ; une proposition refusée n'est pas reproposée avant 14 jours.
6. **Tendance** (moyenne mobile 7 j, sur 3 semaines) selon l'objectif :

| Objectif | Trop lent (3 semaines, adhérence ≥ 70 %) | Trop rapide |
|---|---|---|
| `fat_loss`, `weight_loss` | baisse < 0,25 %/sem → **−100 à −150 kcal** (jamais sous le plancher) | > 1 %/sem deux semaines → règle de sécurité (déjà) + **+100 à +150 kcal** |
| `muscle_gain` | hausse < 0,1 %/sem → **+100 à +150 kcal** | > 0,75 %/sem deux semaines → **−100 kcal** |
| `recomposition` | tour de taille **et** charges stables 4 semaines → `training` (progression revue), pas de calories | perte > 0,5 %/sem deux semaines → **+100 kcal** |
| `maintenance`, `fitness`, `performance` | dérive > 1,5 kg sur 4 semaines → **±100 kcal** | — |

7. **Charge** : RPE moyen ≥ 9 deux semaines, ou fatigue ≥ 4 déclarée 3 jours sur 7 → `reduce_load` (semaine allégée : variante `light`, −40 % de séries) ; fatigue forte + séances au-dessus du plan → `add_recovery` (un jour de repos en plus).
8. **Planning** : 2 reports ou plus sur 2 semaines vers le même autre jour, ou disponibilités modifiées → `planning` (déplacer la séance vers le créneau réellement utilisé).
9. **Budget** : dépenses au-dessus du budget 2 semaines → conseil `nutrition` (utiliser l'inventaire) ; aucun prix inventé.
10. **4 semaines à 100 %** après une réduction de séances → proposer de revenir au nombre initial.

Pas utilisés : 120 kcal (`kcalStep`) et 100 kcal (`smallKcalStep`, gain trop rapide, recomposition, dérive).

**Ce qui s'applique en un geste** (`APPLICABLE_CHANGES`) : calories par jour, nombre de séances par semaine, semaine allégée (variante `light` de chaque séance pendant 7 jours à partir du jour accepté, expliquée par la décision). Un jour de repos en plus et un nouveau jour de séance sont des **conseils** : l'app ne choisit pas à la place de l'utilisateur quelle séance sauter ni ne modifie ses disponibilités. Chaque proposition se décide une fois par semaine (Appliquer / Pas maintenant) ; la dernière décision appliquée peut être annulée (« Revenir à avant »).

**Profils protégés** (mineur, sous-poids, `noDeficitProfile`) : aucune baisse de calories sous leur repère ni sous le maintien, même si la perte est lente ; un décalage accepté plus tôt est borné de la même façon.

Bornes : jamais plus de ±150 kcal/jour par adaptation, jamais sous `floorKcal`, jamais au-dessus du maintien + 20 % en prise de masse. Le décalage calorique accepté est stocké (`adjustments`) et appliqué par le moteur nutrition, qui revérifie le plancher.

## 5 bis. Adaptations structurelles du Workout Coach (W-5, D-037)

Les règles d'entraînement structurelles (reprise, semaine allégée, volume réduit, variante plus facile, changement durable d'exercice, bilan de fin de cycle) sont des règles de ce moteur, appliquées après la branche sécurité : `journey/structural.ts`. Chaque réponse est une ligne du journal (§9), avec l'id stable de la proposition et sa portée. Détail, seuils et écrans : `docs/TRAINING_STRUCTURE.md`.

## 6. Plateau (stagnation)

Signal `plateau`, **jamais avant 28 jours** de parcours, sur une fenêtre de **21 jours** :

- objectif de poids : variation de la moyenne 7 j < 0,25 %/semaine sur 3 semaines, avec ≥ 6 pesées par 14 jours ;
- recomposition : tour de taille et meilleures séries stables (±1 cm, ±2,5 %) sur 4 semaines.

Avant toute adaptation, le moteur vérifie et **affiche** : l'adhérence (si < 70 %, ce n'est pas un plateau, c'est un plan à simplifier), la tendance, les données disponibles, l'objectif. Message : « Le poids fluctue, la tendance compte » + l'indicateur qui progresse (charges, tour de taille, régularité) + la proposition.

## 7. Weekly Check-in (`weekly-checkin.ts`)

Très court (moins d'une minute), proposé du **vendredi au mardi** (notification du dimanche 18:00, existante). Une seule fois par semaine ; une semaine sans check-in est simplement sautée.

| Question | Réponse |
|---|---|
| Comment s'est passée ta semaine ? | 1–5 |
| Énergie | 1–5 |
| Motivation | 1–5 |
| Fatigue | 1–5 |
| Alimentation | 1–5 (facile → difficile à suivre) |
| Entraînement | 1–5 |
| Difficulté de la semaine | 1–5 |
| Problème principal | aucun, temps, faim, envies, fatigue, douleur, motivation, budget, sorties/social, sommeil, planning, autre (facultatif) |
| Poids, tour de taille | **seulement** si l'utilisateur suit ces indicateurs (pesée ou mesure dans les 30 derniers jours) ; facultatifs |

Aucun texte libre (minimisation des données : la douleur, par exemple, est un choix, sans détail ni diagnostic). Stockage : table `weekly_checkins` (synchronisée).

## 8. « Ton bilan » (Weekly Review)

Étend `progress/weekly-review.ts` (qui calcule déjà marché / difficile / à adapter / semaine suivante à partir des données). Ajouts :

- **Ce qui a fonctionné** : séances (courtes comprises), repas notés, régularité, records, mesures — uniquement des faits.
- **Ce qui a été difficile** : la réponse du check-in (problème principal) + ce que montrent les données (séances non faites, journées difficiles) ; formulé sans reproche.
- **Ce qui peut être amélioré** : la réponse déterministe au problème principal (table `docs/TRANSFORMATION_JOURNEY.md` §4.2) + les recommandations de l'Adaptation Engine.
- **Plan de la semaine suivante** : nombre de séances (après adaptation acceptée), jours prévus, éventuelle semaine allégée.
- **Données manquantes dites** : « Pas de pesée cette semaine : je ne peux rien conclure sur ton poids. » Jamais de conclusion inventée.
- Sans check-in : le bilan se fait avec les seules données et le dit.

## 9. Traçabilité

Chaque décision (proposée, acceptée, refusée, annulée) est une ligne de `adjustments` : type, valeur avant/après, clé d'explication, données utilisées, date d'effet. « Pourquoi mon plan a changé ? » (`explain.ts`) répond depuis ces lignes.

## 10. Paramètres à faire relire

14 jours de calibration, 6 pesées / 14 jours, ±150 kcal, 14 jours de cooldown, 70 % d'adhérence, paliers de 14 jours et 1 kg pour la base de poids, 28 jours et 21 jours pour le plateau, seuils de RPE et de fatigue : **paramètres de conception**, regroupés dans `ADAPTATION` (`adaptation.ts`), à faire relire par un professionnel avec ceux de D-024/D-026.

## 11. Tests

Adhérence (chaque issue), repas sautés/remplacés (raison gardée, jamais devinée ; sécurité non trompée), exercice remplacé (mémoire après 2 « n'aime pas »), base de poids (pesée isolée sans effet, paliers, gel sous sécurité, rejeu déterministe), chaque règle de §5 et chaque blocage, plateau (jamais avant 28 jours, adhérence vérifiée d'abord), Weekly Check-in (validation, poids seulement si suivi), bilan (aucune conclusion sans donnée).
