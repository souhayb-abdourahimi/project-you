# Confidentialité

Project You est un outil de fitness et bien-être ; il ne remplace pas un professionnel de santé.

## Minimisation

- Âge stocké en **année de naissance** (suffit au calcul).
- Sexe facultatif (« préfère ne pas dire » → calcul moyen, précision moindre signalée).
- Données santé (HealthKit / Health Connect) lues seulement si utiles et autorisées, catégorie par catégorie.
- Réponses de motivation : privées, utilisées pour les messages de motivation uniquement.
- Photos : facultatives, bucket privé, jamais envoyées à un modèle externe sans action explicite.

## Privacy Center (M-20, écran `/privacy`)

- **Voir** ce qui est stocké, par catégorie (profil, motivation, pesées, mensurations, inventaire, dépenses, séances, repas consommés).
- **Exporter** : fichier JSON avec les données de l'appareil **et** celles du compte (toutes les tables, RLS) ; les tables illisibles sont listées dans `unavailable` au lieu d'apparaître vides.
- **Supprimer une catégorie** : suppression **définitive** côté serveur (DELETE, pas de suppression logique) puis sur l'appareil ; si le serveur est injoignable, rien n'est supprimé (pas d'état à moitié effacé). Limite connue : un autre appareil connecté garde sa copie locale jusqu'à sa déconnexion.
- **Supprimer le compte** : Edge Function `delete-account` (JWT de l'appelant, jamais d'identifiant venant du corps de la requête) → photos du bucket `progress-photos/<user_id>/` → `auth.users` (cascade sur toutes les tables, testée dans `rls.sql`). Puis effacement local et annulation des rappels.
- **Connexions** calendrier / santé : affichées « Non connecté » tant que les intégrations n'existent pas.
- **Autorisations** : lien vers les réglages de l'appareil ; **notifications** : écran `/notifications`.
- Toute action destructive passe par une confirmation explicite (`ConfirmButton`).
- Suppressions courantes (une pesée, un article d'inventaire) : suppression logique pour la synchronisation multi-appareil. TODO : purge serveur des lignes `deleted_at` anciennes.

## Calendrier et position (phase 2)

- **Calendrier** : seules les heures de début et de fin des événements sont lues (ni titre, ni lieu, ni invités), et gardées sur l'appareil pour la semaine en cours. L'app écrit uniquement dans son propre calendrier « Project You ». Déconnexion (écran Calendrier ou Privacy Center) = suppression de ce calendrier et oubli des heures lues. Inclus dans l'export (`deviceSettings.calendar`) ; effacé à la déconnexion du compte.
- **Position** : demandée seulement quand l'utilisateur lance une recherche de lieux, arrondie à ~100 m avant l'envoi à OpenStreetMap, jamais enregistrée, synchronisée ni journalisée. Refus = l'app reste utilisable (salle saisie à la main).

## Consentements

Chaque permission (notifications, caméra, calendrier, santé, localisation) est demandée **au moment où elle sert**, avec une explication, et peut être retirée. Refuser ne bloque jamais l'usage de base.

## Analytics

Événements minimisés et pseudonymisés (`onboarding_started`, `workout_completed`, `weight_logged`…), **sans** valeur de poids, mesure, photo, texte libre ni donnée santé brute. Désactivables.

## Stores

Avant publication : déclarations App Store (Privacy Nutrition Labels, HealthKit) et Google Play (Data safety, Health Connect) à vérifier selon les règles en vigueur ; suppression de compte accessible dans l'app.
