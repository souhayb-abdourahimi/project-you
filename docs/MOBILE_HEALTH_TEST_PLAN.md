# Plan de test santé sur appareils réels

**Statut au 2026-10-01 : rien de ce plan n'a encore été exécuté.** Apple Santé (HealthKit) et Health Connect n'ont été testés qu'avec des modules simulés (`jest.setup.js`, `src/providers/__tests__/health.test.ts`) et la configuration native vérifiée par un `expo prebuild` (manifeste Android, Info.plist, entitlements). Aucun test sur un vrai iPhone ni un vrai Android.

Code concerné : `src/providers/health.ios.ts`, `src/providers/health.android.ts`, `src/domain/health/`, `src/features/health/`, écran `/health`. Décision : D-018.

## Pré-requis communs

- Un **build de développement** (pas Expo Go, qui ne contient pas ces modules natifs) : `npx expo run:ios --device` / `npx expo run:android --device`, ou `eas build --profile development`.
- Un profil complété dans l'app, au moins une séance du programme validée dans Project You (pour le test de dédoublonnage).
- Noter pour chaque cas : appareil, version de l'OS, résultat, capture si écart.

## iPhone (Apple Santé)

### Préparation

1. Compte Apple Developer : activer la capability **HealthKit** sur l'App ID `app.projectyou` (EAS le fait si « sync capabilities » est accepté). Ne pas cocher **Clinical Health Records** ni **Background Delivery**.
2. Vérifier dans le build : entitlement `com.apple.developer.healthkit` = true, pas de `healthkit.access`, pas de `background-delivery` ; `NSHealthShareUsageDescription` et `NSHealthUpdateUsageDescription` en français.
3. Dans l'app Santé, ajouter à la main : 3 pesées sur 10 jours (dont une en livres si la région le permet), des pas (l'iPhone en compte seul), un entraînement « Course » de 30 min, un « Renforcement musculaire » qui chevauche l'heure d'une séance validée dans Project You.

### Cas à dérouler

| # | Action | Attendu |
|---|---|---|
| I1 | Ouvrir Réglages › Santé et activité | Les 4 types avec leur justification, bouton « Relier Apple Santé » |
| I2 | Relier, tout autoriser | Feuille Apple listant **seulement** Poids, Pas, Entraînements, Énergie active, en **lecture** (aucune écriture) ; retour sur l'écran, « Dernière synchronisation » renseignée |
| I3 | Aujourd'hui | Carte Activité : pas aujourd'hui, cette semaine, tendance (« Il faut 2 semaines de données » si peu d'historique), énergie active « estimation », la course (pas le renforcement déjà compté), dernière pesée |
| I4 | Progrès | Moyenne de poids intégrant les pesées importées ; une pesée saisie le même jour dans Project You est prioritaire |
| I5 | Relier en refusant tout dans la feuille Apple | L'app affiche « Connecté » mais aucune donnée (Apple ne révèle pas le refus) ; texte « Demandé (Apple ne dit pas…) » ; tout le reste de l'app fonctionne |
| I6 | Autoriser seulement les pas | Seuls les pas apparaissent |
| I7 | Retirer l'accès au poids dans Réglages › Santé, revenir dans l'app (premier plan) | Les pesées importées disparaissent à la synchro suivante (HealthKit ne renvoie plus rien) ; la saisie manuelle reste |
| I8 | Supprimer une pesée dans Santé, « Synchroniser maintenant » | Elle disparaît de l'app |
| I9 | Mode avion, ouvrir l'app | Tout fonctionne, la synchro santé marche (données locales), aucune erreur réseau |
| I10 | Verrouiller l'iPhone pendant une synchro | Pas de plantage ; au pire « La lecture n'a pas pu se terminer », valeurs précédentes conservées |
| I11 | Déconnecter (écran Santé puis Centre de confidentialité) | Données importées effacées, message expliquant de retirer l'accès dans Réglages › Santé |
| I12 | Exporter mes données | `deviceSettings.health` contient les valeurs importées, rien d'autre de santé |
| I13 | iPad sans app Santé (si disponible) | « Apple Santé n'est pas disponible sur cet appareil », saisie manuelle disponible |
| I14 | Se déconnecter du compte | Lien santé et données importées effacés de l'appareil |

## Android (Health Connect)

### Préparation

1. Android 14+ : Health Connect est intégré au système. Android 9–13 : installer l'app Health Connect depuis le Play Store. `minSdkVersion` 26.
2. Vérifier le manifeste du build : seulement `READ_WEIGHT`, `READ_STEPS`, `READ_EXERCISE`, `READ_ACTIVE_CALORIES_BURNED` (aucune permission `WRITE_*`, aucune `READ_HEALTH_DATA_HISTORY` ni `BACKGROUND`), intent `ACTION_SHOW_PERMISSIONS_RATIONALE` et alias `ViewPermissionUsageActivity`.
3. Alimenter Health Connect via une app compatible (Google Fit, Samsung Health, une balance) ou l'app de test « Health Connect Toolbox ».

### Cas à dérouler

| # | Action | Attendu |
|---|---|---|
| A1 | Appareil Android 9–13 **sans** Health Connect | « Health Connect n'est pas disponible… » ; rien ne plante ; saisie manuelle disponible |
| A2 | Health Connect à mettre à jour | Message « doit être mis à jour » |
| A3 | Relier, tout autoriser | Écran Health Connect avec les 4 lectures ; données importées, carte Activité comme I3 |
| A4 | Relier, n'autoriser que Pas et Poids | Statut « Partiellement autorisé », chaque type affiche Autorisé / Refusé |
| A5 | Tout refuser | « Accès refusé… », aucune donnée, l'app fonctionne |
| A6 | Retirer le poids dans Health Connect, revenir dans l'app | Bandeau « Un accès a été retiré… », pesées importées supprimées |
| A7 | Aucune donnée dans Health Connect | Carte avec des tirets, aucune erreur |
| A8 | Même entraînement enregistré par deux apps | Compté une seule fois |
| A9 | Déconnecter | Données effacées ; message « finalisera le retrait au prochain démarrage » ; après redémarrage, l'app n'apparaît plus avec des autorisations dans Health Connect |
| A10 | Health Connect › Project You › « Lire la politique de confidentialité » | Ouvre l'app (voir limite ci-dessous) |
| A11 | Mode avion, déconnexion du compte, export | Comme I9, I12, I14 |

## Ce qui reste manuel ou non couvert

- Tout ce plan : l'environnement de développement cloud n'a ni simulateur iOS ni émulateur Android.
- **Écran de politique de confidentialité Health Connect (A10)** : Google Play exige qu'il affiche la politique de confidentialité. Aujourd'hui l'intent ouvre simplement l'app. À faire avant publication Play : une page de politique de confidentialité et une route qui l'affiche.
- **Formulaire Google Play « Health apps declaration »** et justification de chaque permission santé : à remplir à la publication.
- **App Store Review** : texte de confidentialité (App Privacy) à déclarer : données de santé et forme physique lues, non liées à des tiers, non utilisées pour la publicité.
- Comportement réel de `getRequestStatusForAuthorization` après une réinstallation (iOS garde parfois les autorisations).
- Énergie active des séances Android : calculée par une agrégation par séance (60 séances max par synchro) ; vérifier les valeurs face à l'app source.
