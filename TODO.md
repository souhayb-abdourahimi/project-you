# TODO

Tâches importantes à ne pas perdre entre deux sessions. Référence des IDs : `docs/ROADMAP.md`. Tenir à jour à chaque fin de session.

## En cours / prochaine étape

- [ ] **M-01 / M-19 validation réelle** : appliquer les 2 migrations sur le projet Supabase (SQL Editor), créer 2 comptes de test confirmés, lancer `npm run test:live` depuis un environnement qui atteint `*.supabase.co` (bloqué dans l'environnement cloud actuel).
- [ ] Déployer l'Edge Function `delete-account` (`supabase functions deploy delete-account`) et tester la suppression de compte sur le projet réel.
- [ ] E2E avec un vrai compte (inscription → sync → second appareil) une fois le réseau vers Supabase disponible.
- [ ] Notifications sur le web (Web Push) : non supporté pour l'instant, l'écran le dit.
- [ ] Phase 2 : calendrier (événements de l'app uniquement), HealthKit / Health Connect, lieux, magasins, prix réels.

## Données

- [ ] **P2-01** Importer CIQUAL (ANSES, licence Etalab) et retirer le catalogue MOCK avant toute bêta.
- [ ] Recalibrer l'estimation énergétique avec la tendance de poids réelle (après 2–3 semaines de pesées).

## Sécurité / qualité

- [ ] Remplacer le harness `supabase/tests` par `supabase test db` (pgTAP) quand Docker est disponible.
- [ ] Rate limiting des Edge Functions (IA, suppression de compte).
- [ ] Politiques Storage du bucket `progress-photos` (migration dédiée quand la fonctionnalité photo arrive).
- [ ] Vérifier `npm audit` (14 vulnérabilités « moderate » transitives au scaffold, outils de build Expo).

## Produit

- [ ] Le budget n'influence pas encore le choix des recettes faute de prix réels (PriceProvider ou saisie utilisateur).
- [ ] Onboarding : l'année de naissance se saisit au clavier ; envisager un sélecteur.
- [ ] Identifiants store `app.projectyou` provisoires : à remplacer par le domaine définitif.

- [ ] Questions d'onboarding : vérifier les formulations avec de vrais utilisateurs (tests d'utilisabilité).
- [ ] Icône, splash et nom définitifs (actuellement ceux du template Expo).
