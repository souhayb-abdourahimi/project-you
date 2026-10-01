# Audit du dépôt

Dernière mise à jour : 2026-10-01. Branche `claude/foundation-mvp-k0binv`, PR #1 (brouillon, vers `main`). Audit fait avant les corrections de la session « Continuation » ; la colonne **Après** indique ce qui a été corrigé depuis.

Légende : **DONE** (fonctionne et testé) · **PARTIAL** · **BROKEN** · **MISSING** · **MOCK** (données de démonstration) · **PROD READY** · **NEEDS REVIEW**.

## Synthèse

- Base saine : architecture en couches respectée (`app → features → components/state/services/providers → domain`), moteurs purs testés, RLS sur toutes les tables, CI verte.
- Rien n'est **PROD READY** : catalogue d'aliments MOCK, connexion Supabase réelle jamais exécutée (le réseau de l'environnement cloud bloque `*.supabase.co`).
- Défauts réels trouvés et corrigés : plan repas sous la cible protéique (vegan et perte de gras), synchronisation qui n'envoyait que 4 types de données et ne tirait rien, clés étrangères qui auraient fait échouer toute synchronisation, plan repas non régénéré après un changement de régime ou d'allergie, date d'objectif affichée au jour près.

## Détail

| Domaine | Élément | Avant | Après | Notes |
|---|---|---|---|---|
| Outillage | Expo SDK 57, Expo Router, RN Web, TS strict | DONE | DONE | `npm run check` vert |
| Outillage | ESLint (domaine sans React/Expo/Supabase), Prettier, Jest | DONE | DONE | |
| Outillage | Dépendances | NEEDS REVIEW | NEEDS REVIEW | 14 vulnérabilités « moderate » transitives (outils de build Expo), aucune en production directe ; `pg` ajouté en dev pour les tests d'intégration |
| CI | lint, typecheck, tests, export web, migrations + RLS | DONE | DONE | + tests d'intégration de la synchronisation sur Postgres |
| Navigation | Onglets natifs + barre latérale web ≥ 1024 px | BROKEN | DONE | la barre latérale alignait les onglets en ligne : seul « Aujourd’hui » était cliquable sur grand écran (trouvé par l'E2E, corrigé) |
| Navigation | Protection des routes | PARTIAL | DONE | redirection connexion/onboarding ; attente du premier pull sur un nouvel appareil |
| Auth | Inscription, connexion, déconnexion (UI + service) | PARTIAL | PARTIAL | connexion au projet réel validée manuellement par Souhayb (requêtes curl avec la clé publishable et un compte de test, 2026-10-01) ; `npm run test:live` échouait sous Jest (fetch d'Expo), corrigé, à relancer pour valider RLS et sync automatiquement |
| Auth | Session persistante / rafraîchissement | PARTIAL | PARTIAL | AsyncStorage + rafraîchissement limité au premier plan (recommandation Supabase RN) ; test live écrit |
| Auth | Clé client | PARTIAL | DONE | clé publishable (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), clés `sb_secret_`/`service_role` refusées au démarrage |
| Base | Schéma v1 + RLS | DONE | DONE | |
| Base | FK vers catalogues non peuplés | BROKEN | DONE | migration `20261001000001` (D-014) |
| Base | Rattachement à la séance/au plan d'un autre utilisateur | NEEDS REVIEW | DONE | politiques restrictives |
| Base | Tests RLS | PARTIAL (5 tables) | DONE | toutes les tables à `user_id`, découvertes automatiquement ; validés par injection de failles |
| Base | Migrations appliquées au projet Supabase réel | MISSING | DONE | appliquées par Souhayb le 2026-10-01 (SQL Editor) ; Edge Function `delete-account` déployée |
| Sync | Envoi | PARTIAL (inventaire, poids, taille, dépenses) | DONE | + profil, objectif, motivation, préférences, séances, séries, repas consommés |
| Sync | Réception (pull) | MISSING | DONE | nouvel appareil restauré ; testé contre le vrai schéma |
| Sync | Données d'un autre compte sur l'appareil | MISSING | DONE | effacées avant synchronisation ; déconnexion = effacement local |
| Onboarding | Parcours adaptatif, brouillon local | DONE | DONE | |
| Objectif | Contrôle de réalisme | DONE | DONE | date présentée au mois, comme estimation et non comme promesse |
| Nutrition | Moteur (Mifflin-St Jeor, planchers) | DONE | DONE | |
| Nutrition | Plan repas : contraintes dures | DONE | DONE | |
| Nutrition | Plan repas : cible protéique | BROKEN | DONE | D-013, 30 tests de régression |
| Nutrition | Régénération après changement de profil | BROKEN | DONE | `mealPlanKey` |
| Nutrition | Catalogue aliments / recettes | MOCK | MOCK | badge MOCK ; CIQUAL requis avant bêta (P2-01) |
| Nutrition | Budget | PARTIAL | PARTIAL | suivi prévu/dépensé OK ; aucun prix réel, donc pas d'influence sur les recettes |
| Courses | Liste = plan − inventaire, sans prix inventé | DONE | DONE | |
| Entraînement | WorkoutEngine, remplacement, progression prudente, séance guidée | DONE | DONE | historique synchronisé désormais |
| Planning | Créneaux manuels | DONE | DONE | + heures occupées du calendrier de l'appareil (P2-04, D-016), non testé sur appareil réel |
| Progrès | Poids, moyenne mobile, tour de taille | DONE | DONE | autres mensurations, photos : MISSING |
| Motivation | Messages personnels, anti-abandon, modes 15 min / Pas envie | DONE | DONE | à étendre (marche, mobilité, repas express) |
| Bilan hebdo | Weekly review | MISSING | DONE | calculé uniquement depuis les données saisies ; séance courte = victoire ; données absentes nommées comme absentes |
| Notifications | Moteur + préférences | MISSING | PARTIAL | opt-in, heures calmes, plafond quotidien, écart minimal ; mobile uniquement (web : non supporté, affiché) ; non testé sur appareil réel |
| Privacy Center | Export, suppression | MISSING | PARTIAL | export JSON et suppression par catégorie testés (unitaires + E2E local) ; suppression de compte via Edge Function testée en unitaire, **non déployée** sur le projet réel |
| Providers | Interfaces (prix, promos, magasins, lieux, salles, calendrier, santé, IA) | DONE | DONE | branchés : calendrier, position, salles et magasins (OSM) ; prix, promos, santé, IA : MISSING |
| IA | Schémas de sortie Zod | PARTIAL | PARTIAL | coach non branché |
| E2E | Parcours web Playwright | MISSING | DONE (mode local) | 22 tests, mobile + desktop, en CI ; parcours avec compte réel non couvert |
| Accessibilité | Rôles, labels, cibles 44 px, contraste testé | DONE | NEEDS REVIEW | revue complète en M-23 |
| Sécurité | Secrets | DONE | DONE | `.env*` ignorés (`.env.local` présent localement, non commité) ; seule la clé publishable côté client |
| Docs | CLAUDE.md, docs/*, règles | DONE | DONE | mises à jour à chaque étape |

## Git et PR

- Historique linéaire, commits conventionnels ; `main` créée depuis le commit initial pour servir de base à la PR #1.
- La PR #1 reste le bon véhicule (brouillon, non fusionnée, CI verte) : on continue dessus plutôt que d'ouvrir une nouvelle PR. Pas de fusion automatique.

## Validation réelle (2026-10-01)

Souhayb a appliqué les deux migrations, déployé `delete-account` et vérifié la communication avec le projet par des requêtes curl (clé publishable + compte de test) : **connexion validée manuellement**. `npm run test:live` échouait à la connexion avec `AuthUnknownError: "undefined" is not valid JSON` : le preset jest-expo remplace `fetch` par celui d'Expo, inutilisable hors application. Les tests live tournent maintenant dans Node pur (`jest.live.config.js`) ; problème reproduit puis corrigé contre un faux serveur local. Il reste à relancer `npm run test:live` pour valider automatiquement l'isolation RLS et la synchronisation sur le projet réel.

## Ce qui restait à faire pour la validation réelle (fait, sauf la relance de `test:live`)

1. Accès réseau à `krcqdrrfnvfpvczxwrmt.supabase.co` depuis l'environnement d'exécution (ou exécution de `npm run test:live` depuis un poste qui y a accès).
2. Migrations à appliquer sur le projet Supabase (SQL Editor) : `20260930000001_core.sql` puis `20261001000001_sync_hardening.sql`.
3. Deux comptes de test confirmés pour `npm run test:live`.
4. Déploiement de l'Edge Function `delete-account` pour la suppression de compte.

## Revue critique (M-23, 2026-10-01)

Deux revues indépendantes (sécurité/vie privée ; sync/état/UX), chaque constat vérifié dans le code.

**Corrigé**

| Gravité | Problème | Correction |
|---|---|---|
| Élevée | Une synchronisation en cours pendant une déconnexion ou un changement de compte pouvait écrire les données du compte A dans celles du compte B | écritures liées au compte et à la session de synchronisation |
| Élevée | Le propriétaire des données locales était lu avant leur chargement depuis le stockage | attente de l'hydratation avant toute décision |
| Élevée | Une erreur inattendue bloquait la synchronisation jusqu'au redémarrage | try/finally, état « erreur » |
| Moyenne | Pull et export limités silencieusement à 1000 lignes par table | pagination complète (`src/services/paging.ts`) |
| Moyenne | Lignes distantes non validées (NaN, valeurs inconnues) | schémas Zod par table, lignes invalides rejetées |
| Moyenne | Première synchro hors ligne : le profil local pouvait écraser celui du compte | le compte reste prioritaire tant qu'aucun échange n'a abouti |
| Moyenne | Après déconnexion, les rappels programmés affichaient encore la motivation de l'utilisateur | déconnexion et réinitialisation annulent les rappels et leurs préférences |
| Moyenne | Bilan hebdo : les séances à venir comptées comme manquées (culpabilisant) ; tendance de poids toujours « réussie » | seuls les jours passés comptent ; tendance listée seulement si elle va dans le sens de l'objectif |
| Moyenne | Repas cochés perdus si le nombre de repas par jour change | rapprochement par jour et créneau |
| Moyenne | Rappels annulés et reprogrammés toutes les 30 s, appels concurrents | file unique, plan inchangé ignoré |
| Basse | Rappel de séance déplacé par les heures calmes après le début de la séance | rappel supprimé |
| Basse | Recettes personnelles (`owner_id`) sans test RLS, tables serveur absentes de l'export | test RLS dédié, export complété |
| Basse (desktop) | Barre latérale : seul le premier onglet cliquable | trouvé par l'E2E, corrigé |

**Vérifié sans problème** : RLS et politiques sur toutes les tables, anon sans privilège, `set_updated_at` sans SECURITY DEFINER, cascade de suppression, Edge Function `delete-account` (identité tirée du jeton uniquement, erreurs génériques), aucune clé secrète dans le client ni dans le dépôt, aucun `console.*` dans `src`, heures calmes qui passent minuit, plafond et écart des rappels, aucun mot moralisateur.

**Restant (non bloquant, dans `TODO.md`)** : bucket photos et ses politiques (avant la fonction photo), pagination de la liste de photos dans `delete-account`, identifiants prévisibles pour `goals`/repas (clé de conflit à revoir), `StepContent.tsx` à découper (449 lignes), migration v1 → v2 du stockage local qui abandonne l'ancienne file d'envoi (aucune version publiée n'est concernée).

## Revue sécurité et confidentialité — phase 2 santé (2026-10-01)

Ce qui a été vérifié :

- **Permissions minimales** :
  - Android : 4 lectures seulement. Le manifeste a été généré par `expo prebuild` et relu : aucune permission `WRITE_*`, `BACKGROUND` ni `HISTORY`.
  - iOS : entitlement HealthKit sans dossiers cliniques ni background delivery. Aucune écriture demandée (`toShare` absent, vérifié par un test).
- **Isolation du natif** : le code HealthKit / Health Connect vit dans `src/providers/health.*` uniquement. Le web n'embarque aucun module santé ; l'export web a été vérifié.
- **Aucune donnée santé** vers :
  - Supabase : aucune table nouvelle, donc RLS inchangée ;
  - l'IA ;
  - les journaux : aucun `console.*` ; les erreurs natives deviennent une erreur générique sans message ;
  - les statistiques.
- **Validation** : chaque valeur native passe par Zod et par des bornes. Une valeur invalide est rejetée, jamais corrigée.
- **Retrait d'accès** : un accès retiré dans les réglages purge le type concerné. La déconnexion purge tout. La déconnexion du compte efface le lien et les valeurs. L'export inclut les valeurs importées.
- **Pas de double comptage** : un entraînement importé qui correspond à une séance Project You n'est pas recompté. Une pesée manuelle l'emporte sur une pesée importée.

Limites connues :

- Rien n'a été testé sur un iPhone ou un Android réels (`docs/MOBILE_HEALTH_TEST_PLAN.md`).
- Le stockage local (AsyncStorage) n'est pas chiffré. C'est la même chose que pour les pesées manuelles, et il est protégé par le bac à sable de l'app. À reconsidérer si des données plus sensibles arrivent.
- La révocation Health Connect ne prend effet qu'au redémarrage de l'app (limite de la plateforme, expliquée à l'écran).
