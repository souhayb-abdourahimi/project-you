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
- **Supprimer une catégorie** : suppression **définitive** côté serveur (DELETE, pas de suppression logique), table par table (enfants d'abord), puis sur l'appareil. Résultat structuré (W-7.1, D-042) : `complete` → l'appareil est effacé, « Données supprimées. » ; `partial` (une table a échoué après d'autres) ou `failed` (aucune confirmée, hors ligne) → l'appareil garde ses données et ce qu'il sait déjà synchronisé (rien n'est renvoyé), le message dit que la suppression n'est pas terminée ; « Réessayer » recommence depuis la première table (sans risque). Jamais de succès annoncé à tort. « Repas » efface aussi les coches de la semaine précédente gardée pour le bilan. Limite connue : un autre appareil connecté garde sa copie locale jusqu'à sa déconnexion.
- **Supprimer le compte** : Edge Function `delete-account` (JWT de l'appelant, jamais d'identifiant venant du corps de la requête) → photos du bucket `progress-photos/<user_id>/` (listées page après page et dans les sous-dossiers ; une erreur de listage arrête tout, le compte est gardé) → `auth.users` (cascade sur toutes les tables, testée dans `rls.sql`). Puis effacement local et annulation des rappels ; l'écran ne quitte qu'en cas de succès. Limites (non réglées) : l'app n'envoie encore aucune photo ; le bucket et ses politiques Storage ne sont pas dans les migrations ; le nettoyage n'a pas été vérifié sur le vrai projet ; les photos sont supprimées avant le compte, donc un échec ensuite laisse un compte sans photos. La table `coach_memory` (héritée, inutilisée) est exportée et supprimée avec le compte.
- **Connexions** calendrier / santé : affichées « Non connecté » tant que les intégrations n'existent pas.
- **Autorisations** : lien vers les réglages de l'appareil ; **notifications** : écran `/notifications`.
- **Coach et notifications** (D-024) : l'historique des messages planifiés (identifiants de modèles, jamais le texte ni les mots de l'utilisateur) restent sur l'appareil, 90 entrées au plus ; ils figurent dans l'export (réglages de l'appareil) et sont effacés avec les données de l'appareil. Option « Citer mes mots » : désactivée, aucune réponse personnelle n'apparaît sur l'écran verrouillé.
- **Suivi du parcours** (D-028) : check-ins du jour et de la semaine, jalons, décisions d'adaptation, raisons choisies (repas, séances, remplacements d'exercice) sont synchronisés avec le compte (multi-appareil), visibles, exportables et supprimables par catégorie (« Suivi du parcours », « Repas cochés », « Séances »). Aucun texte libre ; la mémoire du coach est recalculée depuis ces données et jamais stockée ; aucune interprétation psychologique n'est enregistrée.
- Toute action destructive passe par une confirmation explicite (`ConfirmButton`).
- Suppressions courantes (une pesée, un article d'inventaire) : suppression logique pour la synchronisation multi-appareil. TODO : purge serveur des lignes `deleted_at` anciennes.

## Calendrier et position (phase 2)

- **Calendrier** : seules les heures de début et de fin des événements sont lues (ni titre, ni lieu, ni invités), et gardées sur l'appareil pour la semaine en cours. L'app écrit uniquement dans son propre calendrier « Project You ». Déconnexion (écran Calendrier ou Privacy Center) = suppression de ce calendrier et oubli des heures lues. Inclus dans l'export (`deviceSettings.calendar`) ; effacé à la déconnexion du compte.
- **Position** : demandée seulement quand l'utilisateur lance une recherche de lieux, arrondie à ~100 m avant l'envoi à OpenStreetMap, jamais enregistrée, synchronisée ni journalisée. Refus = l'app reste utilisable (salle saisie à la main).

## Santé et activité (phase 2, D-018)

- **Facultatif** : Apple Santé (iPhone) ou Health Connect (Android), jamais sur le web. Refuser ne retire l'accès à aucune autre fonction ; la saisie manuelle reste disponible partout.
- **Lu** : poids, pas, entraînements (date, durée, type, énergie active), énergie active quotidienne, chacun choisi séparément avec sa justification à l'écran. **Jamais** : fréquence cardiaque, sommeil, ECG, dossiers médicaux. **Rien n'est écrit** dans Santé / Health Connect.
- **Stockage** : uniquement sur l'appareil, 28 derniers jours. Rien n'est envoyé sur le compte Supabase, à l'IA, aux journaux ni aux statistiques. Aucune table serveur, donc aucune règle RLS supplémentaire nécessaire.
- **Centre de confidentialité › Santé et activité** : connexion, données autorisées, dernière synchronisation, « Synchroniser maintenant », « Déconnecter », explication d'usage.
- **Export** : `deviceSettings.health` (types partagés, autorisations, valeurs importées).
- **Suppression** : la déconnexion efface tout ce qui a été importé ; un accès retiré dans les réglages efface le type concerné ; la déconnexion du compte efface le lien.

## Consentements

Chaque permission (notifications, caméra, calendrier, santé, localisation) est demandée **au moment où elle sert**, avec une explication, et peut être retirée. Refuser ne bloque jamais l'usage de base.

## Analytics

Événements minimisés et pseudonymisés (`onboarding_started`, `workout_completed`, `weight_logged`…), **sans** valeur de poids, mesure, photo, texte libre ni donnée santé brute. Désactivables.

## Stores

Avant publication : déclarations App Store (Privacy Nutrition Labels, HealthKit) et Google Play (Data safety, Health Connect) à vérifier selon les règles en vigueur ; suppression de compte accessible dans l'app.
