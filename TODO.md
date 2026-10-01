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

## Données

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
