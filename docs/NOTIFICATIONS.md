# Notifications — canal de sortie du Transformation Journey Engine

Statut : livré (D-024). Conception d'ensemble : `docs/TRANSFORMATION_JOURNEY.md`.

Les notifications ne sont **pas un moteur à part** (CLAUDE.md, règle 6). Elles lisent l'état unique du parcours (`JourneyState`, `src/domain/journey/state.ts`) et parlent avec la voix du coach (`src/domain/journey/voice/`), comme l'écran Aujourd'hui. Ce canal décide seulement **quand** parler et **combien**.

## Architecture

```
usePlan() ──┐
            ├─▶ useJourneyState()  ──▶ JourneyState (source de vérité unique, recalculée)
stores ─────┘        │                  goal · motivation · progress · momentum ·
                     │                  difficulties · safety
                     ▼
   src/domain/notifications
   rules.ts           quand parler (sécurité d'abord, puis anti-abandon, puis motivation)
   engine.ts          préférences → pause → heures calmes → cooldowns → 1 message motivation/jour
                      → plafond quotidien et écart minimal → formulation par la voix du coach
   anti-repetition.ts cooldowns, épisodes d'absence, plafond baissé si messages ignorés
   history.ts         historique de l'appareil (ids de modèles, jamais le texte)
                     │
                     ▼
   src/domain/journey/voice
   catalog.ts         variantes titre / ancre / action / sens, par déclencheur
   composer.ts        choix déterministe (rotation LRU), rendu « ancre. action. sens. »
   tone.ts            garde de ton : ni reproche, ni pression, ni vocabulaire clinique, ni estimation
                     │
                     ▼
   src/services/notifications.ts  planification locale (expo-notifications), ouverture → historique
```

Aucune IA générative : tous les textes sont dans `src/i18n/locales/{fr,en}.ts` sous `coach.*`, relus et testés.

## Forme d'un message

Chaque notification contient trois phrases, toujours dans cet ordre :

1. **Ancre** : pourquoi l'utilisateur a commencé, avec ses mots (`why`, `change` ou `feel` de la table `motivations`, en rotation, coupés à 80 caractères). Sans réponse : une ancre neutre. Si l'utilisateur désactive « Citer mes mots » : une ancre générique, rien de personnel sur l'écran verrouillé. Messages de sécurité : ancre `care`, jamais l'objectif.
2. **Action** : une petite chose à faire maintenant (préparer son sac, une marche de 10 minutes, ouvrir sa liste…).
3. **Sens** : pourquoi cette action compte, adapté à la famille d'objectif (perte, prise, recomposition, santé, performance), sans aucune valeur estimée sur le corps.

Exemple : « Séance à 18:00 — Tu as commencé pour « être fier de moi ». Ta séance de 18:00 t'attend : prépare tes affaires maintenant. Chaque séance faite rend la suivante plus facile. »

## Déclencheurs (règles métier)

| Déclencheur | Quand | Catégorie |
|---|---|---|
| `safety_low_intake` / `safety_fast_loss` / `safety_training_load` | règle de sécurité active (§ ci-dessous), au plus un tous les 3 jours | toujours envoyé si les notifications sont activées |
| `safety_low_logging` | repas laissés sans réponse plusieurs jours (D-026) : message neutre, une seule fois par épisode ; n'active pas la règle de sécurité, les autres messages continuent (D-027) | toujours envoyé si les notifications sont activées |
| `session_planned` | 60 min avant chaque séance prévue non faite (variante courte si créneau court) | Séances |
| `session_planned_tired` | même chose quand le check-in du jour indique de la fatigue, ou quand la sécurité signale trop d'entraînement | Séances |
| `meal_planned` | heure choisie ; nomme le repas principal prévu s'il existe | Repas |
| `weigh_in` | jour et heure choisis | Pesée |
| `shopping` | créneau courses du plan | Courses |
| `weekly_progress` | dimanche 18:00 si la moyenne de poids va vers l'objectif (et pas de sécurité active) | Bilan |
| `weekly_checkin` | dimanche 18:00 sinon | Bilan |
| `success_session` | le lendemain matin d'une séance faite | Motivation |
| `success_streak` | lundi 19:00 aux paliers 2, 3, 4, 6, 8, 12… semaines d'affilée, une fois par palier | Bilan |
| `absence_gentle` / `absence_comeback` / `absence_last` | 2, 5 et 10 jours après la dernière activité notée, sauf jour de séance prévue ; puis silence | Motivation |
| `fatigue_recovery` | check-in du jour fatigué, sans séance prévue | Motivation |
| `daily_why` | chaque jour à l'heure choisie | Motivation |

**Un seul message « motivation » par jour**, dans cet ordre : sécurité → séance réussie → absence (la plus longue) → récupération → rappel quotidien.

Les relances d'absence sont planifiées à l'avance (le téléphone ne peut pas « remarquer » une absence app fermée) et annulées dès que l'utilisateur note une activité, puisque l'app replanifie tout à chaque changement.

## Règle de sécurité (CLAUDE.md, règle 8)

Évaluée **avant** toute autre règle, dans `src/domain/journey/safety.ts`, à partir de valeurs saisies uniquement : journées notées en entier nettement sous la cible ou sous le plancher (3 jours de suite), perte de poids de plus de 1 %/semaine deux semaines de suite, plus de séances que prévu avec fatigue déclarée sur 2 jours. Depuis D-026 : repas non notés plusieurs jours (`low_logging`, message neutre, qui n'active pas la règle : D-027), perte rapide vue avec une pesée par semaine (message « tendance imprécise »), séances bien au-delà du programme 3 semaines de suite sans fatigue déclarée. Seuils et détails : `docs/TRANSFORMATION_JOURNEY.md` §4.5.

L'interrupteur général coupe aussi ces messages (D-025) ; l'écran Aujourd'hui les affiche toujours.

Quand elle est active, le canal notifications :

- n'envoie **ni félicitation** (séance réussie, série, « ta tendance va dans le bon sens ») **ni relance** (absence, rappel quotidien) ;
- envoie le message de sécurité (expliquer, proposer de réduire, professionnel de santé), même si les catégories Motivation et Bilan sont désactivées ; il respecte l'interrupteur général, la pause et les heures calmes ;
- propose la version allégée pour chaque séance si la sécurité concerne l'entraînement ;
- retire des rappels repas et séance les phrases qui poussent vers l'objectif (perte, prise, performance).

L'écran Aujourd'hui affiche le même message (`SafetyNotice`) et masque la carte de motivation.

## Anti-répétition et anti-harcèlement

- **Rotation** : chaque partie (titre, ancre, action, sens) est choisie parmi les variantes compatibles, la moins récemment utilisée d'abord ; à égalité, une rotation déterministe selon la date. Le rappel quotidien ne répète jamais le même message dans la semaine, ni deux fois de suite la même action ou la même ancre.
- **Déjà envoyé aujourd'hui** : un déclencheur déjà délivré ce jour n'est pas replanifié (par exemple si l'utilisateur change l'heure après coup).
- **Cooldowns** : pesée, bilans et série 6 jours ; récupération 2 jours ; sécurité 3 jours ; une série n'est fêtée qu'une fois par palier ; chaque étape d'absence une seule fois par épisode (épisode = dernier jour actif).
- **Messages ignorés** : après 5 messages délivrés de suite sans ouverture, le plafond quotidien baisse de 1 (minimum 1) jusqu'à la prochaine ouverture.
- **Plafond** : 3 par jour par défaut (1 à 4 dans l'écran), écart minimal de 60 minutes, heures calmes (22:00 → 07:30 par défaut ; un rappel du matin est décalé à la fin des heures calmes, un rappel du soir est supprimé).

## Historique

`NotificationHistoryEntry` (store `py.notifications.v1`, sur l'appareil) : id `date:déclencheur`, déclencheur, catégorie, `templateId` (`trigger|titre|ancre|action|sens`), ancre utilisée, date et heure locales, statut (`scheduled` → `delivered` quand l'heure est passée, `opened` quand l'utilisateur touche la notification), quelques faits non personnels (début d'épisode d'absence, palier de série).

- Jamais le texte affiché : les mots de l'utilisateur restent dans `motivations`.
- Conservé 90 jours, puis effacé.
- Exporté dans le Centre de confidentialité (réglages de l'appareil), effacé avec les données de l'appareil.

Côté serveur, `notification_history` a la même forme (contrainte SQL : `template_id` ne peut contenir que des identifiants du catalogue, `facts` ≤ 512 octets). La synchronisation de l'historique et des préférences n'est **pas encore branchée** (voir TODO) : les rappels sont planifiés par appareil.

## Préférences

Écran Réglages → Notifications :

- interrupteur général (permission demandée à ce moment-là, jamais au premier lancement) ;
- catégories : séances, repas, pesée, courses, bilan, motivation, calendrier ;
- plafond quotidien, heures calmes, heures du rappel repas, du message de motivation et de la pesée ;
- **Messages du coach** : citer mes mots (défaut : oui), me relancer après quelques jours sans activité (défaut : oui), fêter mes séances et mes semaines (défaut : oui) ;
- **pause de 7 jours** (vacances, maladie, envie de souffler) : rien n'est planifié avant la fin de la pause.

Le ton (`gentle` / `direct`) vient du profil (`user_preferences.motivation_style`) : quelques variantes plus directes ne sont proposées qu'aux personnes qui l'ont choisi.

Tables serveur : `notification_preferences` (une ligne par catégorie, existante) et `notification_settings` (une ligne par utilisateur : plafond, heures, options du coach, pause).

## Web

Les rappels programmés ne sont pas disponibles sur le web (l'écran le dit) ; la voix du coach s'affiche sur l'écran Aujourd'hui.

## Tests

- `src/domain/notifications/__tests__/engine.test.ts` : règles, plafonds, heures calmes, absence, succès, fatigue, sécurité, rotation, déterminisme.
- `src/domain/notifications/__tests__/history.test.ts` : réconciliation, ouverture, purge à 90 jours.
- `src/domain/journey/__tests__/` : état unique, règle de sécurité, catalogue ↔ traductions, garde de ton sur chaque texte FR et EN, conformité des `templateId` à la contrainte SQL.
- `supabase/tests/rls.sql` : isolation des deux tables, upsert par `client_id`, refus d'un texte libre dans `template_id`, purge limitée à ses propres lignes.
