# Confidentialité

Project You est un outil de fitness et bien-être ; il ne remplace pas un professionnel de santé.

## Minimisation

- Âge stocké en **année de naissance** (suffit au calcul).
- Sexe facultatif (« préfère ne pas dire » → calcul moyen, précision moindre signalée).
- Données santé (HealthKit / Health Connect) lues seulement si utiles et autorisées, catégorie par catégorie.
- Réponses de motivation : privées, utilisées pour le ton des messages du coach uniquement. Les motivations choisies (`reasons`, D-046) sont exportées et supprimées avec la catégorie « motivation » ; elles ne changent aucune cible.
- Photos : facultatives, bucket privé, jamais envoyées à un modèle externe sans action explicite.
- **Photo de repas** (W-10, `docs/MEAL_PHOTO_ANALYSIS.md`) : prise ou choisie par l'utilisateur, redimensionnée sur l'appareil, envoyée au service d'analyse seulement après « Analyser » (la phrase « Project You ne l’enregistre pas ; le service d’analyse peut la garder jusqu’à 30 jours pour sa sécurité » est affichée avant), traitée pour cette seule demande, jamais stockée ni journalisée par Project You ; le fournisseur de vision peut la conserver jusqu'à 30 jours dans ses journaux anti-abus (OpenAI : `store: false` envoyé, pas d'entraînement par défaut). Seuls les aliments confirmés (ids et grammes) et leur estimation sont enregistrés (`logged_meals`), exportés et supprimés avec « Repas ». Refus de la caméra : la galerie et la composition à la main restent disponibles.

## Privacy Center (M-20, écran `/privacy`)

- **Voir** ce qui est stocké, par catégorie (profil, motivation, pesées, mensurations, inventaire, dépenses, séances, repas consommés).
- **Exporter** : fichier JSON avec les données de l'appareil **et** celles du compte (toutes les tables, RLS) ; les tables illisibles sont listées dans `unavailable` au lieu d'apparaître vides.
- **Supprimer une catégorie** : suppression **définitive** côté serveur (DELETE, pas de suppression logique), table par table (enfants d'abord), puis sur l'appareil. Résultat structuré (W-7.1, D-042) : `complete` → l'appareil est effacé, « Données supprimées. » ; `partial` (une table a échoué après d'autres) ou `failed` (aucune confirmée, hors ligne) → l'appareil garde ses données et ce qu'il sait déjà synchronisé (rien n'est renvoyé), le message dit que la suppression n'est pas terminée ; « Réessayer » recommence depuis la première table (sans risque). Jamais de succès annoncé à tort. « Repas » efface aussi les coches de la semaine précédente gardée pour le bilan. Limite connue : un autre appareil connecté garde sa copie locale jusqu'à sa déconnexion.
- **Supprimer le compte** : Edge Function `delete-account` (JWT de l'appelant, jamais d'identifiant venant du corps de la requête) → photos du bucket `progress-photos/<user_id>/` (listées page après page et dans les sous-dossiers ; une erreur de listage arrête tout, le compte est gardé) → `auth.users` (cascade sur toutes les tables, testée dans `rls.sql`). Puis effacement local et annulation des rappels ; l'écran ne quitte qu'en cas de succès. Limites (non réglées) : l'app n'envoie encore aucune photo ; le bucket privé et ses politiques (`<user_id>/…`) sont créés par la migration W-8 et testés en base locale ; le nettoyage n'a pas été vérifié sur le vrai projet ; les photos sont supprimées avant le compte, donc un échec ensuite laisse un compte sans photos. La table `coach_memory` (héritée, inutilisée) est exportée et supprimée avec le compte.
- **Connexions** calendrier / santé : affichées « Non connecté » tant que les intégrations n'existent pas.
- **Autorisations** : lien vers les réglages de l'appareil ; **notifications** : écran `/notifications`.
- **Coach et notifications** (D-024) : l'historique des messages planifiés (identifiants de modèles, jamais le texte ni les mots de l'utilisateur) restent sur l'appareil, 90 entrées au plus ; ils figurent dans l'export (réglages de l'appareil) et sont effacés avec les données de l'appareil. Option « Citer mes mots » : désactivée, aucune réponse personnelle n'apparaît sur l'écran verrouillé.
- **Suivi du parcours** (D-028) : check-ins du jour et de la semaine, jalons, décisions d'adaptation, raisons choisies (repas, séances, remplacements d'exercice) sont synchronisés avec le compte (multi-appareil), visibles, exportables et supprimables par catégorie (« Suivi du parcours », « Repas cochés », « Séances »). Aucun texte libre ; la mémoire du coach est recalculée depuis ces données et jamais stockée ; aucune interprétation psychologique n'est enregistrée.
- **Réglages (W-8, D-043)** : profil, unité, ton et préférences de rappels sont des données du compte (exportées, supprimées avec lui) ; la langue, l'autorisation des notifications, le calendrier et les données santé restent sur l'appareil. « Corriger mes mesures » modifie ou supprime une pesée ou une mensuration. La déconnexion envoie d'abord les changements en attente et prévient s'il en reste (effacés de l'appareil sinon). Correspondance complète : `docs/SETTINGS_ARCHITECTURE.md`.
- **Données santé locales** : `py.health.v1` en stockage local **non chiffré**, jamais synchronisé, effacé à la déconnexion et par « Effacer les données de cet appareil » (TODO avant bêta : chiffrement ou agrégats seuls).
- Toute action destructive passe par une confirmation explicite (`ConfirmButton`).
- Suppressions courantes (une pesée, un article d'inventaire) : suppression logique pour la synchronisation multi-appareil. TODO : purge serveur des lignes `deleted_at` anciennes.

## Calendrier et position (phase 2)

- **Calendrier** : seules les heures de début et de fin des événements sont lues (ni titre, ni lieu, ni invités), et gardées sur l'appareil pour la semaine en cours. L'app écrit uniquement dans son propre calendrier « Project You ». Déconnexion (écran Calendrier ou Privacy Center) = suppression de ce calendrier et oubli des heures lues. Inclus dans l'export (`deviceSettings.calendar`) ; effacé à la déconnexion du compte.
- **Lien iCal (D-049)** : lu par le serveur (`calendar-feed`), jamais par le navigateur. Le lien est scellé (AES-256-GCM, secret `CALENDAR_FEED_KEY`) dans `calendar_feeds` ; on garde seulement l'hôte affiché et les **plages occupées** des 6 semaines à venir : jamais de titre, lieu, description ni invités, et rien n'est déduit des titres. Texte affiché : « PROJECT YOU utilise uniquement les horaires occupés de ton calendrier pour planifier tes séances. Les titres et détails de tes événements ne sont pas utilisés par le coach. » Suppression : bouton « Supprimer ce calendrier », réinitialisation locale, suppression du compte (cascade). Export : la ligne sans le lien scellé.
- **Position** : demandée seulement quand l'utilisateur lance une recherche de lieux, arrondie à ~100 m sur l'appareil avant tout envoi (à la fonction `places-nearby`, qui l'arrondit encore, puis à OpenStreetMap), jamais enregistrée, synchronisée ni journalisée ; la fonction garde au plus 10 minutes en mémoire la réponse d'une zone arrondie. Refus = l'app reste utilisable (salle saisie à la main).

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
