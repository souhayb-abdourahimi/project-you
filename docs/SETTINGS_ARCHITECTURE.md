# Réglages et profil : une source de vérité par réglage (W-8, D-043)

Question de W-8 : tout ce que l'app sait faire peut-il être contrôlé, compris et corrigé par
l'utilisateur ? Ce document est le contrat. Chaque réglage a **une** source, **un** chemin
d'écriture, et dit ce qu'il change (maintenant, le futur, jamais le passé).

## 1. Audit de départ (main `057f30b`, 2026-10-07)

| Constat | Classe | Traitement W-8 |
| --- | --- | --- |
| Aucun éditeur de profil : seulement « Refaire le questionnaire » (tout le parcours pour changer un champ) | caché | Réglages par section (`/settings/[section]`), mêmes questions que l'onboarding |
| Refaire le questionnaire remettait `createdAt` à aujourd'hui et écrasait le poids du profil | réécrit l'historique | `editedSnapshot` garde le début du compte et le poids ; un nouveau poids saisi devient une pesée du jour |
| Langue : pas de choix persistant ; `preferences.locale` toujours `fr` et jamais lu | visible non modifiable / sans effet | Réglage de l'appareil (`py.device.v1`, défaut : langue du système) ; `locale` du compte informatif |
| `motivationStyle` (ton du coach) lu par la voix, jamais modifiable après l'onboarding | caché | Affichage › Ton du coach |
| Unité de poids : kg seulement | absent | `preferences.weightUnit` kg / lb, synchronisé (`user_preferences.weight_unit`) |
| Préférences de notifications sur l'appareil seulement, alors que `notification_settings` existait | modifiable non synchronisé | Synchronisées (compte), autorisation système par appareil |
| Catégorie « Calendrier » sans aucun déclencheur | toggle décoratif | Retirée ; « Bilan de la semaine » et « Étapes franchies » séparées de « Progrès » |
| Jour de pesée et interrupteur des heures calmes non modifiables | caché | Exposés |
| Fréquence : un ajustement accepté (`sessions_per_week`) remplaçait silencieusement la réponse du profil (programme à 3, profil à 4) | source ambiguë | Note explicative ; changer la fréquence dans Réglages termine l'ajustement (ligne `reverted`, append-only) |
| Ajustement calorique gardé après un changement d'objectif | incohérence | Retiré (ligne `reverted`) à la confirmation du nouvel objectif |
| Déconnexion : vidait l'appareil sans envoyer les changements en attente | perte silencieuse | Synchroniser d'abord, puis avertir avec le nombre de changements restants |
| Aucune correction d'une pesée ou d'une mensuration | non corrigeable | « Corriger mes mesures » |
| `usePlaces` écrit `gymName` / `hasGym` dans le profil (choix d'une salle) | second chemin d'écriture | Gardé : même snapshot, même sync ; c'est une saisie de l'utilisateur, documentée ici |
| `coach_memory` (table) | héritée, inutilisée | Option A (D-043) : gardée, exportée, supprimée avec le compte, jamais lue |
| Table `notification_preferences` (une ligne par catégorie) | héritée, jamais écrite | Gardée (exportée, supprimée avec le compte) ; remplacée par `notification_settings.categories` |

## 2. Chemin d'un réglage

```
écran (features/settings, app/settings)          aucune règle métier
  → view model / hook (useProfileEdit, usePreferenceSettings, notification store)
  → domaine pur (settings/impact.ts, sections.ts, units.ts ; notifications/types.ts)
  → stockage local (zustand persist : py.profile.v1, py.notifications.v1, py.device.v1, py.data.v1)
  → sync (domain/sync/projection.ts : project / diff / applyRemote)
  → consommateurs (usePlan, moteurs nutrition / entraînement / notifications, voix, i18n)
```

Pas de « moteur de réglages » : un changement de profil passe par les moteurs existants
(`ensureProgram` versionne le programme, `ensureWeek` replace les séances à venir, le plan de repas
est régénéré avec `carryOverEaten`).

## 3. Correspondance réglage → source → sync → consommateurs

| Réglage | Écran | Source locale | Sync (table.colonne) | Consommateurs | Effet sur l'historique | Confidentialité |
| --- | --- | --- | --- | --- | --- | --- |
| Prénom, année de naissance, taille, sexe, activité, rythme de vie | Réglages › Toi | `snapshot.user`, `lifestyle` | `profiles` | nutrition (estimation des besoins), voix | aucun (repères recalculés à partir d'aujourd'hui) | catégorie « Profil » |
| Poids du profil | Mon évolution (pesées) | `weights` (+ `snapshot.user.weightKg` = base avant la 1re pesée) | `weight_logs` | nutrition, tendances | une correction change la valeur de cette pesée (classe A) | « Pesées » |
| Objectif, poids et date souhaités, priorités | Réglages › Objectif | `snapshot.goal` | `goals` | nutrition, programme (`programParams`) | nouvelle version de programme à partir d'aujourd'hui ; l'ajustement calorique de l'ancien objectif est terminé | « Profil » |
| Pourquoi, réponses de motivation | Réglages › Motivation | `snapshot.motivation` | `motivations` | voix (citées si « Citer mes mots ») | aucun | « Réponses de motivation » |
| Salle, matériel, niveau, fréquence, durée, exercices exclus, sports | Réglages › Entraînement | `snapshot.training` | `user_preferences.training` | `programParams` → `ensureProgram`, planning | nouvelle version si un paramètre figé change ; séances faites ou commencées intactes | « Profil » |
| Disponibilités | Réglages › Disponibilités | `snapshot.schedule` | `user_preferences.schedule` | planning (`ensureWeek`) | séances à venir replacées, même version | « Profil » |
| Régime, allergies, intolérances, exclusions, repas, cuisine, budget | Réglages › Alimentation | `snapshot.nutrition`, `lifestyle.kitchen`, `budget` | `user_preferences` | plan de repas | repas à venir de la semaine régénérés, repas cochés conservés | « Profil » |
| Ton du coach | Réglages › Affichage | `snapshot.preferences.motivationStyle` | `user_preferences.motivation_style` | voix | aucun | « Profil » |
| Unité de poids (kg / lb) | Réglages › Affichage | `snapshot.preferences.weightUnit` (absent = kg) | `user_preferences.weight_unit` (envoyée seulement une fois choisie) | `formatMass`, formateur i18n `mass`, `MassField`, `SetEntry` | **aucun** : tout est stocké en kg, conversion à l'affichage et à la saisie seulement | « Profil » |
| Langue | Réglages › Affichage | `py.device.v1.language` (`system` / `fr` / `en`) | non (réglage de l'appareil) ; `profiles.locale` mis à jour pour information | i18n | aucun | aucune donnée personnelle |
| Notifications (interrupteur général, catégories, options du coach, pause, heures calmes, maximum par jour, horaires, jour de pesée) | Notifications | `py.notifications.v1.prefs` (+ `prefsSaved`) | `notification_settings` (une ligne, `quiet_enabled`, `categories` jsonb) | `planNotifications` | aucun (les messages déjà envoyés restent dans `notification_history`) | exportées, supprimées avec le compte |
| Autorisation des notifications | Notifications | `permission` (appareil) | non : propre à chaque appareil | service de notifications | aucun | — |
| Ce que le coach retient | Réglages | `adjustments` (`coach.*`) | `adjustments` | Daily Coach | oublier = nouvelle ligne `reverted` ; la ligne d'origine reste | « Suivi du parcours » |
| Calendrier, lieux, santé | Connexions | `py.calendar.v1`, profil (salle), `py.health.v1` | non (appareil) / profil (salle) | planning, lieux | aucun | voir PRIVACY.md |

Un réglage absent de ce tableau n'existe pas. Une préférence non modifiée n'écrase jamais celle du
compte : `prefsSaved` (notifications) et `weightUnit` absent (unité) ne sont pas envoyés.

## 4. Onboarding ↔ Réglages

Chaque question de l'onboarding appartient à **une** section de Réglages, éditée avec les mêmes
composants (`StepContent mode="settings"`) ; seul le récapitulatif (`review`) n'est pas un réglage.
Test : `src/domain/settings/__tests__/settings.test.ts` (matrice).

| Section | Questions |
| --- | --- |
| Toi | `profile.name`, `profile.age`, `profile.body` (taille ; le poids vit dans Mon évolution), `profile.sex`, `profile.activity`, `life.status` |
| Objectif | `goal.type`, `goal.target`, `goal.priorities` |
| Motivation | `motivation.why`, `motivation.more` |
| Entraînement | `training.gym`, `training.gymDetails`, `training.homeEquipment`, `training.level`, `training.frequency`, `training.refusedExercises`, `training.sports` |
| Disponibilités | `schedule.availability` |
| Alimentation | `diet.type`, `diet.allergies`, `diet.foods`, `diet.meals`, `kitchen.equipment`, `budget.food` |

« Refaire le questionnaire » reste dans Réglages › Recommencer (changer d'objectif, de rythme,
reprendre après une pause sans nouveau compte) : il est prérempli, garde le début du compte, et
passe par le même calcul d'impact et la même confirmation qu'une section.

## 5. Changements structurants (`settings/impact.ts`)

`profileImpact({ saved, next, adjustments })` est pur ; l'écran affiche « Ce qui va changer » avant
d'enregistrer.

| Effet | Champs | Ce qui change | Confirmation |
| --- | --- | --- | --- |
| `immediate` | prénom, motivation, priorités, poids et date souhaités, nom de salle, sports, ton | affiché tout de suite | non |
| `targets` | âge, taille, sexe, activité, objectif | repères caloriques recalculés à partir d'aujourd'hui (estimation) | objectif : oui |
| `meals` | régime, allergies, exclusions, repas, cuisine, objectif | repas à venir de la semaine régénérés, repas cochés gardés | retrait d'allergie : oui |
| `schedule` | disponibilités, fréquence, durée, salle | séances à venir replacées | — |
| `program` | objectif, fréquence, durée, niveau, matériel, salle, exercices exclus (si `programParams` change) | nouvelle version du programme à partir d'aujourd'hui ; séances faites ou commencées gardent leur prescription (D-033) | oui |

Confirmation obligatoire si : nouvelle version de programme, allergie retirée (D-023), objectif
changé, ou un ajustement accepté est remplacé. **Anti-incohérence (§24)** : programme à 3 séances
par un ajustement, nouvelle préférence 4 → l'ajustement est terminé par une ligne `reverted`
(`evidence.replacedBy = 'frequency_setting'`, D-037 append-only), le futur programme suit 4 ;
l'ancienne version et l'ajustement restent dans l'historique. Tant qu'un ajustement est en vigueur,
la section Entraînement le dit (`DecisionNote`).

## 6. Correction des données

| Classe | Donnée | Règle |
| --- | --- | --- |
| A — modifiable | pesée, tour de taille, mensuration (`/measurements`), séries d'une séance (W-3), inventaire, dépenses | la valeur saisie par erreur change ; les tendances se recalculent avec ce qui reste |
| B — nouvel événement | décision d'adaptation, mémoire du coach, statut d'un repas, ressenti, réponse au bilan | on ajoute une ligne (annuler, oublier, recocher) ; rien n'est réécrit |
| C — immuable mais annulable | prescription utilisée, version de programme, remplacement d'exercice | figé (triggers) ; une nouvelle version ou une annulation (`deleted_at`) |
| D — non modifiable volontairement | historique des notifications, `createdAt`, révision des décisions | trace de ce qui a été fait ; supprimable seulement par le Privacy Center ou la suppression du compte |

## 7. Comportement des formulaires (dirty state)

- **Choix en un geste** (langue, unité, ton, interrupteurs de notifications, pause) : enregistré
  tout de suite, réversible d'un geste.
- **Formulaires de profil** : copie locale ; « Enregistrer » désactivé sans changement ou si une
  réponse manque (bandeau « À compléter avant d'enregistrer »), aperçu des effets, confirmation
  si structurant, « Annuler mes changements », et garde à la sortie (`beforeRemove` : `confirm` sur
  le web, `Alert` sur mobile).
- **Actions destructrices** (effacer l'appareil, supprimer une catégorie ou le compte, supprimer une
  mesure, oublier un souvenir du coach, se déconnecter avec des changements en attente) : toujours
  deux étapes (`ConfirmButton`).
- **Sécurité** : les messages de prudence (règle 8) ne sont pas une catégorie et ne se désactivent
  pas ; le bandeau de sécurité de l'écran Aujourd'hui reste affiché même notifications coupées
  (D-025).

## 8. Unités et langue

- Domaine en **kg** partout (poids, charges, records, prescriptions, pas de progression).
  `fromKg` arrondit pour l'affichage (0,01 kg, 0,1 lb), `toKg` convertit une seule fois à la
  saisie, à pleine précision. Basculer kg ↔ lb ne change aucune valeur stockée (tests unitaires,
  sync et E2E).
- Textes : `{{x, mass}}` (formateur i18n) au lieu de `{{x}} kg`. Les pas de charge du catalogue
  restent en kg (2,5 kg ≈ 5,5 lb) : limite documentée.
- Longueurs en cm uniquement.
- Langue : chaque nouvelle chaîne passe par i18n (FR et EN, mêmes clés et mêmes paramètres, garde de
  ton sur toutes les chaînes).

## 9. Synchronisation, hors ligne, multi-appareil

- États montrés (`sync/status.ts`) : « Enregistré sur cet appareil uniquement », « À jour »,
  « Synchronisation en cours », « Synchronisation en attente (n) », « Hors ligne (n) »,
  « Ta session a expiré : reconnecte-toi », « Certains changements ne sont pas encore acceptés ».
  Jamais de code PGRST, SQL ou RLS. Réglages › Tes données montre l'état et « Synchroniser
  maintenant » ; l'écran Aujourd'hui ne montre une ligne que hors ligne ou en cas d'action requise.
- Réglages du compte (profil, unité, notifications) : un appareil qui modifie hors ligne garde sa
  version jusqu'à l'envoi (changement local en attente prioritaire), puis tous les appareils
  convergent sur la dernière valeur envoyée. Réglages d'appareil (langue, autorisation,
  calendrier, santé) : jamais synchronisés.
- Déconnexion : synchronisation, puis si des changements restent, avertissement avec leur nombre et
  « Me déconnecter quand même ».

## 10. Erreurs et états vides

| Écran | État vide / erreur |
| --- | --- |
| Réglages › section | section inconnue, profil absent (`EmptyState`) ; réponse manquante (bandeau) |
| Corriger mes mesures | aucune mesure ; valeur hors limites (25–400 kg, 10–300 cm) |
| Notifications | web non supporté, autorisation refusée, heure invalide, heures calmes identiques |
| Compte | déconnexion échouée (rien n'est effacé), changements en attente |
| Privacy Center | suppression partielle ou échouée (D-042), export échoué |
| Séance | hors ligne, synchronisation en attente (W-3) |

## 11. Âge minimum : 18 ans et plus (décision validée le 2026-10-07)

- **Contrat** : Project You est réservé aux adultes (`MIN_AGE = 18`), pour la bêta et la v1
  publique. L'âge se calcule depuis l'année de naissance seulement (minimisation) : en 2026, 2008
  est accepté, 2009 ne l'est pas.
- **Règle unique** : `checkAge` (`domain/onboarding/steps.ts`) → `ok`, `missing`, `too_young`,
  `out_of_range` (plus de 100 ans, ou année future). Lue par l'étape de l'onboarding (« Continuer »
  désactivé), `buildSnapshot` (aucun profil construit) et le formulaire Réglages › Toi
  (« Enregistrer » désactivé). Un utilisateur de moins de 18 ans ne poursuit pas le parcours.
- **Message** neutre, sans vocabulaire médical ni juridique : « Project You est réservé aux
  personnes de 18 ans et plus : le parcours ne peut pas continuer avec cette année de naissance. »
  L'indication du champ le dit avant la saisie.
- **Comptes créés avant (règle 16+)** : leur année de naissance **inchangée** reste acceptée
  (`acceptedBirthYear`, repris du profil enregistré), pour ne bloquer personne hors de ses propres
  données ; toute autre année sous 18 ans est refusée. Les protections historiques restent en place
  et inchangées : jamais de déficit sous 18 ans ou IMC < 18,5 (`noDeficitProfile`,
  `ADULT_AGE`), aucune incitation à perdre du poids (`noPush` du parcours), ajustements caloriques
  bornés. Le schéma du profil ne rejette pas un âge stocké, pour que la synchronisation ne perde
  jamais un profil existant.

## 12. Audits

- **Données santé locales** : `py.health.v1` (AsyncStorage / localStorage, **non chiffré**),
  effacé par `resetDeviceData` (déconnexion, effacement de l'appareil) ; jamais synchronisé.
  Chiffrement au repos : TODO avant bêta (I3 de la revue PR #1).
- **Fournisseurs externes** : Overpass (OpenStreetMap) appelé directement depuis l'app, position
  arrondie (`coarsen`), instance publique limitée (D-019, TODO avant bêta) ; Ciqual 2025 embarqué
  (aucun appel) ; Open Food Facts non utilisé ; aucun scanner photo de repas.
- **Photos** : l'app n'envoie encore aucune photo. Bucket privé `progress-photos` et politiques
  `<user_id>/…` créés par la migration W-8 (testés), même convention que
  `progress_photos.storage_path` et `delete-account`.
- **Supabase Auth — Leaked Password Protection** : option du tableau de bord (Authentication ›
  Providers › Email › « Prevent use of leaked passwords », plan Pro et plus) ou Management API
  (`password_hibp_enabled`). Pas une migration SQL. À activer avant la bêta publique.
- **Index de clés étrangères** : `recipes.owner_id` et `ai_messages.conversation_id` indexés
  (lecture RLS, export, cascades) ; `workout_sessions.plan_id` non indexé (toujours nul, candidat à
  la suppression avec `workout_plans`). Les index signalés « inutilisés » sont gardés.

## 13. Préparation native (à vérifier sur appareil)

| Sujet | État | À vérifier |
| --- | --- | --- |
| Permission notifications (iOS / Android 13+) | demandée à l'activation, état par appareil | refus puis réglages système, réactivation |
| Notifications planifiées | `expo-notifications`, heures locales | heures calmes et pause sur appareil, changement d'heure |
| Minuteur de repos en arrière-plan | W-3 | verrouillage, retour dans l'app |
| Clavier | `automaticallyAdjustKeyboardInsets`, fermeture interactive | champs bas d'écran (Corriger mes mesures, horaires) |
| Zones sûres | `Screen` | encoche, barre de navigation Android |
| Cycle de vie | sync au retour au premier plan | hors ligne → en ligne |
| Photos | non envoyées | quand la fonction arrivera : permission, upload sous `<user_id>/` |
| Santé | `docs/MOBILE_HEALTH_TEST_PLAN.md` | rien testé sur appareil |

## 14. Tests

Domaine : `settings/__tests__/settings.test.ts`, `notifications/__tests__/settings.test.ts`,
`sync/__tests__/status.test.ts`, `projection.test.ts` (W-8), `lib/__tests__/format.test.ts`,
`state/__tests__/notifications.test.ts`, `state/__tests__/corrections.test.ts`,
`features/settings/__tests__/` (accessibilité, déconnexion). Base : `supabase/tests/settings.sql`,
`sync.db.test.ts` (réglages entre deux appareils). E2E : `e2e/settings.spec.ts` (mobile et bureau),
`e2e/coach.spec.ts` (oubli confirmé).
