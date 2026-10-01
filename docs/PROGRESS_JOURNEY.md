# Progress Journey — « Mon évolution »

Statut : **architecture validée** (D-028). Module : `src/domain/journey/progress-journey.ts` + `milestones.ts`. Écran : onglet Progrès, titré « Mon évolution ».
Date : 2026-10-01. Règles fondatrices : `docs/TRANSFORMATION_JOURNEY.md` §0 (aucune estimation sur le corps, sécurité d'abord).

L'écran raconte **l'histoire de l'utilisateur** depuis le début : ce qu'il a fait, ce qui a bougé, ce qui reste constant. Pas un tableau de graphiques. Toutes les valeurs sont saisies ou mesurées ; une donnée absente est dite absente.

## 1. Modèle

```ts
interface ProgressJourney {
  startedOn: IsoDate;                 // plus ancienne date : onboarding ou première donnée
  sinceStart: {
    days: number;                     // durée du projet
    activeDays: number;               // jours avec séance, activité légère, repas noté, pesée ou check-in
    sessions: number;                 // séances faites (courtes et allégées comprises)
    regularity: { weeksWithSession: number; weeks: number; streakWeeks: number };
    adherence: Adherence | null;      // voir ADAPTATION_ENGINE.md §3, jamais en rouge
  };
  body: {
    weight: { startAvgKg: number | null; currentAvgKg: number | null; changeKg: number | null; entries: number } | null;
    waist: { startCm: number | null; currentCm: number | null; changeCm: number | null } | null;
    others: { kind: MeasurementKind; startCm: number; currentCm: number; changeCm: number }[];
    photos: null;                     // fonctionnalité non construite (politiques Storage manquantes) : section masquée
  };
  performance: {
    records: PersonalRecord[];        // nouvelles meilleures séries (charge ou répétitions), datées
    exercises: ExerciseTrend[];       // charge × répétitions de la meilleure série : début → maintenant
  };
  habits: {
    trainingWeeks: number;            // semaines avec au moins une séance
    mealsLoggedDays: number;          // jours avec au moins un repas noté
    activityDays: number;             // marches / mobilité notées
    weighInWeeks: number;
    checkins: number;
  };
  milestones: MilestoneStatus[];      // jalons atteints, datés, et chemin des objectifs intermédiaires
  order: ('since_start' | 'body' | 'performance' | 'habits')[];  // selon l'objectif (§3)
  bodyOrder: ('waist' | 'performance' | 'photos' | 'consistency' | 'weight')[];
  notes: { key: string; params?: Record<string, string | number> }[];  // phrases de contexte (recomposition, données manquantes)
}
```

- **Poids** : toujours la moyenne sur 7 jours (jamais la pesée du jour seule), comparée à la moyenne de la première semaine qui a au moins 2 pesées.
- **Records** : une série bat un record quand, pour un exercice, la charge est plus haute qu'avant à répétitions ≥ 1, ou le nombre de répétitions plus haut à charge égale ou supérieure. Pas de 1RM estimé (c'est une estimation).
- **Tendances** : meilleure série des 14 premiers jours de l'exercice vs des 14 derniers jours ; « stable » sous ±2,5 %.
- **Jamais affiché** : masse musculaire, masse grasse, calories brûlées, énergie active estimée par l'appareil, pourcentage de graisse.

## 2. Sections de l'écran

1. **Depuis le début** : « Ton projet a commencé il y a 47 jours. 31 jours actifs, 18 séances, 6 semaines d'affilée. » + adhérence formulée positivement (« 18 séances sur 21 prévues »).
2. **Corps** : poids (moyenne 7 j), tour de taille, autres mesures suivies ; saisie rapide d'une pesée et d'une mesure.
3. **Performance** : derniers records, exercices qui progressent (« Développé couché : 40 kg × 8 → 47,5 kg × 8 »).
4. **Habitudes** : semaines d'entraînement, jours de repas notés, activité légère, pesées, check-ins (en semaines, pour qu'un jour manqué ne casse rien).
5. **Ton parcours** : objectifs intermédiaires (chemin) et jalons atteints.

États : vide (premier jour : « Ton histoire commence aujourd'hui », un seul appel à l'action), données partielles (chaque section dit ce qui manque et comment l'obtenir), chargement, erreur.

## 3. Ordre selon l'objectif

Reprend `highlightedIndicators` : le poids n'est jamais le seul indicateur.

| Objectif | Ordre du bloc Corps / mise en avant |
|---|---|
| `recomposition` | **tour de taille → performance → photos → régularité → poids (secondaire, plus petit)** |
| `fat_loss` | tour de taille → poids → performance → régularité |
| `weight_loss` | poids → tour de taille → régularité |
| `muscle_gain` | performance → poids → régularité |
| `performance` | performance → régularité |
| `maintenance`, `fitness` | régularité → performance → poids |

**Recomposition** : une note s'affiche quand le poids est stable (±0,5 kg sur 4 semaines) : « Ton poids bouge peu, c'est attendu en recomposition : ton tour de taille et tes charges montrent mieux ce qui change. » Si tour de taille ou charges progressent, la note les cite avec leurs valeurs ; sinon elle propose de mesurer le tour de taille. Elle ne prétend jamais qu'un changement a eu lieu sans mesure.

## 4. Jalons (`milestones.ts`)

Peu de jalons, chacun avec un sens. Chaque jalon atteint porte sa date et la donnée qui le prouve (`sourceRef`).

| Id | Condition (données réelles) |
|---|---|
| `first_session` | première séance faite |
| `first_week` | 7 jours depuis le début et au moins une action notée (séance, repas, pesée, activité) |
| `sessions_10`, `sessions_25`, `sessions_50`, `sessions_100` | nombre de séances faites (courtes et allégées comprises) |
| `active_days_30` | 30 jours actifs |
| `first_month` | 4 semaines d'affilée avec au moins une séance |
| `weeks_streak_8`, `weeks_streak_12` | semaines d'affilée avec au moins une séance |
| `first_record` | premier record (après au moins 2 séances sur l'exercice) |
| `first_measured_improvement` | tour de taille −1 cm (perte, recomposition) ou moyenne de poids vers l'objectif de 1 kg ou 1 % (perte, prise), mesurées |
| `weight_goal_reached` | moyenne 7 j dans ±0,5 kg du poids visé |
| `checkpoint_<n>` | objectif intermédiaire n atteint (§5) |

### Célébrations

- Un jalon atteint est célébré **une seule fois** (table `journey_milestones`, `celebrated_at`), sur l'écran Aujourd'hui (carte de célébration, message de la catégorie `celebration`) et en notification (`milestone_reached`, catégorie Bilan).
- « 10 séances terminées 🔥 » vaut « −2 kg » : les jalons de comportement sont au même niveau que ceux du corps.
- **Jamais** de célébration tant que la sécurité est active (règle 8). Un jalon atteint pendant ce temps est enregistré sans célébration ; il n'est pas célébré après coup s'il date de plus de 7 jours.
- **Jamais** de célébration d'une baisse de poids pour un profil `noPush` (mineur, sous-poids), ni de `weight_goal_reached` vers le bas pour eux.

## 5. Objectifs intermédiaires

Un objectif de plusieurs mois est découpé en un **chemin de 5 étapes**, pour voir un progrès bien avant la fin :

| Étape | Condition | Repère de date |
|---|---|---|
| 1. Régularité | 4 semaines d'affilée avec au moins `min(2, séances prévues)` séances | début + 30 jours |
| 2. 10 séances | 10 séances faites | début + 5 semaines |
| 3. Premier progrès mesuré | `first_measured_improvement` (ou premier record pour `performance` / `fitness`) | début + 6 semaines |
| 4. Première hausse de performance | premier record après la semaine 2 | début + 8 semaines |
| 5. Bilan intermédiaire | moitié de la durée jusqu'à la date visée (ou semaine 12 sans date), avec le Weekly Check-in de cette semaine | moitié du parcours |

Le repère de date sert à l'ordre et au message (« bientôt »), jamais à un reproche : une étape non atteinte à sa date reste « en cours », jamais en rouge, jamais « ratée ».

## 6. Historique de progression

Tout ce que montre l'écran se recalcule depuis les données brutes synchronisées (séances, séries, pesées, mesures, repas notés, check-ins). Seuls les jalons célébrés sont stockés (pour ne pas célébrer deux fois). Un second appareil voit donc la même histoire après synchronisation.

## 7. Tests

Unitaires : durée, jours actifs, séances, régularité, records (charge, répétitions, pas de faux record au premier essai), tendances, recomposition (ordre et note), jalons (chaque condition, célébration unique, pas de célébration sous sécurité, `noPush`), objectifs intermédiaires. E2E : progression visible après des données semées, célébration de 10 séances, recomposition.
