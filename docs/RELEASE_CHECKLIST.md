# Checklist release

Commandes et actions manuelles, dans l'ordre : `docs/RELEASE_RUNBOOK.md`.

À cocher avant chaque mise en production (bêta publique, puis v1). Une case non cochée = pas de release. Les valeurs secrètes ne s'écrivent jamais ici, ni dans le dépôt, ni dans le chat : seulement leurs **noms**.

Projet Supabase : `krcqdrrfnvfpvczxwrmt`. Les threads cloud n'atteignent pas ce projet : les étapes Supabase se font depuis un poste de confiance (CLI connectée) ou le tableau de bord.

## 1. Migrations

- [ ] Toutes les migrations de `supabase/migrations/` sont appliquées, dans l'ordre des noms. Déjà vérifié jusqu'à `20261007000002_settings_contract.sql` inclus.
- [ ] **À appliquer** : `20261017000001_logged_meals.sql` (table `logged_meals`, RLS propriétaire, index de sync, trigger `set_updated_at`, aucun droit `anon`).
  - Dans l'éditeur SQL (pas `supabase db push` : l'historique de la CLI ne connaît pas les migrations déjà collées, elle les rejouerait). Étapes exactes : `docs/RELEASE_RUNBOOK.md`.
  - Contrôle après coup : la table existe, `relrowsecurity = true`, les 4 policies `logged_meals_*_own` sont présentes, et `npm run test:db` est vert en local (couvert par `supabase/tests/rls.sql`).
- [ ] Advisors Supabase relus après application : sécurité et performance. Un index signalé « inutilisé » ne se supprime pas tant que la base est peu chargée.

## 2. Edge Functions

| Fonction | Déploiement | JWT | Contrôle |
|---|---|---|---|
| `delete-account` | `supabase functions deploy delete-account` | requis | version ACTIVE ; une suppression de compte de test supprime aussi ses photos |
| `analyze-meal` | `supabase functions deploy analyze-meal` | requis (défaut, ne pas passer `--no-verify-jwt`) | voir `docs/MEAL_PHOTO_ANALYSIS.md` § Déploiement |

- [ ] `analyze-meal` déployée **après** ses secrets (sinon elle répond 503 et l'app propose la composition à la main, ce qui est sans risque).
- [ ] Premier appel réel validé avec le fournisseur choisi (OpenAI `gpt-6-luna` ou Anthropic) : brouillon affiché, calories venant du catalogue Ciqual. Jamais testé contre l'API réelle depuis le développement.
- [ ] Clé refusée, modèle inconnu, délai : erreur avec « Réessayer » et « Composer mon repas à la main » (couvert par `mealAnalysisFallback.test.tsx`, à revoir une fois sur appareil).
- [ ] Sans la fonction (404) ou sans secrets (503), l'écran « Ajouter un repas » affiche « Analyse photo pas encore disponible » et « Composer mon repas à la main ». Rien ne casse.

## 3. Secrets (noms seulement)

| Où | Nom | Rôle |
|---|---|---|
| App (`.env.local`, jamais commité) | `EXPO_PUBLIC_SUPABASE_URL` | URL du projet |
| App | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (repli : `EXPO_PUBLIC_SUPABASE_ANON_KEY`) | clé publique, protégée par Auth + RLS |
| Edge Function `analyze-meal` | `MEAL_VISION_PROVIDER` | `openai` ou `anthropic` ; absent ou autre valeur = service indisponible |
| Edge Function `analyze-meal` | `MEAL_VISION_MODEL` | identifiant du modèle de vision (OpenAI : `gpt-6-luna` recommandé) |
| Edge Function `analyze-meal` | `OPENAI_API_KEY` | clé OpenAI, si `MEAL_VISION_PROVIDER=openai` |
| Edge Function `analyze-meal` | `ANTHROPIC_API_KEY` | clé Anthropic, si `MEAL_VISION_PROVIDER=anthropic` |
| Edge Functions (fournis par Supabase) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | injectés automatiquement, rien à définir |

- [ ] Posés avec `supabase secrets set --env-file <fichier hors du dépôt, supprimé ensuite>` (la clé ne passe pas par l'historique du shell) ; détail dans `docs/RELEASE_RUNBOOK.md`.
- [ ] Aucune autre clé dans le bundle : `npm run build:web`, puis `grep -rE 'sb_secret_[A-Za-z0-9]|sk-ant-[A-Za-z0-9]|sk-proj-[A-Za-z0-9]|sk-[A-Za-z0-9]{20}|eyJ[^"]*service_role' dist/` (aucun résultat attendu ; supabase-js contient le mot `sb_secret_` seul, pour refuser ces clés côté client).
- [ ] OpenAI : clé de projet dédiée, limite de dépense mensuelle posée côté OpenAI.
- [ ] Auth : **Leaked Password Protection** activée (Authentication → Policies). Elle est désactivée aujourd'hui.

## 4. Médias et licences

- [ ] Chaque média embarqué a un `credit`, un `reviewedOn` et un `alt` FR/EN (`docs/MEDIA.md`). Un test refuse un fichier sans entrée de registre.
- [ ] Lot exercices 01 (9 fichiers) et lot recettes 01 (1 fichier) : preuve écrite des droits (production propre ou licence commerciale) archivée hors dépôt. Le `credit` actuel dit « validé par Souhayb », ce qui n'est pas une licence.
- [ ] Les médias manquants (27 exercices, 22 recettes) gardent le visuel dessiné. Aucune photo web aléatoire.
- [ ] Données Ciqual 2025 : mention de la source (ANSES) visible dans l'app (`docs/DATA_SOURCES.md`).
- [ ] Fournisseur de vision : contrat de traitement des données signé (les photos de repas sont des données personnelles). OpenAI : `store: false` est envoyé, mais les journaux anti-abus restent jusqu'à 30 jours sans accord ZDR ; la politique de confidentialité de l'app doit nommer le fournisseur réellement utilisé.

## 5. Test iOS réel (build de développement ou TestFlight)

- [ ] Onboarding 18+ complet, compte créé, sync vers Supabase, déconnexion puis reconnexion sans perte.
- [ ] Séance complète : séries, remplacement, repos, fin. Hors ligne pendant la séance, puis retour en ligne.
- [ ] Repas par photo : permission caméra demandée au premier usage, texte de `app.json` affiché ; refus → galerie et composition à la main toujours possibles.
- [ ] Notifications : demande de permission, heures calmes respectées, ouverture sur le bon écran.
- [ ] Santé (HealthKit) selon `docs/MOBILE_HEALTH_TEST_PLAN.md` (les modules natifs ne sont testés qu'en mock).
- [ ] Mode sombre, petit écran (iPhone SE), Dynamic Type au maximum : rien n'est coupé.

## 6. Test Android réel

- [ ] Les mêmes parcours que sur iOS, avec Health Connect à la place de HealthKit.
- [ ] Bouton retour système sur chaque écran modal (séance, repas, check-in) : aucune saisie perdue sans confirmation.
- [ ] Taille de police système au maximum, mode sombre, écran 360 dp de large.

## 7. VoiceOver et TalkBack

- [ ] Aujourd'hui : le héros se lit dans l'ordre (action, durée, lieu, « Commencer »), l'anneau protéines donne la vraie valeur.
- [ ] Séance : chaque série annonce exercice, charge et répétitions ; le minuteur de repos est annoncé sans flood.
- [ ] Progrès : chaque chiffre se lit avec son libellé, la courbe de poids se lit en une phrase, les boutons « Détail » annoncent ouvert/fermé.
- [ ] Repas : le brouillon d'analyse annonce « estimation » et les aliments à confirmer.
- [ ] Toute cible tactile ≥ 44 × 44, focus visible au clavier sur le web.

## 8. Tests automatisés (sur la branche de release)

- [ ] `npm run check` (lint, typecheck, Jest).
- [ ] `npm run test:db` (migrations + RLS).
- [ ] `npm run build:web` puis `npm run test:e2e` (suite complète).
- [ ] CI GitHub verte sur le dernier commit.
- [ ] `npm run test:live` depuis un poste qui atteint Supabase, avec les 2 comptes de test.

## Bloquants connus hors de cette liste

Données santé stockées en local sans chiffrement (`py.health.v1`), API Overpass publique en production, pas de charge en kg sous affichage lb (avant une sortie internationale). Détail dans `TODO.md`.
