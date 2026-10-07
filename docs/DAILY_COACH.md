# Daily Coach — « Qu'est-ce que je dois faire aujourd'hui ? »

Statut : **architecture validée pour la phase « Daily Coach + Progress Journey »** (D-028). Code livré étape par étape sur la PR empilée sur la PR #3.
Date : 2026-10-01. Documents liés : `docs/TRANSFORMATION_JOURNEY.md` (moteur unique, règles fondatrices), `docs/PROGRESS_JOURNEY.md`, `docs/ADAPTATION_ENGINE.md`, `docs/RETENTION.md`, `docs/NOTIFICATIONS.md`.

**W-7 (2026-10-07, D-039)** : le Daily Coach devient un coach longitudinal. Une fonction déterministe unique, `coachDay()` (`src/domain/journey/coach.ts`), choisit **une seule priorité par jour** au-dessus du `DailyPlan` ; l'écran Aujourd'hui l'affiche sans rien décider. Voir §13.

Le Daily Coach n'est **pas un nouveau moteur**. C'est la sortie quotidienne du Transformation Journey Engine (CLAUDE.md règle 6) : il lit `JourneyState`, le plan de la semaine, le plan repas et le check-in du jour, et produit un `DailyPlan`. L'écran Aujourd'hui l'affiche ; les notifications parlent avec la même voix.

---

## 1. Audit de départ (2026-10-01)

### 1.1 Ce qui existe déjà et qu'on améliore (pas de doublon)

| Besoin de la phase | Existant | Où | Ce qui manque |
|---|---|---|---|
| Action du jour | `nextAction()` : une action parmi séance / repas / pesée / repos | `src/domain/today.ts` | ignore la sécurité, le retour après absence, la fatigue, le check-in ; pas de jour de repos réel ; aucune hiérarchie de priorités. **Remplacé** par `journey/daily-plan.ts`. |
| État de l'utilisateur | `deriveJourneyState` (objectif, why/change/feel, séances, série, tendance, absence, fatigue, âge/poids, sécurité) | `src/domain/journey/state.ts` | date de début du parcours, adhérence, retour après absence, risque de décrochage, jalons. **Étendu**. |
| Sécurité | règle déterministe, `low_logging` séparé (D-024 à D-027) | `src/domain/journey/safety.ts` | rien : elle est lue telle quelle, priorité 1 du coach. Un repas « remplacé » ne doit jamais rendre une journée « complète » (sinon `low_intake` à tort) : traité en §5. |
| Voix du coach | catalogue FR/EN, composeur LRU, garde de ton | `src/domain/journey/voice/` | choix de why/change/feel selon le contexte (aujourd'hui : rotation pure) ; catégories de messages ; l'écran Aujourd'hui compose sans historique (`history: []`) donc ne partage pas l'anti-répétition. **Étendu**. |
| Notifications | règles, préférences, heures calmes, cooldowns, absences J+2/5/10, plafond baissé si ignorées | `src/domain/notifications/` | types `milestone`, `encouragement` ; lecture du `DailyPlan` (séance raccourcie, jour de repos). **Étendu**. |
| « J'ai 15 min » / « Pas envie » | écran `/adapt` + `suggestAlternatives` + `shortSession` / `lightSession` + `rescheduleOptions` | `src/app/adapt.tsx`, `src/domain/motivation/anti-abandon.ts`, `src/domain/training/adapt.ts` | ne couvre que la séance (pas les repas ni l'organisation) ; le choix n'est pas enregistré (pas d'historique « raccourcie / remplacée / reportée / sautée ») ; pas de « journée difficile ». **Étendu**. |
| Check-in quotidien | énergie / motivation / fatigue gardés 30 jours **sur l'appareil** | `src/state/notifications.ts` | table `daily_checkins` existe mais n'est pas synchronisée. **Branché sur la sync**. |
| Bilan de la semaine | `weeklyReview()` : marché / difficile / à adapter / semaine suivante, données manquantes dites | `src/domain/progress/weekly-review.ts` | aucune question posée à l'utilisateur, aucune adaptation. **Étendu** (Weekly Check-in). |
| Progression | moyenne 7 j, variation, tour de taille, régularité 28 j, série, indicateurs par objectif | `src/app/(tabs)/progress.tsx`, `src/domain/progress/weight.ts` | pas d'histoire (depuis le début, records, habitudes, jalons) ; les calculs sont dans l'écran. **Remplacé** par `journey/progress-journey.ts`. |
| Remplacement d'exercice | `findReplacements` avec raison (n'aime pas, ne peut pas, pas le matériel…) | `src/domain/training/replacement.ts` | la **raison n'est pas enregistrée** (seul l'échange l'est, sur l'appareil). |
| Repas | statuts `planned` / `eaten` / `skipped` ; seuls les repas mangés sont synchronisés ; semaine précédente gardée sur l'appareil | `src/domain/meals/planner.ts`, `src/domain/sync/projection.ts` | `replaced`, raison, historique au-delà de deux semaines. |
| Mémoire du coach | table `coach_memory` (types énumérés) | migration `20260930000001` | jamais alimentée ; pas de séparation faits / préférences / événements. |

### 1.2 Données déjà disponibles

Profil complet (`UserContextSnapshot`, synchronisé), why/change/feel, pesées et tour de taille (synchronisés), séances faites avec variante, séries (charges, répétitions, RPE) (synchronisées), échanges d'exercices (appareil), plan repas de la semaine et de la semaine précédente (appareil ; repas mangés synchronisés), dépenses, check-ins quotidiens (appareil, 30 jours), reports de séance (appareil), historique des notifications (appareil), occupation du calendrier (appareil).

### 1.3 Données manquantes (à créer dans cette phase)

| Donnée | Pourquoi | Où (voir §9) |
|---|---|---|
| Issue de chaque séance : faite, raccourcie, allégée, remplacée (par quoi), reportée, sautée (+ raison si donnée) | adhérence sans culpabilité, apprentissage | `workout_sessions.status` élargi + `outcome_reason`, `replaced_by` |
| Issue de chaque repas : mangé, sauté, remplacé, non renseigné (+ raison si donnée) | personnalisation, sécurité | `meal_plan_items.status` élargi + `reason` |
| Raison d'un remplacement d'exercice | « n'aime pas cet exercice » | nouvelle table `exercise_substitutions` |
| Mode de la journée (normal, difficile, 15 min, pas envie) et activité légère faite (marche, mobilité, repos) | journée difficile, adhérence | `daily_checkins.day_mode`, `activity`, `activity_minutes` |
| Weekly Check-in | bilan de la semaine | nouvelle table `weekly_checkins` |
| Jalons atteints et célébrés | ne pas célébrer deux fois, sur deux appareils | nouvelle table `journey_milestones` |
| Décisions d'adaptation (proposée, acceptée, refusée) | adaptation vérifiable, cooldowns | nouvelle table `adjustments` |
| Autres mesures (bras, poitrine, hanches, cuisses, cou) | « autres mesures choisies » | `body_measurements` (existe, seul `waist` est utilisé) |
| Historique des repas au-delà de deux semaines | habitudes sur plusieurs mois | serveur (`meal_plan_items`) + journal compact sur l'appareil |
| Date de début du parcours | « depuis le début » | dérivée : plus ancienne date entre l'onboarding et la première donnée (pas de nouvelle colonne) |

---

## 2. Architecture

```
 Données saisies ou mesurées (rien d'estimé sur le corps)
 profil · why/change/feel · séances + issues · séries · échanges d'exercices · repas + issues
 pesées · mesures · check-ins quotidiens · weekly check-ins · décisions d'adaptation · jalons
                                   │
                                   ▼  src/domain/journey  (UN seul moteur, fonctions pures)
   state.ts ── deriveJourneyState ──▶ JourneyState (source de vérité unique)
        │        + startedOn, adherence, comeback, risk, weightBasis
        │
        ├── safety.ts            sécurité (inchangée)                         priorité 1
        ├── daily-plan.ts        DailyPlan du jour (hiérarchie §4)            ──▶ écran Aujourd'hui
        ├── day-modes.ts         journée difficile · 15 min · pas envie       ──▶ /adapt
        ├── progress-journey.ts  histoire, corps, performance, habitudes      ──▶ « Mon évolution »
        ├── milestones.ts        jalons + objectifs intermédiaires             ──▶ célébrations
        ├── weekly-checkin.ts    questions + « Ton bilan »                     ──▶ check-in du dimanche
        ├── adaptation.ts        AdaptationEngine (recommandations vérifiables) ──▶ bilan, Aujourd'hui
        ├── adherence.ts         adhérence ≠ perfection
        ├── weight-basis.ts      poids de référence recalculé par paliers
        ├── memory.ts            mémoire structurée (faits / préférences / événements)
        ├── explain.ts           explications structurées (« Pourquoi ? ») pour la future IA
        └── voice/               anchor.ts (why/change/feel selon le contexte), kinds.ts (catégories),
                                 catalog, composer, rotation, tone
                                   │
              ┌────────────────────┼─────────────────────┐
              ▼                    ▼                     ▼
       notifications/        écran Aujourd'hui     Mon évolution / Bilan
       (canal de sortie)     (DailyPlan)           (ProgressJourney, WeeklyReview)
```

Règles d'architecture :

- **Un seul moteur** : tout module ci-dessus est dans `src/domain/journey`, pur (pas de React/Expo/Supabase), et lit `JourneyState`. Aucun écran ne calcule une progression, une adhérence ou un message.
- **Données → règles → moteurs → recommandation → (IA) explication** (règle 2, `docs/AI_ARCHITECTURE.md`). L'IA conversationnelle future reçoit les objets de `explain.ts`, jamais les données brutes, et ne décide rien.
- **Un seul hook côté app** assemble les entrées : `useJourney()` (remplace `useJourneyState`) renvoie `{ state, daily, progress }` mémorisés.
- `src/domain/today.ts` est supprimé une fois `daily-plan.ts` en place (pas deux logiques d'« action du jour »).

## 3. `DailyPlan`

```ts
type DayKind = 'first_day' | 'training' | 'rest' | 'comeback' | 'protecting';
type DayMode = 'normal' | 'difficult' | 'short' | 'low_motivation';

interface DailyItem {
  id: string;                         // stable dans la journée (`workout#0`, `meal#lunch`…)
  kind: 'safety' | 'workout' | 'meal' | 'recovery' | 'activity' | 'checkin' | 'weigh_in' | 'habit';
  status: 'todo' | 'done';
  /** Paramètres d'affichage, uniquement des valeurs planifiées ou saisies. */
  params: Record<string, string | number>;
  /** Clé d'explication (« Pourquoi ? »), voir explain.ts. */
  reason: string;
}

interface DailyPlan {
  date: IsoDate;
  kind: DayKind;
  mode: DayMode;
  greeting: 'hello' | 'first_day' | 'welcome_back';
  /** 1 à 4 éléments, dans l'ordre de la hiérarchie ; un jour de repos en a 1 ou 2. */
  items: DailyItem[];
  /** L'action principale (« Commencer ma journée »), toujours le premier élément à faire. */
  main: DailyItem | null;
  /** La phrase de motivation choisie (why, change ou feel) et pourquoi celle-ci. */
  anchor: { slot: 'why' | 'change' | 'feel'; text: string } | null;
  /** Message du coach du jour (même voix et même historique que les notifications). */
  message: ComposedMessage;
  /** Ligne de progression en tête d'écran (séances, série, jours actifs…), toujours une donnée réelle. */
  headline: { key: string; params: Record<string, string | number> };
  /** Adaptations du jour, expliquées (« séance raccourcie à 20 min parce que… »). */
  adaptations: { key: string; params: Record<string, string | number> }[];
}
```

Contenu **uniquement pertinent** :

- Jour d'entraînement : séance + repas (objectif et avancée du jour) + éventuellement une habitude.
- Jour de repos : **repos/récupération** (marche ou mobilité facultative) + repas. Pas de checklist.
- Premier jour : un seul objectif simple (découvrir sa première séance ou son premier repas), pas de bilan.
- Retour après absence : « Content de te revoir 👋 On reprend à partir d'aujourd'hui. » + la plus petite action utile. **Aucun rattrapage** des séances passées, aucun récapitulatif de ce qui a été manqué.
- Sécurité active : le message de sécurité en premier, l'action qui ralentit (manger sa cible, repos), rien qui pousse.
- Au plus **4 éléments**. Le pesage n'apparaît que le jour choisi (ou si l'utilisateur suit son poids et n'a rien noté depuis 7 jours) ; le check-in que le dimanche (ou rattrapage lundi/mardi) ou quand `low_logging` est présent.

L'écran n'est pas identique d'un jour à l'autre : la ligne de progression change (série, nombre de séances, jours actifs, dernier record), la phrase de motivation change de source selon le contexte, le message du coach tourne entre catégories (§6), et le contenu suit le type de jour.

## 4. Hiérarchie des priorités

> Depuis W-7, cet ordre construit toujours le `DailyPlan` (type de jour, éléments, ton). Ce qui **mène** l'écran (la priorité du jour, l'action principale, la question éventuelle) est arbitré ensuite par `coachDay()` : §13.

Le Daily Coach applique cet ordre, première règle vraie d'abord, pour **le type de jour, l'action principale et le ton** :

1. **Sécurité** (`safety.active`) : message de sécurité, action qui ralentit ; pas de félicitations, pas de « une action de plus », séance proposée en version allégée ou repos (`training_load`) ; repas sans parler de déficit. Règles existantes inchangées (D-024 à D-027).
2. **Contraintes fortes** : pause, aucune disponibilité ce jour-là (créneaux + calendrier), check-in du jour avec fatigue ≥ 5 ou énergie ≤ 1 → repos ou marche ; « journée difficile » détectée → version minimale (§7).
3. **Entraînement prévu** non fait → séance (courte si le créneau est court, allégée si fatigue ≥ 4).
4. **Nutrition** : objectif du jour (estimation étiquetée) et avancée (repas notés), prochain repas non noté.
5. **Récupération** : jour de repos réel ; mobilité facultative si fatigue déclarée.
6. **Activité** : marche de 10–20 min proposée un jour sans séance (jamais en plus d'une séance faite, jamais avec sécurité `training_load`).
7. **Motivation** : message du coach, jalon atteint, ligne de progression.

**`low_logging` seul** (D-027) n'est **pas** une contrainte : le jour est construit normalement (rappel quotidien, célébrations, relances) et un élément `checkin` neutre s'ajoute, une fois par épisode. Avec un vrai signal en même temps, le check-in n'apparaît pas (inchangé).

**Retour après absence** (`daysSinceActivity ≥ 3`) passe entre 2 et 3 : le jour devient `comeback`, la séance prévue est proposée en version courte, sinon une marche de 10 minutes.

## 5. Ne pas casser la sécurité

- `loggedDays()` : un repas `replaced` (mangé autre chose, calories inconnues) compte comme **noté** pour `low_logging` mais rend la journée **non complète** pour `low_intake` (on ne sait pas ce qui a été mangé, règle 7) : pas de fausse alerte d'apport bas.
- Une séance `replaced` par une marche ou de la mobilité ne compte pas comme une séance pour `training_load` (ce n'est pas de l'entraînement en plus).
- Les célébrations de jalons passent par la même porte que les autres félicitations : aucune tant que `safety.active` ; jamais une baisse de poids pour un profil `noPush`.
- La matrice existante (`src/domain/notifications/__tests__/safety.test.ts`) reste verte et est étendue aux nouveaux déclencheurs.

## 6. Voix : motivation et anti-répétition

### 6.1 Sélection de la motivation (`voice/anchor.ts`)

Les trois réponses (why, change, feel) ne sont **jamais concaténées**. Une seule est citée, choisie selon le contexte, puis la rotation évite de répéter la même deux jours de suite :

| Contexte du jour | Ordre de préférence | Raison |
|---|---|---|
| séance prévue | change → why → feel | le changement physique visé donne du sens à la séance |
| repos, récupération, journée difficile | feel → why → change | rappeler le ressenti recherché, pas l'effort |
| retour après absence, motivation basse déclarée | why → feel → change | la raison profonde, celle qui fait revenir |
| progrès, jalon, célébration | change → feel → why | relier le progrès au changement visé |
| sécurité | ancre `care` (aucune réponse personnelle) | ne jamais pousser vers l'objectif |
| check-in `low_logging` | ancre `checkin` | neutre |

Règle déterministe : on prend la première réponse donnée dans l'ordre du contexte, sauf si elle a été citée la veille (sur n'importe quel canal), auquel cas la suivante. Sans réponse : ancre neutre. « Citer mes mots » désactivé : ancre générique (notifications) ; l'écran Aujourd'hui, privé, cite toujours.

### 6.2 Catégories de messages (`voice/kinds.ts`)

Chaque déclencheur appartient à une catégorie : `motivation`, `encouragement`, `progression`, `rappel`, `celebration`, `retour` (après absence), `conseil`, `reflexion`. Le message du coach de l'écran Aujourd'hui choisit sa catégorie selon le jour (progrès récent → progression, jalon → célébration, journée difficile → encouragement, repos → conseil ou réflexion, sinon motivation) en évitant **la même catégorie trois jours de suite**.

### 6.3 Historique partagé

- L'écran et les notifications partagent un **historique de voix** (90 jours, identifiants de modèles seulement, jamais le texte) : la rotation LRU voit tout ce qui a été dit, sur tous les canaux.
- Le message de l'écran est composé une fois par jour et gardé pour la journée (il ne change pas à chaque ouverture), puis change le lendemain.
- Interdit : le même `templateId` deux fois en 14 jours, sur tous les canaux confondus, quand une autre variante existe.

### 6.4 Ton

Humain, positif, crédible, direct, jamais culpabilisant. La garde de ton (`voice/tone.ts`) s'applique à toute nouvelle chaîne, y compris les écrans du coach (pas seulement `coach.*`). Le coach ne dit jamais ce que l'utilisateur ressent sans donnée : « Tu as indiqué une énergie basse » oui, « Tu sembles démotivé » non.

## 7. Journée difficile, « J'ai 15 minutes », « Je n'ai pas envie » (`day-modes.ts`)

### 7.1 Journée difficile

Détectée à partir de **données déclarées ou planifiées seulement**, au moins deux signaux parmi :

- temps disponible déclaré < 50 % de la durée prévue de la séance, ou aucun créneau libre aujourd'hui (disponibilités + calendrier) ;
- fatigue ≥ 4 ou énergie ≤ 2 (check-in du jour) ;
- motivation ≤ 2 (check-in du jour) ;
- au moins 2 contraintes fixes ou événements de calendrier aujourd'hui.

Réponse : version **minimale** du jour, jamais l'abandon du programme. Séance de 60 min → **20 min** (`shortSession`, 20 min) ; fatigue ≥ 5 ou énergie ≤ 1 → repos ; fatigue 4 → mobilité 10 min ; sinon marche 10–15 min. Les repas restent (la sécurité nutritionnelle ne baisse jamais), le repas le plus rapide est proposé. La version minimale compte comme une journée active.

### 7.2 « J'ai 15 minutes »

Bouton toujours visible sur Aujourd'hui (actions rapides). Recalcule une **version courte du jour** :

- **sport** : séance de 15 min (circuit des mêmes mouvements, matériel disponible, `shortSession`) ;
- **repas** : pour chaque repas restant, la recette compatible la plus rapide (`alternativesFor('faster')`), **proposée** (un geste pour l'appliquer), jamais imposée ; allergies, régime et exclusions toujours respectés (même moteur) ;
- **organisation** : préparation de repas et courses du jour proposées à un autre jour de la semaine.

Enregistré comme mode `short` du jour ; la séance courte compte pleinement dans l'adhérence. Aucune formulation d'échec.

### 7.3 « Je n'ai pas envie »

Flux en une question (énergie / fatigue / motivation préremplies, modifiables), puis au choix :

1. **version courte** (15–20 min) ;
2. **activité légère** (marche, mobilité) : la séance est notée « remplacée par … » ;
3. **report intelligent** : prochain créneau libre de la semaine (`rescheduleOptions`) ; s'il n'y en a pas, « On la laisse pour cette semaine » (sautée, sans rattrapage) ;
4. **repos** proposé en premier si fatigue élevée, sécurité `training_load`, ou séances de la semaine déjà toutes faites.

Le choix est enregistré (issue + raison « pas envie » si l'utilisateur l'a donnée par ce bouton) ; rien n'est déduit.

## 8. Écran Aujourd'hui

Structure (mobile, une colonne) :

```
Bonjour Camille 👋                          ⚙
[ligne de progression : 12 séances depuis le début · 3 semaines d'affilée]
Ton objectif : Perte de gras
Pourquoi tu as commencé : « Me sentir bien dans mes vêtements »
──────────── [bannière sécurité si active] ────────────
AUJOURD'HUI
 🏋️ Entraînement   Haut du corps · 18:00 · 45 min        [Pourquoi ?]
 🍽️ Nutrition       ~2 000 kcal (estimation) · 1/4 repas notés
 🚶 Activité        Marche de 15 min (jour sans séance)
 💧 Habitude        Pesée (lundi)
──────────── MESSAGE DU COACH ────────────
 [message court, composé par la voix]
──────────── ACTION PRINCIPALE ────────────
 [ Commencer ma journée ]
 [J'ai 15 minutes] [Je n'ai pas envie] [Journée difficile]
```

- Tablette/desktop (≥ 768 px) : deux colonnes (jour + actions à gauche, motivation/progression/semaine à droite), largeur max 1100 px.
- États : chargement (squelette), aucun profil (vers l'onboarding), plan repas en cours de génération, erreur (message + réessayer), succès (élément coché, transition douce, annonce lecteur d'écran).
- Accessibilité : rôles et états (`aria-checked` sur le web pour les chips, correction du point relevé en revue), zones tactiles ≥ 44 px, ordre de lecture = ordre visuel, contrastes testés (`theme/__tests__/contrast.test.ts`), annonces des changements (`accessibilityLiveRegion`).
- Animations : entrée en fondu des cartes, coche animée, respect de « réduire les animations ».

## 9. Données : où elles vivent

| Donnée | Appareil | Serveur | Synchronisée | Note |
|---|---|---|---|---|
| Profil, objectif, why/change/feel | ✓ | ✓ | ✓ | inchangé |
| Séances faites (variante) + séries | ✓ | ✓ | ✓ | inchangé |
| Issue d'une séance non faite (sautée, remplacée + par quoi, raison) | ✓ | `workout_sessions` | ✓ | nouveau |
| Report de séance | ✓ | — | ✗ | reste local (planification de la semaine) |
| Échange d'exercice + raison | ✓ | `exercise_substitutions` | ✓ | nouveau |
| Repas mangés / sautés / remplacés + raison | ✓ | `meal_plan_items` | ✓ | sautés et remplacés désormais synchronisés (D-026 levé) |
| Plan repas prévu (non noté) | ✓ | — | ✗ | recalculé depuis le profil |
| Journal compact des repas notés (au-delà de la semaine) | ✓ (400 jours) | via `meal_plan_items` | ✓ | reconstruit depuis le serveur sur un nouvel appareil |
| Pesées, tour de taille, autres mesures | ✓ | `weight_logs`, `body_measurements` | ✓ | autres mesures : nouveau |
| Check-in quotidien + mode du jour + activité légère | ✓ | `daily_checkins` | ✓ | sync nouvelle |
| Weekly Check-in | ✓ | `weekly_checkins` | ✓ | nouveau |
| Jalons atteints / célébrés | ✓ | `journey_milestones` | ✓ | nouveau |
| Décisions d'adaptation | ✓ | `adjustments` | ✓ | nouveau |
| `JourneyState`, `DailyPlan`, `ProgressJourney`, mémoire dérivée | calculés | — | ✗ | dérivés, jamais stockés (une seule vérité) |
| Historique de voix (rotation) et des notifications | ✓ | `notification_history` (prête) | ✗ | par appareil (TODO existant) |
| Préférences de notifications | ✓ | `notification_settings` (prête) | ✗ | par appareil (TODO existant) |

## 10. Offline et performance

- Tout est **local d'abord** : le jour, la séance, l'enregistrement d'une séance ou d'un repas, la progression récente fonctionnent hors connexion ; la sync par différence (D-015) envoie ensuite.
- Pas de recalcul inutile : `useJourney()` mémorise sur les entrées (références des stores). Mesuré par un test de performance sur un an de données (`journey/__tests__/performance.test.ts`, budget 50 ms en CI). Pas de cache persistant tant que la mesure tient le budget (D-028).

## 11. Coach IA (couche future)

`journey/explain.ts` répond de façon structurée et déterministe à : « Pourquoi cette séance ? », « Pourquoi ce repas ? », « Pourquoi mon plan a changé ? », « J'ai raté ma séance, que faire ? ». Chaque réponse = clé de texte + paramètres + **données utilisées** (références). L'écran les affiche dès maintenant (« Pourquoi ? ») ; l'IA, plus tard, pourra seulement les reformuler (Edge Function, `docs/AI_ARCHITECTURE.md`). Elle ne lit jamais l'historique brut et ne peut rien décider.

## 12. Tests

W-7 : `coach.test.ts` (priorités, cas A–F, question, cause → action, suivi, stabilité, ton FR/EN), `coach-memory.test.ts`, `coach-scenarios.test.ts` (trois parcours de plusieurs semaines), E2E `e2e/coach.spec.ts`.

Unitaires : `DailyPlan` (premier jour, jour normal, repos, retour, journée difficile, 15 min, pas envie, sécurité active, `low_logging` seul), sélection de motivation, catégories et anti-répétition multi-canal, explications. E2E : premier jour, jour normal, journée difficile, absence puis retour, sécurité active, `low_logging` seul. Détail : `docs/TESTING.md`.

## 13. Coach du jour (W-7, D-039)

Question à laquelle le coach répond chaque jour : « Quelle est la chose la plus utile à dire ou proposer à cette personne aujourd'hui, compte tenu de son objectif, de son histoire et de ce qui s'est réellement passé ? » Boucle : observer → détecter → comprendre (en demandant) → intervenir → suivre → apprendre prudemment (seulement ce que l'utilisateur confirme).

### 13.1 Modèle

`coachDay(input): CoachDay`, pure, sans horloge ni aléatoire : tout ce qu'elle lit est dans son entrée (`DailyPlan`, `JourneyState`, proposition W-5 de tête, célébration, adaptation en cours et effets observés, signal de blocage, mémoire de jours courts, signaux nutrition, progression stockée W-4, lignes déjà montrées sur l'appareil). `useJourney()` est le seul point d'assemblage ; l'écran, les notifications et Réglages consomment le résultat.

```
CoachDay {
  date, priority,                // une seule priorité
  primary: CoachAction | null,   // une seule action principale
  supportingFacts: Copy[],       // ≤ 3 faits, jamais une estimation
  secondary: CoachAction | null, // une action secondaire au plus
  question: CoachQuestion | null,// une question au plus
  celebration, safety, activeAdaptation, offPlan, why, calm,
  deferred: ('proposal'|'question'|'celebration'|'nutrition')[],
  explanation: { rule, facts },  // faits → règle → recommandation
  shownIds                       // pour l'anti-répétition de l'appareil
}
```

### 13.2 Ordre de priorité (première vraie gagne)

| # | Priorité | Quand |
|---|---|---|
| 1 | `safety` | règle de sécurité active (`safety.ts`, inchangée) : rien d'autre ne mène, pas de question, pas de célébration, pas de proposition |
| 2 | `comeback` | retour après une pause : on reprend simplement ; seule la proposition « reprise en douceur » peut mener |
| 3 | `structural` | une proposition W-5 (D-037, réutilisée telle quelle : mêmes boutons, même journal) |
| 4 | `session` | séance prévue à faire, ou sa version allégée un jour difficile |
| 5 | `difficulty` | question « Qu'est-ce qui t'a le plus bloqué ? » en attente |
| 6 | `nutrition` | ingrédients manquants, plan du jour incomplet, plan impossible avec les contraintes, courses prévues |
| 7 | `recovery` | fatigue élevée déclarée ou mobilité proposée |
| 8 | `progression` | une progression stockée (W-4, `increase_load`) dans la prochaine séance |
| 9 | `motivation` | une célébration ou le « pourquoi » du jour |
| 10 | `light` | sinon : « Rien de particulier à ajuster aujourd'hui. » |

Cas croisés (testés) : séance + nutrition → séance (nutrition en secondaire) ; fatigue + progression → récupération ; adaptation + record → adaptation (célébration différée) ; sécurité + jalon → sécurité ; reprise + why → reprise ; repos sans rien → contenu léger.

### 13.3 Causes : demander, jamais deviner

- **Observation** (`coach-memory.ts`, `blockerSignal`) : jours prévus passés (fenêtre 14 j, depuis le début du parcours, aujourd'hui exclu) sans séance notée ni issue déclarée. Seuil : 2.
- **Cause récente** : une réponse à la question (< 14 j), la raison d'une séance sautée, ou le problème principal du bilan hebdo. Elle existe → on ne redemande pas.
- **Question** : « J'ai vu que plusieurs séances prévues n'ont pas eu lieu récemment. Qu'est-ce qui t'a le plus bloqué ? » — temps, fatigue, douleur / gêne, motivation, planning, matériel, autre, ou « Pas maintenant » (attente 7 j). Jamais de compte de ce qui n'a pas été fait dans le texte.
- **Cause → action** (moteurs existants) : temps → version courte (séance aujourd'hui) ou déplacer une séance ; fatigue → « Dire comment je me sens » (`/adapt`) ; motivation → version plus petite ; douleur → alléger la séance du jour + prudence + professionnel de santé si ça persiste ; planning → déplacer une séance ; matériel → « Remplacer » pendant la séance ; autre → rien d'inventé, le plan reste le même.

### 13.4 Mémoire du coach

Seule mémoire apprise en W-7 : **« séance courte tel jour de la semaine »**. Observation (l'utilisateur a choisi lui-même « J'ai 15 minutes » ≥ 2 fois le même jour de la semaine en 6 semaines) → question → « Oui, garde-le en tête » → mémoire. Effet : ce jour-là, la version courte est proposée en action secondaire ; le plan prévu reste le plan. « Non merci » ou « Oublier » : la question ne revient qu'après de nouvelles occurrences. Visible et oubliable dans Réglages (« Ce que le coach retient »). Jamais une source de vérité : rien n'est calculé à partir d'elle hors de cette proposition.

Stockage : lignes du journal `adjustments` (déjà synchronisé, append-only) avec `change_key` préfixé `coach.` (`coach.blocker`, `coach.memory.short_day`), `kind = 'planning'`, réponse fermée dans `to`, aucun texte libre. Elles sont exclues de tout ce qui lit des décisions d'adaptation (`effectiveDecisions`, `overriddenDecisions`, historique, mémoire du parcours). « Oublier » = `revertDecision` ; le dernier geste par `proposal_id` est en vigueur (convergence multi-appareil). La table `coach_memory` reste inutilisée (D-039).

### 13.5 Cadence et anti-répétition (`CADENCE`)

Fenêtre d'observation 14 j · 2 occurrences minimum · cause valable 14 j · une question au plus par jour, 3 j de pause entre deux affichages, 2 affichages max sur 14 j · « Pas maintenant » 7 j · habitude : 2 fois sur 6 semaines · suivi d'une adaptation : une fois, dans les 7 j après sa fin, « pas assez de recul » sous 2 séances prévues. Les lignes déjà montrées (`coachShown`, appareil, 90 j) ne comptent que pour les jours **précédents** : l'écran est stable dans la journée.

### 13.6 Le « pourquoi » avec parcimonie

La phrase de l'utilisateur (« Pourquoi tu as commencé ») n'est citée que : premier jour, reprise, jalon, journée difficile / 15 min / pas envie, motivation déclarée basse, ou risque d'abandon détecté (`retention`). Jamais sous sécurité. Les autres jours : rien.

### 13.7 Notifications

`todayPriority` entre dans le canal : un jour de reprise, de proposition structurelle ou de question de cause (les jours où l'écran retient la célébration), les déclencheurs de félicitation / progrès / why (`HELD_BY_COACH`) sont retenus pour la journée. Heures calmes, maximum par jour et pause restent appliqués par le planificateur existant, inchangé.

### 13.8 Écran

Carte « coach du jour » (`CoachCard`) : titre du jour, phrase calme si rien n'est ajusté, action principale, faits, action secondaire, « Pourquoi ce choix ? » (règle + « Basé sur : … », ou « Je n'ai pas assez de données pour en dire plus. »). Proposition W-5 : la carte de proposition existante. Question : `CoachQuestion` (au-dessus de la carte quand la priorité est `difficulty`). Libellés d'accessibilité précis (« Ce qui m'a le plus bloqué : Manque de temps », « Oublier : Séance courte le mercredi », « Passer à 2 séances par semaine »).
