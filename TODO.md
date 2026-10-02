# TODO

Tâches importantes à ne pas perdre entre deux sessions. Référence des IDs : `docs/ROADMAP.md`. Tenir à jour à chaque fin de session.

## En cours / prochaine étape

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
  - [ ] W-6 : afficher les jours passés de la semaine depuis les prescriptions (aujourd'hui depuis le planning courant) ; `useJourney` recalcule encore les semaines passées avec `scheduleOfWeek`
  - [ ] Purger les prescriptions anciennes du stockage local (aucun élagage aujourd'hui)
  - [ ] W-4 : charge proposée calculée avec une fatigue « normale » ; brancher la fatigue du jour
  - [ ] Collision de clé (séance locale avec faits vs ligne serveur `planned` de même date#index) : la ligne serveur reste `planned`
- [ ] W-3 Séance (UI fonctionnelle) + **bugs confirmés** : fatigue codée en dur à « normal » dans `ExerciseCard` ; séance courte annoncée à 20 min qui exécute 15 min
- [ ] W-4 Comparaison prévu / fait + progression v2
- [ ] W-5 Règles d'adaptation d'entraînement, fin de cycle (accepter / refuser / reporter), question de confirmation des préférences (reprend « Mémoire du coach » ci-dessous)
- [ ] W-6 Intégrations (Daily Coach, Programme, Progress Journey, explications)
- [ ] W-7 E2E et revue critique
- [ ] Décider la suppression de `workout_plans` (jamais écrite) et de `workout_sessions.plan_id`, après vérification qu'elle est vide en production
- [ ] Appliquer la migration `20261002000001` sur le projet Supabase réel (SQL Editor) après fusion
- [ ] Faire relire les seuils de D-030 avec ceux de D-024 / D-026 / D-028

## Daily Coach + Progress Journey (D-028)

Plan de la phase (ordre demandé) ; détail dans `docs/DAILY_COACH.md`, `docs/PROGRESS_JOURNEY.md`, `docs/ADAPTATION_ENGINE.md`, `docs/RETENTION.md`.

- [x] Audit et architecture (2026-10-01)
- [x] 1–10 : DailyPlan, Daily Coach, Progress Journey, Weekly Check-in + « Ton bilan », Adaptation Engine, notifications, écran Aujourd'hui, Mon évolution, E2E, revue finale (PR #4, 2026-10-01)
- [x] Migration `20261001000004_daily_coach.sql`
- [ ] E2E `low_logging` seul et application d'une proposition calorique : couverts en unitaires seulement (historique repas non semable de façon fiable)
- [ ] Mémoire du coach : écran de confirmation des suggestions (exercice refusé deux fois, recette non aimée/aimée) ; aujourd'hui calculées, pas encore affichées
- [ ] Adhérence des semaines passées : les créneaux occupés du calendrier ne sont pas rejoués (seulement la semaine en cours)
- [ ] Chemin de « Mon évolution » : rendre chaque étape focalisable au lecteur d'écran sur le web (aujourd'hui un libellé sur un conteneur)
- [ ] Faire relire les seuils de D-028 (calibration, adhérence, ±150 kcal, plateau, score de risque) avec ceux de D-024/D-026
- [ ] Photos de progression : section masquée tant que les politiques Storage n'existent pas (voir Sécurité)
- [ ] `coach_memory` : réaffecter ou supprimer quand le coach IA arrive (D-028 : mémoire dérivée, rien à y stocker)

## Transformation Journey (D-024)

- [ ] Synchroniser `notification_settings` et `notification_history` (tables et RLS prêtes, l'app garde tout sur l'appareil pour l'instant), puis `daily_checkins`.
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
- [ ] Politiques Storage du bucket `progress-photos` (migration dédiée quand la fonctionnalité photo arrive) ; `delete-account` : paginer la liste des photos et échouer si elle ne peut pas être lue.
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
