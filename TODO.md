# TODO

Tâches importantes à ne pas perdre entre deux sessions. Référence des IDs : `docs/ROADMAP.md`. Tenir à jour à chaque fin de session.

## En cours / prochaine étape

- [ ] **Passe iPhone PWA (D-048) + lien iCal (D-049), 2026-10-26**, branche `claude/w9-checkin-premium`, rien de fusionné ni déployé. Fait : icônes SVG par registre (plus de police d'icônes, garde-fous Jest / dist / E2E), analyse photo auto-diagnostiquée + chaîne de fournisseurs avec Cloudflare Workers AI gratuit, Edge Function `places-nearby`, Santé et Calendrier web sans écran mort, bannière de mise à jour, suite WebKit iPhone 15 en CI, export E2E « compte » contre un faux projet, lien iCal complet (migration, fonction `calendar-feed`, écran, planification, export, suppression). À faire par Souhayb (runbook § 1 ter, 2, 3) :
  - [ ] Coller `20261026000001_calendar_feeds.sql` dans le SQL Editor.
  - [ ] Secrets : `CALENDAR_FEED_KEY` (`openssl rand -base64 32`), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`, `MEAL_VISION_PROVIDER=openai,cloudflare` (ou `cloudflare` seul).
  - [ ] Déployer `analyze-meal`, `places-nearby`, `calendar-feed` ; GET de diagnostic `analyze-meal`.
  - [ ] Comparer les modèles Cloudflare sur de vraies photos (`scripts/vision/compare-cloudflare.ts`) ; relire les conditions de conservation Workers AI et adapter la mention de consentement si besoin.
  - [ ] Mesurer Overpass depuis Fedora (`node scripts/places/measure-overpass.mjs`) ; depuis GitHub, 15/16 délais à 30 s. Avant une diffusion large : instance Overpass auto-hébergée ou fournisseur sous contrat derrière `places-nearby`.
  - [ ] Dérouler `RELEASE_CHECKLIST.md` § 6 bis (lignes D-048 / D-049) sur l'iPhone 15.
  - [ ] Plus tard : export .ics des séances (non fait), quota partagé pour `calendar-feed` et `places-nearby` (aujourd'hui par instance), rotation de `CALENDAR_FEED_KEY` (aujourd'hui : changer la clé oblige à recoller les liens).

- [ ] **PWA iPhone (D-047, 2026-10-25)**, branche `claude/w9-checkin-premium`, rien de fusionné ni déployé. Fait : manifeste, icônes, balises iOS, service worker coquille, position web, photo web honnête, export par feuille de partage, retour sans historique, Cloudflare Pages (`docs/WEB_PWA.md`). À faire par Souhayb : compte Cloudflare + `npm run deploy:web`, Redirect URLs Supabase (§ 4), puis `RELEASE_CHECKLIST.md` § 6 bis sur l'iPhone 15. Plus tard : Web Push (iOS 16.4+, app installée) si les rappels deviennent nécessaires sur le web.
- [ ] **Passe qualité produit (D-046, 2026-10-25)**, branche `claude/w9-checkin-premium`, rien de fusionné :
  - [x] Onboarding : choix uniques en passage automatique, motivations multiples, « Aucun régime particulier », questions sans effet retirées, date cible et budget en un toucher, raisons de blocage affichées.
  - [x] OpenStreetMap : User-Agent / Referer, délai, une instance de repli, erreurs distinctes + Réessayer, salles et commerces pertinents, les 30 plus proches.
  - [x] Analyse photo : double enregistrement, double envoi, annulation en quittant, 502 inexploitable, portion 0 g.
  - [x] Écrans : radios nommées, notices non alertes, « rien de noté » au lieu de 0, budget sans montant, démarrage à froid.
  - [ ] **Coller `20261025000001_motivation_reasons.sql`** dans le SQL Editor avant de publier ce client (runbook § 1 bis).
  - [ ] Tester la recherche de lieux réelle sur iPhone, Android et navigateur (Overpass injoignable depuis le cloud : 406 / délai / repli testés avec des réponses simulées).
  - [ ] Restant de l'audit : correction d'une dépense, saisie de date d'inventaire (AAAA-MM-JJ), séparateur décimal, pluriels « (s) », « Terminer ici » sans confirmation, réinitialisation du mot de passe, Segmented 40 px, statut de séance annoncé dans Programme.
  - [ ] Supprimer la photo temporaire du cache natif après analyse (aujourd'hui laissée au système ; `expo-file-system` non installé).

- [ ] **W-10 référence visuelle + analyse photo (D-045)**, branche `claude/w9-checkin-premium`, rien de fusionné :
  - [x] Tokens densité / bleu, primitives `Tabs` `Segmented` `RadioList` `FeelingScale` ; Nutrition, Aujourd'hui, Programme, Séance, Remplacement, Résumé, Progrès, Bilan de la semaine, Profil repris.
  - [x] Registre `exercise.id → média validé` (vide) + `ExerciseMedia` ; spécification `docs/MEDIA.md`.
  - [x] Analyse photo : domaine (vision → ids + grammes, calcul Ciqual), Edge Function `analyze-meal`, provider, écran, composition à la main, table `logged_meals` synchronisée.
  - [x] Adaptateur OpenAI (Responses API, `store: false`, sortie structurée sans nutriments) à côté d'Anthropic, choisi par `MEAL_VISION_PROVIDER` (D-045 addendum 2026-10-18) ; repli manuel testé de bout en bout.
  - [ ] **Validation humaine** : choisir le fournisseur de vision (OpenAI `gpt-6-luna` conseillé, ou Anthropic) + contrat de traitement des données, poser `MEAL_VISION_PROVIDER` / `MEAL_VISION_MODEL` / `OPENAI_API_KEY` ou `ANTHROPIC_API_KEY`, déployer `analyze-meal`, valider le premier appel réel, appliquer `20261017000001_logged_meals.sql` avant la version de l'app qui l'utilise.
  - [x] Lot média 01 intégré : 9 exercices + `chicken_rice_broccoli` ; 5 photos de recettes disponibles mais non liées (plats absents du catalogue), `docs/MEDIA.md`.
  - [ ] Produire et relire les 27 médias d'exercice et les 22 photos de recettes restants (liste exacte dans `docs/MEDIA.md`).
  - [ ] Avant publication : remplacer les 8 recadrages d'exercice ~280 × 500 px par des originaux haute définition (paysage ≥ 1600 × 1200) ; confirmer la photo de `chicken_rice_broccoli` (filet entier vs « poulet émincé » de la recette).
  - [ ] Décider produit : créer (ou non) les recettes des photos non liées (smoothie bowl, pennes boulettes, œufs brouillés épinards, pancakes, saumon quinoa) — recette d'abord, photo ensuite.
  - [ ] Quota partagé pour `analyze-meal` avant lancement public (aujourd'hui par instance).
  - [ ] Élargir le catalogue Ciqual (36 aliments) : beaucoup de plats photographiés resteront « non reconnus ».
  - [ ] Tester caméra / galerie / redimensionnement sur iPhone et Android réels (testé sur le web et en Jest seulement) ; mentions caméra et photothèque App Store / Play.
  - [x] Mode sombre relu écran par écran (2026-10-17) : vignettes dessinées, boutons désactivés ; captures sombres iPhone 15 / SE.
  - [x] Validation release (2026-10-17) : course corrigée dans l'E2E « première visite », `analyze-meal` non déployée (404) traitée comme indisponible → composition à la main, procédure de déploiement dans `docs/MEAL_PHOTO_ANALYSIS.md`, checklist **`docs/RELEASE_CHECKLIST.md`** (migrations, fonctions, secrets, médias/licences, iOS/Android réels, VoiceOver/TalkBack).
  - [ ] Archiver la preuve écrite des droits des lots médias 01 (le `credit` dit « validé par Souhayb », pas une licence).
- [ ] **W-9 premium UI (D-044)** : passes 1–3, 3.1, 3.2 (Aujourd'hui validé) et 4–9 faites (Séance, Programme, Nutrition, Progrès, Bilan, Historique, Profil / Réglages / Confidentialité). Reste : états (chargement / vide / erreur / hors ligne) écran par écran, motion et accessibilité, web / Android, puis revue-w9-premium-ui.md (22 points). Pas de fusion sans son accord.
- [ ] W-9 : haptique légère quand une infrastructure existe ; l'onglet Explorer et ses chaînes ont été retirés (les lieux restent dans Réglages).
- [x] W-9 : brancher de vrais médias d'exercice (lot 01, registre `src/features/training/exerciseMedia.ts`). Le héros d'Aujourd'hui garde son visuel dessiné : il représente la séance, pas un exercice (D-045, addendum lot 01).

- [ ] **M-01 / M-19** : relancer `npm run test:live` (corrigé pour Jest) pour valider RLS et sync sur le projet réel. Migrations appliquées, `delete-account` déployée, connexion validée par curl (2026-10-01).
- [ ] Tester la suppression de compte sur le projet réel (fonction déployée le 2026-10-01).
- [ ] E2E avec un vrai compte (inscription → sync → second appareil) une fois le réseau vers Supabase disponible.
- [ ] Notifications sur le web (Web Push) : non supporté pour l'instant, l'écran le dit.
- [ ] Tester le calendrier sur un iPhone et un Android réels (permission, création du calendrier « Project You », déconnexion).
- [ ] Tester la recherche de lieux sur appareil (Overpass n'est pas joignable depuis l'environnement cloud : testé avec des réponses simulées).
- [ ] **P2-03 santé** : dérouler `docs/MOBILE_HEALTH_TEST_PLAN.md` sur un iPhone et un Android réels (build de développement). Rien n'a été testé sur appareil.
- [ ] Avant publication Play : page de politique de confidentialité affichée par l'intent Health Connect, déclaration « Health apps » ; App Store : capability HealthKit sur l'App ID, fiche App Privacy.
- [ ] **D-019** : choisir le fournisseur de lieux de production (Overpass auto-hébergé ou service sous contrat) ; l'instance publique est limitée à ~100 requêtes/jour pour une app.
- [ ] Manifeste Android : `READ/WRITE_EXTERNAL_STORAGE` (≤ API 32) et `SYSTEM_ALERT_WINDOW` viennent du template Expo ; vérifier s'ils sont utiles et les bloquer sinon (`android.blockedPermissions`).
- [ ] Parcs et activités (SportsProvider) ; prix et promotions réels (aucune source choisie).

## Workout Coach Engine (D-030, D-031, phase 5)

Audit et architecture : `docs/WORKOUT_ENGINE.md`, `docs/TRAINING_ARCHITECTURE.md`. Architecture validée le 2026-10-02. **Chaque étape attend la validation de Souhayb.**

- [x] Audit et architecture (2026-10-01), décisions validées (2026-10-02, D-031)
- [x] W-1 Modèle de données : migration `20261002000001_workout_coach_foundation.sql`, RLS, `training/program.ts`, tests (2026-10-02)
- [x] W-2 Stockage local v4, figer la semaine, sync des nouvelles tables, appel de `attach_reconstructed_training_history()`, conflit de deux versions publiées hors connexion (D-032, revue `revue-w2-workout-coach.md`)
  - [ ] Appliquer la migration W-1 sur Supabase avant toute version de l'app contenant W-2 ; mettre à jour tous les appareils (une ancienne version ignore les séances `superseded`)
  - [x] W-6 : jours passés de la semaine lus depuis les prescriptions (Programme et adhérence) ; une semaine sans prescription garde le planning reconstruit (D-038)
  - [x] « Ton bilan » (`review.tsx`) lit la semaine passée depuis ses prescriptions (`plannedSessionDates`, W-7)
  - [ ] Purger les prescriptions anciennes du stockage local (aucun élagage aujourd'hui)
  - [x] W-4 : fatigue du jour branchée (séance du jour re-prescrite, `gateProgression`)
  - [x] D-033 vérité historique : une séance utilisée garde sa prescription malgré un conflit ; version perdante mais utilisée archivée ; collision `date#index` résolue (ligne prévue `superseded`, deux séances réelles gardées)
  - [x] Deux séances réelles pour un même créneau : la seconde s'affiche comme « séance supplémentaire » (Programme et historique, W-6)
- [x] W-3 Séance réelle (D-034, revue `revue-w3-workout-coach.md`, en attente de validation) : écran de séance, saisie répétitions / secondes, correction, minuteur, remplacement avec raison, exercice non fait, fin et résumé ; bugs corrigés (fatigue codée en dur, durée courte 20 → 15)
  - [ ] Appliquer la migration `20261006000001_workout_session.sql` sur Supabase avant toute version de l'app contenant W-3
  - [ ] Faire relire la correspondance ressenti → RPE (Facile 6, Correct 8, Très difficile 10)
  - [ ] Séance hors programme : pas de `started_at`, durée « Donnée indisponible » dans le résumé
  - [x] `keptExercises` (« le garder ») est local, non synchronisé → W-5 : décision `declined` synchronisée (D-037)
  - [ ] Tester l'écran de séance sur appareil réel (iOS, Android) : clavier numérique, minuteur en arrière-plan
- [x] W-4 Progression Engine v2 (D-035, `docs/TRAINING_PROGRESSION.md`, revue `revue-w4-workout-coach.md`, validé le 2026-10-06)
  - [ ] Appliquer la migration `20261006000002_progression_v2.sql` sur Supabase avant toute version de l'app contenant W-4
  - [ ] Faire relire les seuils `PROGRESSION` et `PERFORMANCE_DOWN_EXERCISES` (fenêtre 42 j, 2 confirmations, 2 séances sous la plage sur 3, stagnation 4 séances / 21 j / 70 %, tendance 3 séances, +5 s pour un maintien)
  - [x] Décidé (D-036) : micro-progression automatique, changement de programme accepté explicitement
  - [x] `compare.ts` (statuts prévu / fait par exercice) livré en W-6 (D-038)
  - [x] `reduce_volume` / `regress` : livrés en W-5 comme propositions (volume réduit, variante plus facile du catalogue)
  - [ ] Le bilan du jour rempli après l'ouverture d'une séance ne la re-prescrit plus (préremplissage « garder la charge » seulement)
- [x] W-5 Adaptations structurelles (D-037, `docs/TRAINING_STRUCTURE.md`, revue `revue-w5-workout-coach.md`, en attente de validation)
  - [ ] Appliquer la migration `20261006000003_structural_adaptations.sql` sur Supabase (après W-1, W-3, W-4) avant toute version de l'app contenant W-5 ; mettre à jour tous les appareils (une version d'avant W-5 réécrivait une décision pour « revenir », le serveur le refuse désormais)
  - [ ] Faire relire les seuils `STRUCTURE` (`docs/TRAINING_STRUCTURE.md` §13) : reprise après 14 j, volume −1 série / min 2 / 14 j, variante 2 séances, semaine allégée 7 j, plateau 35 j, refus 28 j, pas maintenant 7 j, fatigue 3 j / 2 séances complètes
  - [ ] Faire relire les relations `EASIER_VARIANTS` du catalogue (22 entrées)
  - [ ] Une portée « séances » terminée tôt bloque la reproposition jusqu'à son maximum + 14 j (prudent ; à revoir avec l'effet observé)
  - [x] W-6 : historique des adaptations (écran Historique), libellés des versions affichés (`program.reason.*`)
  - [ ] Apprentissage des règles à partir de l'effet observé : volontairement non fait (D-038) ; à rediscuter avec assez de données
- [x] W-6 Intégrations (D-038, revue `revue-w6-workout-coach.md`, en attente de validation) : prévu / fait, Programme, historique, Progress Journey, explications, séance hors programme un jour de repos ; aucune migration
  - [ ] Décider si « Très difficile » en fin de séance compte comme un jour de fatigue (proposition `TRAINING_ARCHITECTURE.md` §8, non appliquée)
  - [x] Ouvrir la bonne séance un jour à deux séances (W-7.1 : `?index=`, D-042)
  - [ ] Historique au-delà de 12 semaines (pagination)
- [x] W-7 Coach du jour longitudinal (D-039, `docs/DAILY_COACH.md` §13, revue `revue-w7-workout-coach.md`, en attente de validation) : une priorité par jour, question de cause fermée, mémoire confirmée et oubliable, cadence, suivi après adaptation, notifications alignées ; aucune migration
  - [ ] Faire relire les seuils `CADENCE` (`coach-memory.ts`) : 14 j, 2 occurrences, cause valable 14 j, pause 3 j, 2 affichages, « Pas maintenant » 7 j, habitude 2 fois / 6 semaines, suivi 7 j, recul 2 séances
  - [ ] Anti-repétition des lignes du coach par appareil (`coachShown`, 90 j) : la question est aussi bornée par le journal synchronisé, mais un suivi d'adaptation peut se montrer une fois par appareil
  - [x] Deux séances le même jour : chaque lien ouvre sa séance (W-7.1, D-042)
  - [ ] Autres habitudes possibles (jour de repos préféré, heure) : volontairement non apprises tant que la première n'est pas validée en usage réel
  - [ ] Table `coach_memory` héritée et inutilisée (documentée, D-042) : décider sa suppression (migration) ou un usage précis (coach IA), jamais deux sources
- [x] W-7.1 Consolidation fiabilité W-6 / W-7 (D-040, D-041, D-042, revue `revue-w7-1-workout-coach.md`, en attente de validation) : ordre multi-appareil par révision, couverture des effets, identité D-033 par contenu, remplacement annulé, deux séances, passé inconnu, matrice de contexte, adaptations empilées, confidentialité (repas, suppression partielle, listage photos)
  - [ ] Appliquer la migration `20261007000001_decision_revision.sql` sur Supabase (après W-1, W-3, W-4, W-5) avant toute version de l'app contenant W-7.1 ; mettre à jour tous les appareils
  - [ ] Redéployer l'Edge Function `delete-account` (`supabase functions deploy delete-account`) : listage paginé et récursif des photos
  - [ ] Unifier les deux définitions de « fatigue déclarée » (effets : check-in ≥ seuil d'adaptation ; progression : fatigue ≥ 4 ou énergie ≤ 2)
  - [ ] Faire relire les seuils `EFFECT_COVERAGE` (50 % des jours et 3 check-ins minimum, 2 séances prévues)
- [x] W-8 Complétude produit et Réglages (D-043, `docs/SETTINGS_ARCHITECTURE.md`, revue `revue-w8-product-completeness.md`, validé le 2026-10-07, âge 18+ appliqué) : voir la section « W-8 » ci-dessous
- [ ] Décider la suppression de `workout_plans` (jamais écrite) et de `workout_sessions.plan_id`, après vérification qu'elle est vide en production
- [ ] Appliquer la migration `20261002000001` sur le projet Supabase réel (SQL Editor) après fusion
- [ ] Faire relire les seuils de D-030 avec ceux de D-024 / D-026 / D-028

## W-8 — restes classés (D-043)

### Bloquant W-8 (avant fusion)
- [x] Migration `20261007000002_settings_contract.sql` appliquée sur le projet réel le 2026-10-07 (colonnes, index, bucket privé et quatre politiques vérifiés par Souhayb).

### Avant bêta publique
- [ ] Activer Leaked Password Protection (Authentication › Providers › Email, plan Pro et plus, ou Management API `password_hibp_enabled`).
- [x] Âge minimum 18+ appliqué (D-043, `SETTINGS_ARCHITECTURE.md` §11) ; vérifier en production s'il existe des comptes de 16–17 ans créés avant (ils gardent leurs protections).
- [ ] Chiffrer les données santé locales (`py.health.v1`) ou ne garder que des agrégats.
- [ ] Fournisseur de lieux de production (D-019) : Overpass public appelé directement depuis l'app.
- [ ] Faire relire les libellés de Réglages et de « Ce qui va changer » par de vrais utilisateurs.

### Natif (appareil réel)
- [ ] Dérouler `SETTINGS_ARCHITECTURE.md` §13 : permission notifications, heures calmes et pause, minuteur en arrière-plan, clavier, zones sûres, retour au premier plan, garde de sortie (`Alert`) sur iOS et Android.

### Redesign (phase premium, plus tard)
- [ ] Sélecteur d'heure natif à la place des champs HH:MM ; lignes de réglages et cartes au style final.
- [ ] Pas de charge en livres (aujourd'hui 2,5 kg ≈ 5,5 lb) : accepté provisoirement, **à faire avant une sortie publique internationale**.

### Post-lancement
- [ ] Longueurs en pouces (aujourd'hui cm seulement).
- [ ] Suppression d'une catégorie propagée aux autres appareils (D-042).
- [ ] Supprimer `coach_memory`, `notification_preferences`, `workout_plans` et `workout_sessions.plan_id` après vérification qu'elles sont vides en production (migration dédiée).

### Obsolète (fermé par W-8)
- [x] Politiques Storage `progress-photos` ; synchronisation de `notification_settings` ; catégorie « Calendrier » sans déclencheur ; « Ce que le coach retient » sans pourquoi ni confirmation.

## Daily Coach + Progress Journey (D-028)

Plan de la phase (ordre demandé) ; détail dans `docs/DAILY_COACH.md`, `docs/PROGRESS_JOURNEY.md`, `docs/ADAPTATION_ENGINE.md`, `docs/RETENTION.md`.

- [x] Audit et architecture (2026-10-01)
- [x] 1–10 : DailyPlan, Daily Coach, Progress Journey, Weekly Check-in + « Ton bilan », Adaptation Engine, notifications, écran Aujourd'hui, Mon évolution, E2E, revue finale (PR #4, 2026-10-01)
- [x] Migration `20261001000004_daily_coach.sql`
- [ ] E2E `low_logging` seul et application d'une proposition calorique : couverts en unitaires seulement (historique repas non semable de façon fiable)
- [ ] Mémoire du coach : écran de confirmation des suggestions (exercice refusé deux fois, recette non aimée/aimée) ; aujourd'hui calculées, pas encore affichées (W-7 a ajouté la carte « Ce que le coach retient » dans Réglages pour l'habitude « séance courte » seulement)
- [ ] Adhérence des semaines passées : les créneaux occupés du calendrier ne sont pas rejoués (seulement la semaine en cours)
- [ ] Chemin de « Mon évolution » : rendre chaque étape focalisable au lecteur d'écran sur le web (aujourd'hui un libellé sur un conteneur)
- [ ] Faire relire les seuils de D-028 (calibration, adhérence, ±150 kcal, plateau, score de risque) avec ceux de D-024/D-026
- [ ] Photos de progression : section masquée tant que les politiques Storage n'existent pas (voir Sécurité)
- [ ] `coach_memory` : option A retenue en W-8 (D-043) ; suppression post-lancement si vide en production

## Transformation Journey (D-024)

- [x] Synchroniser `notification_settings` (W-8, D-043).
- [ ] Synchroniser `notification_history`, puis `daily_checkins`.
- [ ] Étapes J-2 à J-7 de `docs/TRANSFORMATION_JOURNEY.md` : reprises par la phase D-028 ci-dessus.
- [ ] Faire relire les seuils de la règle de sécurité et les fourchettes de rythme par un professionnel de santé avant la bêta publique.
- [ ] Règle 7 : retirer l'« énergie active » estimée de l'écran Santé (`HealthCard`, PR #1).
- [x] Détection `low_intake` : la semaine précédente est gardée sur l'appareil (D-026).
- [ ] Synchroniser le statut « pas mangé » (`skipped`) : la sync n'envoie que les repas mangés (D-026).
- [ ] Faire relire les nouveaux seuils de D-026 (non-journalisation, pesées rares, fréquence seule) avec ceux de D-024.
- [ ] Tester les notifications sur un iPhone et un Android réels (ouverture → historique, heures calmes, pause).

## Données

- [ ] Ajouter des protéines végétales sans soja ni gluten (lentilles corail, pois cassés, haricots blancs… si présents dans Ciqual) et des petits-déjeuners compatibles : végan + allergie au soja n'a aujourd'hui aucun petit-déjeuner (expliqué à l'utilisateur depuis D-021, mais pas résolu).
- [ ] Dictionnaire des exclusions (D-021) : l'enrichir à partir des saisies « non reconnu » (sans collecter de données de santé).

- [x] **P2-01** Import Ciqual 2025 (ANSES) fait le 2026-10-01 (D-020) : 36 aliments, aucun MOCK, tests de cohérence verts.
- [ ] Comparer l'empreinte SHA-256 de `data/ciqual/` à un téléchargement direct sur https://ciqual.anses.fr (impossible depuis l'environnement cloud).
- [ ] Recettes véganes plus riches en protéines : la cible élevée (perte de poids vegan) passe avec peu de marge.
- [ ] Recettes adaptées : le nom reste celui de la recette d'origine (« Bol bœuf… » proposé à un profil vegan avec la mention de substitution). Prévoir des variantes nommées.
- [ ] Recherche d'aliments libre : embarquer plus d'aliments Ciqual (ou une table `foods` côté serveur) quand la fonctionnalité arrive.
- [ ] Recalibrer l'estimation énergétique avec la tendance de poids réelle (après 2–3 semaines de pesées).

## Sécurité / qualité

- [ ] Remplacer le harness `supabase/tests` par `supabase test db` (pgTAP) quand Docker est disponible.
- [ ] Rate limiting des Edge Functions (IA, suppression de compte).
- [x] Bucket privé et politiques Storage `progress-photos` (W-8, testés en base locale).
- [ ] Vérifier le nettoyage Storage de `delete-account` sur le vrai projet (pagination et échec sur erreur de listage faits en W-7.1, non vérifiés en réel).
- [ ] Identifiants de `goals` et des repas dérivés du `user_id` : passer la clé de conflit à `(user_id, id)` ou ajouter un sel aléatoire.
- [ ] Découper `src/features/onboarding/StepContent.tsx` (449 lignes).
- [ ] Placeholders de dates/heures codés en dur dans l'onboarding : passer par i18n.
- [ ] Vérifier `npm audit` (14 vulnérabilités « moderate » transitives au scaffold, outils de build Expo).

## Produit

- [ ] Le budget n'influence pas encore le choix des recettes faute de prix réels (PriceProvider ou saisie utilisateur).
- [ ] Onboarding : l'année de naissance se saisit au clavier ; envisager un sélecteur.
- [ ] Identifiants store `app.projectyou` provisoires : à remplacer par le domaine définitif.

- [ ] Questions d'onboarding : vérifier les formulations avec de vrais utilisateurs (tests d'utilisabilité).
- [ ] Icône, splash et nom définitifs (actuellement ceux du template Expo).
