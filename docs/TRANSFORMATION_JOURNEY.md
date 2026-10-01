# Transformation Journey Engine — conception

Statut : **conception validée par étapes**. Première brique livrée (D-024) : l'état du parcours (`src/domain/journey/state.ts`), la règle de sécurité (`src/domain/journey/safety.ts`), la voix du coach (`src/domain/journey/voice/`) et son premier canal de sortie, les notifications (`src/domain/notifications/`). Le reste (Daily Coach à l'écran, Weekly Check-in, Adaptation Engine, Progress Journey) est décrit ici et pas encore codé.
Date : 2026-10-01.

Ce document décrit comment Project You passe d'un générateur de plans à un **accompagnement de plusieurs mois jusqu'à l'objectif physique**. Il fixe l'architecture métier, les modèles de données, les règles et les parcours utilisateur avant d'écrire le code.

## 0. Trois règles fondatrices (demandées par Souhayb le 2026-10-01)

Elles priment sur tout le reste du document et sont reprises dans `CLAUDE.md` (règles 6 à 8).

1. **Un seul moteur.** Le Transformation Journey Engine est le seul moteur de motivation. Il calcule **un seul état de l'utilisateur** (`JourneyState` : objectif, progression, momentum, difficultés, sécurité), à partir des données enregistrées. Les notifications sont un **canal de sortie** de ce moteur, au même titre que l'écran Aujourd'hui ou le bilan de la semaine. Aucun canal ne recalcule sa propre version de l'état ; tous parlent avec la même voix (`journey/voice`).
2. **Aucune estimation inventée.** Si une valeur n'est ni mesurée par l'app ni saisie par l'utilisateur, elle n'existe pas. Jamais de masse musculaire gagnée, de masse grasse perdue, de calories brûlées estimées. La progression s'affiche avec ce qui est réel : poids, tour de taille, charges, répétitions, régularité, séances réalisées. Les cibles du plan (calories, protéines) restent des recommandations étiquetées « estimation », jamais présentées comme une mesure.
3. **La sécurité avant la motivation.** L'anti-abandon détecte aussi l'**excès** : plusieurs journées notées nettement sous la cible ou sous le métabolisme de base, une perte de poids trop rapide sur plusieurs semaines, une fréquence d'entraînement au-delà du programme cumulée à une fatigue élevée déclarée. Dans ces cas l'app ne félicite pas et ne pousse pas : elle ralentit, explique, propose de réduire et recommande un professionnel de santé quand c'est pertinent. Aucun diagnostic, aucun vocabulaire clinique. C'est une **règle déterministe** (§4.5), évaluée avant toute règle de motivation, pas une suggestion du moteur de motivation.

Principes repris du projet, non négociables :

- **Moteurs déterministes** pour tout calcul et toute décision (calories, séances, détection d'abandon et d'excès). L'IA générative peut reformuler, jamais décider ni calculer.
- **Jamais sous le métabolisme de base** ni sous le plancher absolu (D-022), quelle que soit l'adaptation.
- **Jamais culpabilisant.** Une séance manquée n'est pas un échec ; une baisse de motivation est une information, pas une faute.
- **L'utilisateur garde la main** : toute adaptation est expliquée, et les changements importants sont proposés avant d'être appliqués.

---

## 1. Vision en une phrase

Chaque jour, l'app sait **ce qui compte aujourd'hui** pour cette personne ; chaque semaine, elle **écoute** et **ajuste** ; sur plusieurs mois, elle **montre le chemin parcouru** et **rattrape** l'utilisateur quand il décroche, en lui rappelant pourquoi il a commencé.

## 2. Architecture métier

### 2.1 Vue d'ensemble : un moteur, un état, plusieurs canaux

```
  Données enregistrées (seule matière première, rien d'estimé sur le corps)
  séances faites · charges/répétitions · pesées · tour de taille · repas notés
  check-ins (énergie, fatigue, motivation) · motivations (why/change/feel)
                                │
                                ▼
┌──────────────────────── Transformation Journey Engine ────────────────────────┐
│                                                                                │
│  deriveJourneyState()  ──▶  JourneyState  (SOURCE DE VÉRITÉ UNIQUE)            │
│                              goal · motivation · progress · momentum ·         │
│                              difficulties · safety                             │
│                                │                                               │
│        ┌───────────────────────┼──────────────────────────┐                    │
│        ▼                       ▼                          ▼                    │
│  1. Règle de sécurité    2. Anti-abandon           3. Adaptation Engine        │
│  (excès, prioritaire)    (décrochage)              (calories, repas, séances,  │
│        │                       │                     jalons ; bloquée si       │
│        └──────────┬────────────┘                     sécurité active)          │
│                   ▼                                                            │
│          Voix du coach (journey/voice) : catalogue, composeur,                 │
│          anti-répétition, garde de ton (ni reproche ni vocabulaire clinique)   │
└───────────────────┬──────────────────┬──────────────────┬─────────────────────┘
                    ▼                  ▼                  ▼
            Canal notifications   Écran Aujourd'hui   Bilan / Progress Journey
            (livré, D-024)        (Daily Coach)       (Weekly Check-in, victoires)
```

L'ordre de décision est fixe : **sécurité → anti-abandon → motivation**. Quand la sécurité est active, aucun canal n'envoie de félicitation, de relance d'absence ni de message qui pousse à en faire plus.

### 2.2 Modules

| Module | Rôle | Entrées | Sorties | Statut |
|---|---|---|---|---|
| `journey/state.ts` | Calcule l'état unique de l'utilisateur | données enregistrées, profil, plan | `JourneyState` | ✓ livré |
| `journey/safety.ts` | Règle de sécurité déterministe (excès) | repas notés, pesées, séances, check-ins | `SafetyAssessment` | ✓ livré |
| `journey/voice/*` | Catalogue de messages, composeur, garde de ton | `JourneyState`, déclencheur, historique | `ComposedMessage` | ✓ livré |
| `notifications/*` | Canal de sortie : quand parler, préférences, plafonds, historique | `JourneyState`, plan de la semaine | rappels planifiés | ✓ livré |
| `journey/daily-coach.ts` | Action principale du jour, repas, séance, message | `JourneyState`, plan du jour | `DailyBrief` | à faire (J-2) |
| `journey/weekly-checkin.ts` | Questions de la semaine et synthèse | réponses + `weeklyReview` | `WeeklyCheckin`, `CheckinInsights` | à faire (J-3) |
| `journey/adaptation.ts` | Propose et applique les ajustements, bornés | `JourneyState` sur 2–4 semaines | `Adjustment[]` | à faire (J-6) |
| `journey/anti-abandon.ts` | Score de décrochage et réaction | `JourneyState`, historique | `RiskAssessment` | partiel (absences dans le canal notifications) |
| `journey/victories.ts` | Victoires prouvées par une donnée | historique | `Victory[]` | à faire (J-4) |
| `journey/milestones.ts` | Objectifs intermédiaires (toutes les 4 semaines) | objectif, rythme réel | `Milestone[]` | à faire |

Tous ces modules sont **purs** (aucun import React, Expo, Supabase). Côté app, un seul hook, `useJourneyState()`, assemble l'état ; tous les écrans et le planificateur de notifications le lisent.

### 2.3 Cycle de vie d'un parcours

```
onboarding ─▶ calibration (semaines 1–2) ─▶ progression (cycles de 4 semaines) ─▶ consolidation ─▶ objectif atteint ─▶ maintien
                     │                              │    ▲
                     │                              ▼    │
                     │                         pause (vacances, maladie, choix)
                     ▼
              pas d'adaptation calorique avant 14 jours de données
```

- **Calibration** (14 jours) : on observe, on n'ajuste pas les calories. Le Daily Coach insiste sur les habitudes simples (pesée, séances, repas).
- **Progression** : cycles de 4 semaines, chacun avec un objectif intermédiaire. L'Adaptation Engine peut agir au plus une fois par période de 14 jours sur les calories.
- **Consolidation** : à moins de 4 semaines de l'objectif, ou quand l'objectif intermédiaire final est atteint : on stabilise, on prépare le maintien.
- **Objectif atteint** : bilan du parcours, nouvelle proposition (maintien, nouvel objectif). Le parcours est archivé, jamais effacé.
- **Pause** : décidée par l'utilisateur ou proposée par l'anti-abandon. Pendant une pause, aucune adaptation, aucune relance ; les séries hebdomadaires sont gelées.

### 2.4 Statut de momentum (`JourneyState.momentum.status`, à venir avec J-5)

La première ligne gagne : la sécurité passe avant tout.

| Statut | Condition (évaluée chaque jour, déterministe) | Effet |
|---|---|---|
| `protecting` | règle de sécurité active (§4.5) | on ralentit : ni félicitation, ni relance, ni ajustement qui augmente l'effort ou le déficit |
| `calibrating` | moins de 14 jours depuis le début | pas d'ajustement calorique |
| `on_track` | adhérence ≥ 70 % sur 14 jours et tendance dans la fourchette | message de constance, victoires |
| `slowing` | adhérence entre 40 et 70 % **ou** 1 signal anti-abandon | plan allégé proposé |
| `stalled` | tendance hors fourchette 3 semaines avec adhérence ≥ 70 % | ajustement proposé (voir §4.3) |
| `drifting` | adhérence < 40 % **ou** absence ≥ 5 jours | relance douce, plan minimal |
| `paused` | pause active | rien |
| `achieved` | objectif atteint (moyenne 7 jours dans ±0,5 kg de la cible, ou critère non-poids validé) | bilan, maintien |

L'état n'est jamais affiché comme une note. Il sert à choisir le ton, le volume et les propositions.

## 3. Modèles de données

### 3.1 Types TypeScript (domaine)

```ts
type JourneyPhase = 'calibration' | 'progression' | 'consolidation' | 'maintenance';
type MomentumStatus = 'protecting' | 'calibrating' | 'on_track' | 'slowing' | 'stalled' | 'drifting' | 'paused' | 'achieved';

// Source de vérité unique (src/domain/journey/state.ts, livré). Tout est dérivé de données
// enregistrées : rien n'est estimé sur le corps de l'utilisateur.
interface JourneyState {
  today: IsoDate;
  goal: { type: GoalType; family: 'lose' | 'gain' | 'recomp' | 'health' | 'performance' };
  motivation: { why?: string; change?: string; feel?: string };   // ses propres mots
  tone: 'gentle' | 'direct';
  progress: {
    sessionDates: IsoDate[];            // séances réellement faites
    sessionsThisWeek: number;
    weeklyStreak: number;               // semaines d'affilée avec au moins une séance
    weightDirection: 'toward_goal' | 'steady' | 'unknown';  // moyenne 7 j des pesées saisies
  };
  momentum: { lastActivityDate: IsoDate | null; daysSinceActivity: number | null };
  difficulties: { fatigue: 'high' | 'normal' | 'unknown' };   // check-in déclaré
  safety: SafetyAssessment;             // règle de sécurité (§4.5), prioritaire
  plan: { mainMeal: Record<IsoDate, string> };
}

interface SafetyAssessment {
  active: boolean;
  flags: ('low_intake' | 'fast_weight_loss' | 'training_load')[];
  belowFloor: boolean;                  // au moins un jour noté sous le métabolisme de base
  evidence: Record<string, string>;     // jours, rythme, séances : uniquement des valeurs saisies
}

interface Journey {
  id: string;
  goal: GoalProfile;                 // objectif initial (copie figée au départ)
  startedOn: IsoDate;
  startWeightKg: number | null;
  motivation: { why?: string; change?: string; feel?: string };  // raison profonde (table motivations)
  phase: JourneyPhase;
  milestones: Milestone[];
  pausedUntil: IsoDate | null;
  endedOn: IsoDate | null;
  outcome: 'achieved' | 'changed_goal' | 'stopped' | null;
}

interface Milestone {
  id: string;
  index: number;                     // 1, 2, 3…
  dueOn: IsoDate;                    // fin du cycle de 4 semaines
  kind: 'weight' | 'waist' | 'consistency' | 'performance' | 'habit';
  target: number;                    // kg, cm, % adhérence, charge…
  status: 'pending' | 'reached' | 'missed_kindly' | 'replaced';
  rationale: Rationale;              // pourquoi cette cible (rythme réaliste)
}

interface DailyBrief {
  date: IsoDate;
  mainAction: { kind: 'workout' | 'meal' | 'weigh_in' | 'rest' | 'walk' | 'checkin'; labelKey: string; params: Record<string, string> };
  meal: PlannedMeal | null;          // le repas qui compte aujourd'hui
  workout: { sessionIndex: number; variant: SessionVariant; start: string | null } | null;
  message: ComposedMessage;          // voix du coach (même composeur que les notifications)
  adaptations: AdjustmentSummary[];  // « J'ai allégé ta séance parce que… »
}

interface WeeklyCheckin {
  weekStart: IsoDate;
  feeling: 1 | 2 | 3 | 4 | 5;        // ressenti global
  energy: 1 | 2 | 3 | 4 | 5;
  difficulties: Difficulty[];        // choix fermés + texte libre court
  difficultyNote?: string;           // ≤ 280 caractères
  proudOf?: string;                  // victoire déclarée par l'utilisateur
  answeredAt: string;
}
type Difficulty = 'time' | 'hunger' | 'cravings' | 'fatigue' | 'pain' | 'motivation' | 'budget' | 'social' | 'sleep' | 'other';

interface Adjustment {
  id: string;
  kind: 'calories' | 'meals' | 'sessions' | 'volume' | 'milestone';
  from: unknown; to: unknown;        // valeurs précises (kcal, séances/semaine…)
  reasonKey: string;                 // explication affichée
  evidence: Record<string, number | string>;  // données qui justifient (tendance, adhérence…)
  mode: 'auto' | 'proposed';         // proposed = l'utilisateur valide
  status: 'proposed' | 'applied' | 'declined' | 'reverted';
  effectiveFrom: IsoDate;
}

interface RiskAssessment {
  date: IsoDate;
  signals: { kind: RiskSignal; weight: number; evidence: string }[];
  score: number;                     // 0–100, somme bornée des poids
  level: 'none' | 'watch' | 'act';
}
type RiskSignal = 'missed_sessions' | 'absence' | 'low_motivation' | 'high_fatigue' | 'stagnation' | 'checkin_skipped' | 'notifications_ignored';

interface Victory {
  id: string;
  date: IsoDate;
  kind: 'first_session' | 'session_count' | 'weekly_streak' | 'personal_record' | 'waist' | 'weight_trend' | 'comeback' | 'habit' | 'milestone' | 'user_declared';
  params: Record<string, string | number>;
  sourceRef: string;                 // ligne de données qui la prouve
}
```

### 3.2 Tables Supabase (à créer avec le code du parcours)

Toutes avec RLS « propriétaire » (`auth.uid() = user_id`), `on delete cascade` depuis `auth.users`, colonnes `created_at`, `updated_at` et `deleted_at` quand la ligne est synchronisée.

| Table | Clé | Contenu | Notes |
|---|---|---|---|
| `journeys` | `id` | objectif figé, `started_on`, `phase`, `paused_until`, `ended_on`, `outcome` | un seul parcours actif par utilisateur (index unique partiel `where ended_on is null`) |
| `journey_milestones` | `id` | `journey_id`, `index`, `due_on`, `kind`, `target`, `status`, `rationale jsonb` | politique restrictive : le parcours doit appartenir à l'utilisateur |
| `weekly_checkins` | `(user_id, week_start)` | ressenti, énergie, difficultés `text[]`, note ≤ 280, fierté ≤ 280 | remplace à terme `weekly_reviews` (qui reste pour l'historique) |
| `daily_checkins` | existe | énergie, motivation, fatigue, minutes disponibles | à brancher sur la sync |
| `adjustments` | `id` | `kind`, `from_value jsonb`, `to_value jsonb`, `reason_key`, `evidence jsonb`, `mode`, `status`, `effective_from` | journal immuable : on ajoute, on ne modifie que `status` |
| `victories` | `id` | `kind`, `date`, `params jsonb`, `source_ref` | jamais saisi par le serveur ; `user_declared` vient du check-in |
| `risk_assessments` | `(user_id, date)` | `score`, `level`, `signals jsonb` | données sensibles (état psychologique déduit) : exportables, supprimables, jamais partagées |
| `motivations` | existe | `why`, `change`, `feel`, `quit_risk`, `proud_of` | ajouter `revisited_at` : la raison est relue tous les 3 mois |
| `notification_settings`, `notification_history` | créées (D-024) | préférences et historique des messages | voir `docs/NOTIFICATIONS.md` |

`JourneyState` et `SafetyAssessment` ne sont **pas stockés** : ils sont recalculés à chaque ouverture à partir des données brutes (une seule source de vérité, rien à désynchroniser).

Données dérivées (états, signaux, scores) : **recalculables** à partir des données brutes. On ne stocke `risk_assessments` que pour expliquer une relance a posteriori et mesurer l'efficacité ; durée de conservation 90 jours.

## 4. Règles

Les seuils ci-dessous sont des **paramètres de conception** (rythmes couramment utilisés en coaching), pas des données externes vérifiées. Ils vivent dans un fichier de constantes unique, avec un test par règle, et doivent être relus par un professionnel (diététicien·ne, coach diplômé·e) avant la bêta publique.

### 4.1 Daily Coach

Chaque jour, une seule **action principale**, choisie dans cet ordre (première règle vraie) :

0. Règle de sécurité active (§4.5) → l'action qui ralentit : manger sa cible du jour, ou repos / mobilité, avec l'explication.
1. Pause active → `rest` (« Profite de ta pause »).
2. Check-in du jour avec fatigue ≥ 5 ou énergie ≤ 1 → `rest` ou `walk` (réutilise `suggestAlternatives`).
3. Séance prévue aujourd'hui non faite → `workout` (version courte ou allégée si fatigue ≥ 4 ou temps disponible < durée prévue).
4. Jour de pesée → `weigh_in`.
5. Retour après absence (≥ 3 jours sans activité) → l'action la plus petite possible : `walk` de 10 minutes ou une séance courte (« reprise simple », `comebackPlan`).
6. Dimanche sans check-in → `checkin`.
7. Sinon → `meal` : le repas du jour qui porte le plus de protéines (le plus utile à l'objectif).

Le **repas** affiché est celui du prochain créneau non mangé. La **séance** est celle du plan de la semaine (après reports). Le **message** est composé par la voix du coach (`journey/voice` : même catalogue, même anti-répétition, même règle « pourquoi + petite action + pourquoi ça compte ») que les notifications : l'app et les notifications parlent d'une seule voix parce qu'elles lisent le même `JourneyState`.

Le brief est recalculé à chaque ouverture ; il ne change pas dans la journée sauf si une donnée change (séance faite, check-in).

### 4.2 Weekly Check-in

- Proposé le dimanche à 18:00 (notification `weekly_checkin`), rattrapable jusqu'au mardi soir. Au-delà, la semaine est simplement sautée (jamais de reproche).
- Questions (moins d'une minute) : ressenti (1–5), énergie (1–5), difficultés (choix multiples + note facultative), « De quoi es-tu fier·e cette semaine ? » (facultatif).
- La progression n'est **pas demandée** : elle est calculée (`weeklyReview`) et affichée avant les questions.
- Synthèse produite : 1 point qui a marché, 1 difficulté nommée avec une solution concrète, le plan de la semaine suivante, et l'éventuel ajustement proposé.

Correspondance difficulté → réponse (déterministe) :

| Difficulté | Réponse proposée |
|---|---|
| `time` | séances courtes par défaut la semaine suivante, ou une séance de moins |
| `hunger` | aliments plus rassasiants (protéines, fibres) ; en perte de poids, déficit ramené vers le bas de la fourchette |
| `cravings` | collation prévue dans le plan, recette « plaisir » compatible |
| `fatigue` | volume −20 % une semaine (décharge), rappel du sommeil |
| `pain` | exercices concernés remplacés, message conseillant un professionnel de santé si la douleur persiste ; **aucun diagnostic** |
| `motivation` | objectif de la semaine réduit à 2 actions, rappel de la raison profonde |
| `budget` | plan repas recalculé avec un budget plus bas |
| `social` | repas libres planifiés (sorties), sans « compensation » le lendemain |
| `sleep` | heure de séance plus tôt si possible, pas de séance intense après 21:00 |

### 4.3 Adaptation Engine

Règles générales :

- **Données suffisantes** : au moins 14 jours de suivi et 6 pesées sur les 14 derniers jours pour toucher aux calories. Sinon, aucune adaptation calorique, et l'app le dit.
- **Une adaptation calorique au plus tous les 14 jours.** Pas d'adaptation la semaine où le check-in signale maladie, fatigue forte ou cycle de règles (si l'utilisatrice le renseigne).
- **Pas de calories si l'adhérence est faible** : sous 70 % de repas suivis ou de séances faites, on adapte le **plan** (plus simple), jamais les calories. Le problème est la faisabilité, pas le chiffre.
- **Bornes** : pas de ±150 kcal/jour par adaptation, jamais sous `floorKcal` (max(BMR, plancher absolu), D-022), jamais au-dessus de la cible de maintien calculée + 20 % en prise de masse (borne de calcul interne, jamais affichée comme une mesure).
- **Sécurité** : tant que la règle de sécurité est active, aucune adaptation n'augmente le déficit ni le volume d'entraînement. Une perte trop rapide déclenche d'abord la règle de sécurité, puis une proposition de +100 à +150 kcal.
- **Explication** systématique : « Ta moyenne de poids est stable depuis 3 semaines alors que tu as suivi 85 % du plan. Je propose −120 kcal par jour. » Les adaptations caloriques sont **proposées** (validation en un geste) ; les adaptations de séance après fatigue sont **automatiques** et annulables.

Fourchettes de rythme (moyenne mobile 7 jours, variation hebdomadaire) :

| Objectif | Rythme visé | Trop lent (3 semaines) | Trop rapide (2 semaines) |
|---|---|---|---|
| `fat_loss`, `weight_loss` | −0,5 à −1 % du poids / semaine | > −0,25 % → −100 à −150 kcal | plus de 1 %/sem deux semaines de suite → règle de sécurité (§4.5) + proposition +100 à +150 kcal |
| `muscle_gain` | +0,25 à +0,5 % / semaine | < +0,1 % → +100 à +150 kcal | > +0,75 % → −100 kcal |
| `recomposition` | poids stable, tour de taille ↓, charges ↑ | charges stables 4 semaines → progression revue | perte > 0,5 %/sem → +100 kcal |
| `maintenance`, `fitness`, `performance` | ±0,5 kg | dérive > 1,5 kg sur 4 semaines → ±100 kcal | — |

Autres adaptations :

- **Séances** : 2 séances manquées sur 2 semaines consécutives → proposer une séance de moins par semaine (mieux vaut 2 faites que 3 prévues). 4 semaines à 100 % → proposer de revenir au nombre initial.
- **Volume / charges** : RPE moyen ≥ 9 deux semaines → décharge ; RPE ≤ 6 avec toutes les répétitions → progression (règles existantes de `training/progression`).
- **Repas** : recette jamais mangée 3 fois → retirée de la rotation ; recette marquée mangée souvent → plus fréquente. Inventaire et budget restent prioritaires.
- **Objectifs intermédiaires** : recalculés en fin de cycle de 4 semaines à partir du rythme réel. Un jalon non atteint devient `missed_kindly` et le suivant est recalibré ; il n'est jamais affiché en rouge.

### 4.4 Anti-abandon

Signaux et poids (score borné à 100, recalculé chaque jour) :

| Signal | Condition | Poids |
|---|---|---|
| `missed_sessions` | ≥ 2 séances prévues non faites sur 7 jours | 25 |
| `absence` | aucune activité (séance, pesée, repas, check-in) depuis ≥ 3 jours | 30 (≥ 7 jours : 45) |
| `low_motivation` | motivation ≤ 2 sur 2 check-ins quotidiens sur 7 jours, ou ressenti hebdo ≤ 2 | 20 |
| `high_fatigue` | fatigue ≥ 4 sur 3 jours, ou RPE moyen ≥ 9 | 15 |
| `stagnation` | état `stalled` | 15 |
| `checkin_skipped` | 2 check-ins hebdomadaires sautés d'affilée | 10 |
| `notifications_ignored` | 5 notifications de suite sans ouverture | 10 |

Niveaux : `watch` à partir de 30, `act` à partir de 55.

Réactions (jamais de reproche, jamais de chiffre de ce qui n'a pas été fait) :

- `watch` : le Daily Coach réduit l'action principale (séance courte, une seule action) et le message rappelle la raison profonde.
- `act` : proposition explicite « On allège pour deux semaines ? » (moins de séances, repas plus simples), ou **pause** si l'utilisateur le préfère. Une séance manquée n'efface jamais une série (séries hebdomadaires, déjà en place).
- Absence : relances espacées à J+2, J+5, J+10, puis **silence** jusqu'au retour (livré dans le canal notifications). Au retour : « Content de te revoir », reprise simple, aucun récapitulatif de ce qui a été manqué.
- `notifications_ignored` : le volume de notifications baisse de lui-même (plafond quotidien −1), jusqu'à 1 par jour.
- Fatigue : la réponse est le repos, présenté comme une partie du programme.
- Stagnation : expliquée comme normale (« le poids fluctue, la tendance compte »), mise en avant d'un indicateur qui progresse (tour de taille, charges, constance), puis adaptation selon §4.3.

### 4.5 Règle de sécurité : détecter l'excès (livrée, `journey/safety.ts`)

Règle déterministe, évaluée **avant** toute règle de motivation. Elle ne lit que des valeurs saisies ou mesurées.

| Signal | Condition | Données utilisées |
|---|---|---|
| `low_intake` | au moins **3 journées consécutives** notées en entier (chaque repas marqué « mangé » ou « sauté »), chacune **sous 70 % de la cible** ou **sous le plancher** (métabolisme de base, D-022), la dernière il y a 2 jours au plus | repas marqués mangés × valeurs Ciqual des recettes |
| `fast_weight_loss` | moyenne de poids sur 7 jours en baisse de **plus de 1 % par semaine, deux semaines de suite** (3 fenêtres de 7 jours, au moins 2 pesées chacune) | pesées saisies |
| `training_load` | **plus de séances faites sur 7 jours que prévu** par semaine **et** fatigue déclarée élevée (fatigue ≥ 4 ou énergie ≤ 2) au moins **2 jours** sur 7 | séances faites, check-ins |

Cas ajoutés pour les utilisateurs qui notent peu (PR #3, D-026) :

| Signal | Condition | Message |
|---|---|---|
| `low_logging` | au moins **3 jours passés consécutifs** (jusqu'à hier) avec au moins un repas prévu ni mangé ni sauté, chez quelqu'un qui avait au moins **3 journées notées en entier** dans les **7 jours** précédents | `safety_low_logging` : neutre, demande comment ça se passe et propose d'ajuster le plan ; **une fois par épisode** ; pas de professionnel de santé, pas de reproche |
| `fast_weight_loss` (pesées rares) | une seule pesée dans au moins une des trois fenêtres de 7 jours, et baisse de **plus de 2 %/semaine deux semaines de suite** | dit que la mesure est peu fréquente et la tendance imprécise ; aucun chiffre |
| `training_load` (fréquence seule) | au moins `max(prévu + 2, prévu × 1,5)` séances dans chacune des **3** dernières fenêtres de 7 jours, sans fatigue déclarée | proposition de ralentir (journée de repos en plus, revenir au rythme prévu) ; rappels de séance inchangés |

Ordre des signaux : `low_intake`, `fast_weight_loss`, `training_load`, `low_logging`. Le premier choisit le message ; `low_logging` n'apparaît que seul.

Une journée partiellement notée ne compte jamais dans `low_intake` : l'app ne sait pas ce qui n'a pas été noté et ne le devine pas. Elle compte en revanche dans `low_logging`, qui ne dit rien de ce qui a été mangé. Les repas se marquent « mangé » ou « pas mangé » (`skipped`). Le plan de la semaine précédente est gardé sur l'appareil pour que la règle voie les jours d'avant lundi.

**Âge et statut de poids** : `JourneyState.profile` porte l'âge et le statut de poids (IMC < 18,5, dernière pesée sinon poids du profil). Pour un mineur ou un utilisateur en sous-poids (`noPush`), la voix retire toute variante qui pousse vers l'intensité ou le déficit, et le bilan du dimanche ne félicite jamais une baisse de poids. Même logique que `minor_no_deficit` et `underweight_no_deficit` du moteur nutrition.

**Interrupteur général** (D-025) : il coupe toutes les notifications, sécurité comprise. La bannière de l'écran Aujourd'hui affiche le message de sécurité dans tous les cas.

Quand la règle est active :

- **Ne pas féliciter** : pas de message de séance réussie, de série, ni de « ta tendance va dans le sens de ton objectif ».
- **Ne pas pousser** : pas de relance d'absence, pas de rappel quotidien « une action de plus » ; les rappels de séance proposent la version allégée ou le repos (`training_load`) ; les messages repas ne parlent plus de déficit.
- **Ralentir et expliquer** : un message dédié (au plus un tous les 3 jours), qui dit ce que l'app a vu avec les données de l'utilisateur, propose de réduire (manger sa cible complète, remplacer une séance par du repos) et **recommande un professionnel de santé** (médecin, diététicien·ne) pour `low_intake` et `fast_weight_loss`, et si la fatigue dure pour `training_load`.
- Ce message passe outre les catégories de notifications désactivées (pas outre l'interrupteur général, la pause ni les heures calmes) et s'affiche aussi sur l'écran Aujourd'hui.
- **Vocabulaire** : ni diagnostic, ni mot clinique (« trouble », « carence », « surentraînement », « pathologie », « symptôme »…), ni chiffre de ce qui n'a pas été mangé. Les tests de ton refusent ces mots.
- Les seuils (70 %, 3 jours, 1 %/semaine, 2 jours de fatigue, et ceux de D-026 : 3 jours non notés, 3 journées notées sur 7, 2 %/semaine avec pesées rares, `prévu × 1,5` / `prévu + 2` séances sur 3 semaines, IMC 18,5, 18 ans) sont des paramètres de conception à faire relire par un professionnel avant la bêta publique.

### 4.6 Progress Journey

Ce qui est affiché, toujours depuis des données enregistrées ou mesurées, **jamais une estimation sur le corps** :

- **Évolution physique** : moyenne de poids sur 7 jours (jamais la pesée du jour seule), tour de taille, photos (privées, optionnelles), comparées au départ du parcours.
- **Performances** : charges et répétitions par exercice principal, volume hebdomadaire (charges × répétitions saisies), pas et durée d'entraînement mesurés par l'appareil si connecté.
- **Jamais affiché** : masse musculaire gagnée, masse grasse perdue, calories brûlées (y compris l'« énergie active » estimée par Apple Santé / Health Connect), pourcentage de graisse calculé.
- **Habitudes** : semaines avec au moins une séance (série), pesées régulières, repas suivis, check-ins faits. Affichées en semaines, pas en jours, pour qu'un jour manqué ne casse rien.
- **Victoires** : chronologie des `Victory`. Exemples : première séance, 10/25/50 séances, 4 semaines de suite, record personnel, −2 cm de tour de taille, retour après une pause, jalon atteint, fierté déclarée dans le check-in.
- Indicateurs mis en avant selon l'objectif (règle existante `highlightedIndicators`) : le poids n'est jamais le seul.

Règle de ton : une évolution défavorable n'est montrée qu'avec son contexte (« le poids remonte souvent après une séance de jambes, regarde la tendance sur 3 semaines »), jamais seule et jamais en rouge.

## 5. Parcours utilisateur

### 5.1 Jour 0 — démarrage

1. Onboarding existant (objectif, motivation why/change/feel, contraintes).
2. Écran « Ton parcours » : objectif, rythme réaliste (`assessGoalFeasibility`), premier jalon à 4 semaines, raison profonde citée. « Les deux premières semaines, on apprend à te connaître : pas de changement de calories. »
3. Choix des notifications (catégories, heures calmes, citer ses mots ou non sur l'écran verrouillé).

### 5.2 Une journée type

- 08:30 notification motivation : « Tu as commencé pour “être fier de moi”. Ta séance de 18:00 t'attend : prépare ton sac maintenant. Chaque séance faite rend la suivante plus facile. »
- Ouverture de l'app : écran Aujourd'hui = brief du jour (action principale, repas, séance, message).
- 17:00 rappel de séance. Séance faite → victoire si palier, message de succès le lendemain matin.
- Pas envie ? Bouton « Je n'ai pas envie » (existant) → alternatives ; le check-in du jour alimente la fatigue.

### 5.3 Une semaine

- Lundi : nouvelle semaine planifiée, éventuel message de série (2, 4, 8, 12… semaines).
- Dimanche 18:00 : Weekly Check-in → synthèse → ajustement proposé si les règles le permettent → plan de la semaine suivante.

### 5.4 Stagnation (semaines 5–8)

1. Tendance stable 3 semaines, adhérence 85 % → état `stalled`.
2. Le check-in montre d'abord ce qui progresse (charges +10 %, tour de taille −1,5 cm).
3. Proposition : −120 kcal/jour, avec l'explication et les données. Accepter / refuser en un geste. Refus = aucune relance sur ce sujet pendant 14 jours.

### 5.5 Décrochage et retour

1. 2 séances manquées + motivation basse → `watch` : séance courte proposée, message ancré sur « ce que tu veux changer ».
2. 5 jours sans activité → relance J+5 : « Une marche de 10 minutes suffit pour reprendre. »
3. 10 jours → dernière relance, puis silence.
4. Retour (n'importe quelle activité) → « Content de te revoir. » Reprise simple (`comebackPlan`), semaine allégée proposée, victoire `comeback`.

### 5.6 Objectif atteint

Bilan du parcours (avant/après, victoires, habitudes), proposition : maintien (calories de maintien recalculées, séances conservées) ou nouvel objectif. La raison profonde est relue : « Est-ce que c'est toujours ce qui te fait avancer ? »

### 5.7 Excès détecté

1. Mercredi, l'utilisateur a noté en entier lundi, mardi et mercredi, chaque jour sous 70 % de sa cible. La règle `low_intake` s'active.
2. Le lendemain matin, à la place du rappel quotidien : « Prendre soin de toi passe avant le rythme. Ces derniers jours, tes repas notés sont bien en dessous de ta cible : ajoute un repas ou une collation aujourd'hui. Manger trop peu plusieurs jours de suite fatigue et rend l'objectif plus dur à tenir. Si ça dure, parles-en à un professionnel de santé. »
3. L'écran Aujourd'hui affiche le même message. Pas de félicitation pour la séance de la veille, pas de message « ta tendance va dans le bon sens ».
4. Dès que les journées notées reviennent au-dessus du seuil, la règle se désactive d'elle-même ; aucun message ne revient sur l'épisode.

## 6. Plan de livraison

| Étape | Contenu | Dépend de |
|---|---|---|
| J-1 ✓ | État unique du parcours, règle de sécurité, voix du coach, canal notifications (D-024) | — |
| J-2 | Daily Coach sur l'écran Aujourd'hui (lit `JourneyState`, même voix) | J-1 |
| J-3 | Weekly Check-in (table `weekly_checkins`, écran, synthèse) | J-2 |
| J-4 | Progress Journey : victoires et habitudes | J-2 |
| J-5 | Anti-abandon complet (score, états, propositions d'allègement, pause) | J-3 |
| J-6 | Adaptation Engine (calories proposées, séances, jalons) | J-3, 4 semaines de données de test |
| J-7 | Sync des nouvelles tables et notifications serveur (push) | J-1 à J-6 |

Chaque étape : moteur pur + tests unitaires des règles, tables + tests RLS, écran, E2E, entrée dans `docs/DECISIONS.md`.

## 7. Questions ouvertes

- Faut-il un avis professionnel sur les fourchettes de rythme et les seuils d'adaptation avant la bêta ? (Recommandé : oui.)
- Cycle menstruel : le proposer comme information facultative pour éviter les fausses stagnations ?
- Notifications serveur (push) : utiles pour relancer un utilisateur sur un autre appareil, mais elles exigent d'envoyer des signaux au serveur. À décider avec la politique de confidentialité.
