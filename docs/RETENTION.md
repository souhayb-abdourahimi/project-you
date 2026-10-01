# Rétention : anti-abandon, retour, anti-répétition, mémoire du parcours

Statut : **architecture validée** (D-028). Modules : `src/domain/journey/retention.ts`, `memory.ts`, `voice/kinds.ts`, canal `src/domain/notifications/`.
Date : 2026-10-01. Base : `docs/TRANSFORMATION_JOURNEY.md` §4.4 (signaux de décrochage), `docs/NOTIFICATIONS.md`.

But : accompagner pendant des mois. L'utilisateur qui décroche doit trouver une porte de retour simple, sans reproche ; celui qui va bien ne doit pas être harcelé.

## 1. Système anti-abandon

Score de risque (déterministe, recalculé à chaque ouverture, jamais affiché) :

| Signal | Condition | Poids |
|---|---|---|
| `missed_sessions` | ≥ 2 séances prévues non faites (ni raccourcies, ni remplacées) sur 7 jours | 25 |
| `absence` | aucune activité notée depuis ≥ 3 jours (≥ 7 : 45) | 30 |
| `low_motivation` | motivation ≤ 2 sur 2 check-ins en 7 jours, ou semaine ≤ 2 au Weekly Check-in | 20 |
| `high_fatigue` | fatigue ≥ 4 trois jours sur 7, ou RPE moyen ≥ 9 | 15 |
| `plateau` | signal plateau actif | 15 |
| `checkin_skipped` | 2 Weekly Check-ins sautés d'affilée | 10 |
| `notifications_ignored` | 5 notifications de suite sans ouverture | 10 |

Niveaux : `watch` ≥ 30, `act` ≥ 55. Effets, jamais punitifs :

- `watch` : le Daily Coach réduit le jour (une action principale, séance courte proposée d'office), la phrase de motivation passe en ordre « why → feel ».
- `act` : carte « On allège pour deux semaines ? » (Adaptation Engine : −1 séance, repas plus simples) ou **pause** (préférence `pausedUntil`, existante).
- Le score n'est **pas stocké** (dérivé, données sensibles : état déduit). Aucun envoi au serveur.

`low_logging` (D-027) reste un signal d'engagement : il ajoute le check-in neutre, il ne réduit rien et ne coupe rien.

## 2. Retour après absence

- Détecté quand la dernière activité date d'au moins **3 jours** et que l'utilisateur revient (ouverture de l'app).
- Aujourd'hui affiche : « Content de te revoir 👋 » puis « On reprend à partir d'aujourd'hui. » Jamais « Tu as disparu », jamais la liste de ce qui a été manqué, jamais de rattrapage automatique des séances passées.
- Le jour devient `comeback` : séance prévue en version courte, sinon marche de 10 minutes. La semaine en cours n'est pas re-remplie.
- Les relances d'absence planifiées (J+2, J+5, J+10, puis silence ; existant) sont annulées dès qu'une activité est notée.
- Jalon discret : aucun (le retour n'est pas un exploit à célébrer bruyamment), mais la catégorie de message du jour est `retour`.

## 3. Anti-répétition

Trois niveaux, tous déterministes :

1. **Formulation** : rotation LRU des titres, ancres, actions et sens (existant), désormais sur l'**historique partagé** écran + notifications. Le même `templateId` n'est pas réutilisé en 14 jours tant qu'une autre variante existe.
2. **Catégories** : `motivation`, `encouragement`, `progression`, `rappel`, `celebration`, `retour`, `conseil`, `reflexion`. Pas plus de deux jours de suite la même catégorie pour le message du coach de l'écran ; « Tu peux le faire 💪 » ne peut pas devenir quotidien. Le catalogue gagne des variantes `conseil` (sommeil, préparation, hydratation, régularité) et `reflexion` (une question courte sur le ressenti, sans interprétation).
3. **Ancre** : why / change / feel choisis selon le contexte et jamais la même deux jours de suite (`docs/DAILY_COACH.md` §6.1).

Historique : 90 jours, identifiants de modèles uniquement, jamais le texte (existant pour les notifications ; l'écran y écrit désormais aussi, sur l'appareil).

## 4. Notifications

Le Daily Coach alimente le canal de notifications (règle 6 : même état, même voix). Types demandés et correspondance :

| Type | Déclencheur(s) | Catégorie de préférence |
|---|---|---|
| `daily_why` | `daily_why` (existant) | Motivation |
| `session_planned` | `session_planned`, `session_planned_tired` ; suit le `DailyPlan` (version courte si journée difficile ou retour) | Séances |
| `meal_planned` | `meal_planned` | Repas |
| `progress` | `weekly_progress`, `success_streak` | Bilan |
| `milestone` | **nouveau** `milestone_reached` (une fois par jalon, 19:00) | Bilan |
| `checkin` | `weekly_checkin`, `safety_low_logging` | Bilan |
| `comeback` | `absence_gentle`, `absence_comeback`, `absence_last` | Motivation |
| `encouragement` | **nouveau** `encouragement_kept_going` : le lendemain matin d'une journée en version courte, difficile ou remplacée (« Tu as gardé le fil ») ; remplace `success_session` ce jour-là | Motivation |
| `reminder` | `weigh_in`, `shopping` | Pesée, Courses |

Respect, dans cet ordre : interrupteur général (coupe tout, D-025) → pause → préférences par catégorie (la sécurité passe outre les catégories, pas l'interrupteur) → **heures calmes** → cooldowns et épisodes → un seul message « motivation » par jour → plafond quotidien (baissé si ignorées) → anti-répétition. Les signaux de sécurité suppriment félicitations, jalons, encouragements à en faire plus et relances (matrice de tests étendue).

### Heures calmes

Paramètre **global** (`quietStart`–`quietEnd`, existant, 22:00–07:30 par défaut) appliqué à toutes les catégories, sécurité comprise. Un rappel tombant dans les heures calmes le matin est décalé à leur fin s'il reste avant l'événement annoncé, sinon supprimé ; le soir, supprimé. Chaque catégorie peut être coupée séparément (existant). Rien ne réveille l'utilisateur.

Nouveaux déclencheurs : migration qui élargit les contraintes `check` de `notification_history` (déclencheurs, et catégories inchangées).

## 5. Mémoire du parcours (`memory.ts`)

Mémoire **structurée et dérivée** : recalculée depuis les données brutes, jamais écrite en texte libre, jamais une interprétation psychologique.

| Type | Exemples | Source | Stockée ? |
|---|---|---|---|
| **Faits** | créneau habituel des séances (heure de fin la plus fréquente, ≥ 3 séances), jour de pesée habituel, durée réelle moyenne des séances | horodatages, journaux | non, dérivée |
| **Préférences** | exercice remplacé 2× « je n'aime pas / je ne peux pas » ; recette sautée ou remplacée 2× « envie d'autre chose » ; recette souvent mangée | issues + raisons | dérivée ; **confirmée** par l'utilisateur → profil (`refusedExerciseIds`, `dislikedFoods`, `likedFoods`), déjà synchronisés |
| **Événements** | retour après absence, jalon atteint, adaptation acceptée/refusée, changement de disponibilités | journaux, `journey_milestones`, `adjustments` | oui, via ces tables |
| **Données sensibles** | douleur, santé, ressenti | — | **jamais** dans la mémoire : la douleur reste un choix du Weekly Check-in de la semaine concernée, rien n'est généralisé ni interprété |

Une préférence n'est **appliquée qu'après confirmation**. Le Centre de confidentialité affiche « Ce que le coach a retenu » (liste dérivée, avec la donnée source) et chaque élément renvoie à la donnée qui permet de le corriger ou le supprimer. La table `coach_memory` existante reste inutilisée dans cette phase (rien à stocker qui ne soit déjà ailleurs) ; elle sera supprimée ou réaffectée quand le coach IA arrivera (TODO).

## 6. Confidentialité

- Minimisation : pas de texte libre dans les check-ins, raisons et issues énumérées, score de risque non stocké.
- Export : les nouvelles tables (`weekly_checkins`, `exercise_substitutions`, `journey_milestones`, `adjustments`) et `daily_checkins` sont exportées par le Centre de confidentialité ; suppression par catégorie (« Suivi du parcours ») et en cascade avec le compte.
- RLS propriétaire sur chaque nouvelle table, testée par `supabase/tests/rls.sql` (découverte automatique des tables à `user_id`).

## 7. Tests

Score de risque (chaque signal, niveaux), retour après absence (formulation, aucun rattrapage), anti-répétition multi-canal (même template interdit en 14 jours, catégorie pas 3 jours de suite, ancre pas deux jours de suite), nouveaux déclencheurs (sécurité les supprime, `low_logging` seul ne les supprime pas, heures calmes), mémoire (préférence seulement après 2 occurrences, aucune donnée sensible, rien sans confirmation).
