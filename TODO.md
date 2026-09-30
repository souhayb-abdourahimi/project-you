# TODO

Tâches importantes à ne pas perdre entre deux sessions. Référence des IDs : `docs/ROADMAP.md`. Tenir à jour à chaque fin de session.

## En cours / prochaine étape

- [ ] **M-01** Auth : écran d'inscription/connexion branché sur Supabase ; tester contre un vrai projet Supabase (URL + clé anon à fournir dans `.env`).
- [ ] **M-19** Sync : service qui vide l'outbox vers Supabase + pull incrémental ; les stores écrivent déjà dans l'outbox.
- [ ] **M-18** Notifications locales (expo-notifications) par catégorie, plafond quotidien.
- [ ] **M-20** Privacy Center : export JSON, Edge Function `delete-account` (service role, supprime Storage puis `auth.users`).
- [ ] **M-22** E2E Playwright (web) du parcours complet.

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
