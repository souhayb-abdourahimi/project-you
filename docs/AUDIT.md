# Audit du dépôt

Dernière mise à jour : 2026-10-01. Branche `claude/foundation-mvp-k0binv`, PR #1 (brouillon, vers `main`). Audit fait avant les corrections de la session « Continuation » ; la colonne **Après** indique ce qui a été corrigé depuis.

Légende : **DONE** (fonctionne et testé) · **PARTIAL** · **BROKEN** · **MISSING** · **MOCK** (données de démonstration) · **PROD READY** · **NEEDS REVIEW**.

## Synthèse

- Base saine : architecture en couches respectée (`app → features → components/state/services/providers → domain`), moteurs purs testés, RLS sur toutes les tables, CI verte.
- Rien n'est **PROD READY** : catalogue d'aliments MOCK, connexion Supabase réelle jamais exécutée (le réseau de l'environnement cloud bloque `*.supabase.co`), pas d'E2E.
- Défauts réels trouvés et corrigés : plan repas sous la cible protéique (vegan et perte de gras), synchronisation qui n'envoyait que 4 types de données et ne tirait rien, clés étrangères qui auraient fait échouer toute synchronisation, plan repas non régénéré après un changement de régime ou d'allergie, date d'objectif affichée au jour près.

## Détail

| Domaine | Élément | Avant | Après | Notes |
|---|---|---|---|---|
| Outillage | Expo SDK 57, Expo Router, RN Web, TS strict | DONE | DONE | `npm run check` vert |
| Outillage | ESLint (domaine sans React/Expo/Supabase), Prettier, Jest | DONE | DONE | |
| Outillage | Dépendances | NEEDS REVIEW | NEEDS REVIEW | 14 vulnérabilités « moderate » transitives (outils de build Expo), aucune en production directe ; `pg` ajouté en dev pour les tests d'intégration |
| CI | lint, typecheck, tests, export web, migrations + RLS | DONE | DONE | + tests d'intégration de la synchronisation sur Postgres |
| Navigation | Onglets natifs + barre latérale web ≥ 1024 px | DONE | DONE | |
| Navigation | Protection des routes | PARTIAL | DONE | redirection connexion/onboarding ; attente du premier pull sur un nouvel appareil |
| Auth | Inscription, connexion, déconnexion (UI + service) | PARTIAL | PARTIAL | code prêt, tests live écrits (`npm run test:live`), **non exécutés** faute d'accès réseau |
| Auth | Session persistante / rafraîchissement | PARTIAL | PARTIAL | AsyncStorage + rafraîchissement limité au premier plan (recommandation Supabase RN) ; test live écrit |
| Auth | Clé client | PARTIAL | DONE | clé publishable (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), clés `sb_secret_`/`service_role` refusées au démarrage |
| Base | Schéma v1 + RLS | DONE | DONE | |
| Base | FK vers catalogues non peuplés | BROKEN | DONE | migration `20261001000001` (D-014) |
| Base | Rattachement à la séance/au plan d'un autre utilisateur | NEEDS REVIEW | DONE | politiques restrictives |
| Base | Tests RLS | PARTIAL (5 tables) | DONE | toutes les tables à `user_id`, découvertes automatiquement ; validés par injection de failles |
| Base | Migrations appliquées au projet Supabase réel | MISSING | MISSING | à exécuter dans le SQL Editor (2 fichiers) |
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
| Planning | Créneaux manuels | DONE | DONE | calendrier réel : MISSING (P2-04) |
| Progrès | Poids, moyenne mobile, tour de taille | DONE | DONE | autres mensurations, photos : MISSING |
| Motivation | Messages personnels, anti-abandon, modes 15 min / Pas envie | DONE | DONE | à étendre (marche, mobilité, repas express) |
| Bilan hebdo | Weekly review | MISSING | MISSING | table prête |
| Notifications | Moteur + préférences | MISSING | MISSING | M-18 |
| Privacy Center | Export, suppression | MISSING | MISSING | M-20 |
| Providers | Interfaces (prix, promos, magasins, lieux, salles, calendrier, santé, IA) | DONE | DONE | implémentations réelles : MISSING (phase 2) |
| IA | Schémas de sortie Zod | PARTIAL | PARTIAL | coach non branché |
| E2E | Parcours web Playwright | MISSING | MISSING | M-22 ; smoke test manuel fait |
| Accessibilité | Rôles, labels, cibles 44 px, contraste testé | DONE | NEEDS REVIEW | revue complète en M-23 |
| Sécurité | Secrets | DONE | DONE | `.env*` ignorés (`.env.local` présent localement, non commité) ; seule la clé publishable côté client |
| Docs | CLAUDE.md, docs/*, règles | DONE | DONE | mises à jour à chaque étape |

## Git et PR

- Historique linéaire, commits conventionnels ; `main` créée depuis le commit initial pour servir de base à la PR #1.
- La PR #1 reste le bon véhicule (brouillon, non fusionnée, CI verte) : on continue dessus plutôt que d'ouvrir une nouvelle PR. Pas de fusion automatique.

## Ce qui bloque la validation réelle

1. Accès réseau à `krcqdrrfnvfpvczxwrmt.supabase.co` depuis l'environnement d'exécution (ou exécution de `npm run test:live` depuis un poste qui y a accès).
2. Migrations à appliquer sur le projet Supabase (SQL Editor) : `20260930000001_core.sql` puis `20261001000001_sync_hardening.sql`.
3. Deux comptes de test confirmés pour `npm run test:live`.
