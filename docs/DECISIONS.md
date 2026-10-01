# Décisions d'architecture

Format : Decision · Reason · Alternatives · Trade-offs · Date. On ajoute, on ne réécrit pas : une décision remplacée est marquée « Remplacée par D-xxx ».

## D-000 — État initial (audit)

- **Constat** : le 2026-09-30, le repository ne contenait qu'un `CLAUDE.md` (commit `a1abf57`) ; aucune dépendance, aucun script, aucune configuration, aucun code. Une autre branche (`claude/project-thread-99zbbu`) contient le même `CLAUDE.md`. Outils disponibles : Node 22, npm 10, Postgres 16 local (pas de Docker, donc pas de `supabase start`), accès au registre npm ; l'API `api.expo.dev` est bloquée par le proxy (utiliser `EXPO_OFFLINE=1 npx expo install`).
- **Conséquence** : initialisation d'une architecture propre ; ce `CLAUDE.md` est remplacé.
- **Date** : 2026-09-30

## D-001 — Stack : Expo SDK 57 + Expo Router + React Native Web + TypeScript strict

- **Reason** : une base de code pour iOS, Android et Web ; routage fichier partagé ; SDK stable courant (template officiel `create-expo-app` du 2026-09-30).
- **Alternatives** : Flutter (pas de TS), Next.js + RN séparés (deux apps), Ionic (moins natif).
- **Trade-offs** : certaines fonctions natives n'ont pas d'équivalent web → fallback obligatoire ; les SDK Expo changent vite → toujours vérifier la doc versionnée.
- **Date** : 2026-09-30

## D-002 — Un seul package, logique métier pure dans `src/domain`

- **Reason** : simplicité (pas de monorepo à maintenir) tout en isolant les moteurs, testables sans React et réutilisables par des Edge Functions (TS pur, sans import natif).
- **Alternatives** : monorepo (apps/mobile, packages/domain) dès le départ.
- **Trade-offs** : si le web diverge beaucoup ou si les Edge Functions importent massivement le domaine, passer en workspace npm. Règle d'import vérifiée par ESLint (`no-restricted-imports` dans `src/domain`).
- **Date** : 2026-09-30

## D-003 — Routes dans `src/app` (convention du template SDK 57)

- **Reason** : c'est la convention du template officiel ; le schéma du brief (`app/`, `components/`, `lib/`… à la racine) est respecté en esprit sous `src/`.
- **Alternatives** : dossiers à la racine.
- **Trade-offs** : aucun fonctionnel ; alias `@/` → `src/`.
- **Date** : 2026-09-30

## D-004 — Moteurs déterministes ; l'IA n'est jamais source de vérité

- **Reason** : exactitude, reproductibilité, testabilité, sécurité santé.
- **Alternatives** : calcul par LLM.
- **Trade-offs** : plus de code à maintenir ; les règles doivent être documentées (`NUTRITION_ENGINE.md`, `WORKOUT_ENGINE.md`).
- **Date** : 2026-09-30

## D-005 — Estimation énergétique : Mifflin-St Jeor + facteurs d'activité, bornes de sécurité

- **Reason** : équation la plus validée chez l'adulte pour la dépense de repos ; simple et explicable.
- **Alternatives** : Harris-Benedict (plus ancienne), Katch-McArdle (nécessite la masse grasse, rarement connue).
- **Trade-offs** : estimation ±10 % → présentée comme estimation, recalibrée par la tendance de poids réelle (phase 1.5).
- **Date** : 2026-09-30

## D-006 — Offline-first : stores locaux + outbox + last-write-wins par ligne

- **Reason** : séance, repas, poids doivent marcher sans réseau ; LWW sur `updated_at` suffit pour des données mono-utilisateur rarement éditées sur deux appareils à la fois.
- **Alternatives** : WatermelonDB / PowerSync / ElectricSQL (sync plus riche, dépendance lourde), CRDT.
- **Trade-offs** : conflit simultané sur deux appareils → la dernière écriture gagne ; suppressions logiques nécessaires. Réévaluer si le multi-appareil devient courant.
- **Date** : 2026-09-30

## D-007 — État client : zustand + persistance AsyncStorage

- **Reason** : léger, sans boilerplate, persistance simple, fonctionne sur web (AsyncStorage → localStorage).
- **Alternatives** : Redux Toolkit (plus lourd), React Query seul (cache serveur, pas source locale), SQLite (utile quand les volumes grossiront).
- **Trade-offs** : volumes limités (quelques Mo) ; migrer vers expo-sqlite si l'historique d'entraînement grossit.
- **Date** : 2026-09-30

## D-008 — Validation : Zod v4

- **Reason** : schémas partagés formulaire / stockage / sorties IA, inférence de types.
- **Alternatives** : Valibot, Yup.
- **Trade-offs** : taille du bundle acceptable.
- **Date** : 2026-09-30

## D-009 — Tests : Jest (jest-expo) + tests SQL RLS sur Postgres local

- **Reason** : jest-expo est l'outil officiel Expo ; un seul runner pour domaine et composants. Docker indisponible → schéma `auth` minimal simulant Supabase pour tester les politiques RLS avec `psql`.
- **Alternatives** : Vitest (plus rapide mais second runner), pgTAP via `supabase test db` (nécessite Docker).
- **Trade-offs** : la simulation `auth` doit rester fidèle à Supabase (`auth.uid()` lit `request.jwt.claims`). Passer à `supabase test db` quand Docker est disponible.
- **Date** : 2026-09-30

## D-010 — Provider-first avec `ProviderResult` explicite

- **Reason** : aucune dépendance forte à un fournisseur ; l'absence de donnée est un cas normal (`status: 'unavailable'`), jamais comblée par une invention.
- **Alternatives** : appels directs aux SDK.
- **Trade-offs** : une couche d'indirection par intégration.
- **Date** : 2026-09-30

## D-011 — Catalogue d'aliments MOCK en attendant CIQUAL

> **Remplacée par D-020 le 2026-10-01** (import de la table Ciqual 2025).

- **Reason** : la fondation a besoin de données pour tester les moteurs ; nous ne pouvons pas vérifier ici les valeurs officielles CIQUAL → valeurs de démonstration explicitement `isMock: true`, affichées avec badge MOCK.
- **Alternatives** : bloquer le plan alimentaire jusqu'à l'import CIQUAL.
- **Trade-offs** : les apports affichés sont approximatifs tant que P2-01 n'est pas fait ; bloquant pour la bêta.
- **Date** : 2026-09-30

## D-012 — Langue : code et identifiants en anglais, docs produit et UI en français (FR défaut, EN)

- **Reason** : le propriétaire travaille en français ; le code reste lisible par tout outil/développeur.
- **Date** : 2026-09-30

## D-013 — Plan repas : choix par journée plutôt que repas par repas

- **Contexte** : les plans vegan (et certains plans omnivores en perte de gras) restaient sous la cible de protéines (ex. 92–111 g pour 141 g), car chaque repas était choisi isolément et seule la calorie guidait la portion.
- **Décision** : recherche exhaustive des combinaisons de la journée parmi quelques candidats par créneau, avec une pénalité forte sous 90 % de la cible protéique ; ajout de recettes et d'aliments vegan riches en protéines (tofu, tempeh, seitan, soja texturé, edamame, yaourt soja ; valeurs MOCK) ; couverture protéique exposée et affichée.
- **Alternatives** : programmation linéaire (plus lourde, moins lisible) ; ajout automatique de compléments protéinés (contraire à la règle « pas de produit imposé »).
- **Trade-offs** : ≤ 7⁵ combinaisons par jour (quelques ms) ; si les contraintes empêchent d'atteindre la cible, l'app le dit plutôt que de tricher.
- **Tests** : `src/domain/meals/__tests__/protein.test.ts` (vegan, vegan perte de gras, vegan prise de masse, allergies multiples, budget faible micro-ondes, inventaire limité, cible inatteignable).
- **Date** : 2026-09-30

## D-014 — Pas de clé étrangère des données utilisateur vers les catalogues

- **Contexte** : `inventory_items.food_id`, `meal_plan_items.recipe_id`, `exercise_logs.exercise_id` référençaient des tables catalogue vides côté serveur → toute synchronisation aurait échoué.
- **Décision** : identifiants texte validés par `check` de format, sans FK. Le catalogue fait foi côté client (versionné avec l'app) jusqu'à l'import CIQUAL.
- **Alternatives** : peupler les catalogues par migration (double source de vérité, dérive), ou les servir depuis Supabase (dépendance réseau pour afficher une recette).
- **Trade-offs** : un identifiant inconnu est possible ; le client l'affiche comme « aliment inconnu » plutôt que de planter.
- **Date** : 2026-10-01

## D-015 — Synchronisation par différence d'états (remplace l'outbox de D-006)

- **Contexte** : l'outbox n'était alimentée que par 4 actions (inventaire, poids, tour de taille, dépenses) ; profil, séances, séries et repas n'étaient jamais envoyés, et rien n'était tiré du serveur.
- **Décision** : une projection pure `état local → lignes serveur` par table, une empreinte (JSON trié) de chaque ligne synchronisée, un diff pour pousser et une fusion pour tirer. Ajouter une donnée synchronisée = l'ajouter à la projection, sans toucher aux actions des stores.
- **Règles** : local non poussé > serveur > local déjà synchronisé ; `updated_at` fixé par le serveur uniquement (le curseur ne dépend pas de l'horloge du téléphone) ; lignes refusées isolées une par une et réessayées ; profil distant validé par Zod avant d'être appliqué.
- **Alternatives** : compléter l'outbox action par action (oubli facile, c'était déjà le cas), PowerSync / ElectricSQL (dépendance lourde).
- **Trade-offs** : la projection est recalculée à chaque tour (quelques centaines de lignes : négligeable) ; conflit simultané sur deux appareils = le changement non poussé de l'appareil qui synchronise gagne.
- **Date** : 2026-10-01

## D-016 — Calendrier : un calendrier dédié « Project You », lecture des heures occupées seulement

- **Contexte** : placer les séances aux vrais moments libres et les retrouver dans l'agenda, sans jamais toucher aux événements personnels.
- **Décision** : `expo-calendar` (API `legacy`, compatible Expo Go). Lecture : uniquement début/fin des événements des autres calendriers (pas de titre, lieu ni invités), transformés en créneaux occupés pour la semaine (`src/domain/calendar`). Écriture : uniquement dans un calendrier « Project You » créé par l'app ; modification et suppression refusées pour tout événement hors de ce calendrier (vérifié avant chaque appel). Déconnexion = suppression de ce calendrier.
- **Alternatives** : Google Calendar API (OAuth, serveur, données personnelles hors appareil) ; marquer les événements dans le calendrier principal (risque de toucher un événement personnel).
- **Trade-offs** : rien sur le web ; les événements « toute la journée » sont ignorés (anniversaires, congés) ; l'état du lien reste sur l'appareil (non synchronisé).
- **Date** : 2026-10-01

## D-017 — Lieux : OpenStreetMap (Overpass), position arrondie, aucun champ deviné

- **Contexte** : trouver salles et magasins proches sans inventer horaires, adresses, fréquentation ni matériel.
- **Décision** : API Overpass publique (sans clé), données ODbL, confiance « medium », source et date affichées. Position demandée seulement au moment de la recherche, arrondie à 3 décimales (~100 m) avant l'envoi, jamais enregistrée. Horaires affichés tels que saisis sur OSM, « à vérifier », jamais interprétés en « ouvert maintenant ». Distance à vol d'oiseau, pas de temps de trajet. Choisir une salle met à jour le nom de la salle du profil, jamais son matériel.
- **Alternatives** : Google Places (clé, coût, conditions d'affichage) ; Foursquare.
- **Trade-offs** : couverture et fraîcheur variables selon les contributeurs ; serveur public avec limites de débit (cache 10 min, erreur « saturé » affichée).
- **Date** : 2026-10-01

## D-018 — Santé : Apple Santé et Health Connect en lecture seule, données gardées sur l'appareil

- **Contexte** : éviter de ressaisir pas, entraînements et pesées, sans collecter plus de données de santé que nécessaire.
- **Décision** :
  - Bibliothèques : `@kingstinct/react-native-healthkit` (iOS) et `react-native-health-connect` (Android), derrière `HealthProvider` (`src/providers/health.ios.ts`, `health.android.ts`, `health.web.ts`). Aucun écran n'importe de code natif.
  - V1 : lecture seule de 4 types (poids, pas, entraînements, énergie active). Pas de fréquence cardiaque, sommeil, ECG ni dossiers cliniques. Aucune écriture : aucun type « share » demandé, aucune permission `WRITE_*`.
  - Moteur pur `src/domain/health` : normalisation des unités (lb, g, kJ, cal…), validation (bornes plausibles, valeur rejetée et non corrigée), dédoublonnage, fusion avec les données Project You.
  - Pas et énergie active : agrégats quotidiens calculés par la plateforme, qui fusionne téléphone et montre sans les additionner.
  - Chaque synchronisation relit les 28 derniers jours. Une suppression dans Santé est donc répercutée ; un type en échec garde ses valeurs ; un type retiré est purgé.
  - Règles de fusion :
    - une pesée saisie dans Project You l'emporte le même jour ;
    - un entraînement importé qui chevauche une séance validée dans l'app est « la même séance » et n'est pas compté une deuxième fois ;
    - les données importées ne modifient jamais le programme, la progression ni les objectifs nutritionnels.
  - Stockage : sur l'appareil seulement (`py.health.v1`, 28 jours), jamais synchronisé vers Supabase, jamais envoyé à l'IA ni aux statistiques. Inclus dans l'export, effacé à la déconnexion santé et à la déconnexion du compte.
  - Déconnexion : logique (arrêt de lecture et purge) ; Android révoque aussi, effectif au redémarrage (limite de Health Connect) ; iOS n'a pas d'API, l'utilisateur est guidé vers Réglages › Santé.
  - `NSHealthUpdateUsageDescription` est renseigné (texte honnête : « n'écrit rien aujourd'hui ») pour éviter un refus de l'App Store lié à la présence des API d'écriture dans le binaire. Background delivery désactivé.
- **Alternatives** :
  - Synchroniser les données importées vers Supabase (multi-appareil) : écarté en V1, pas nécessaire au coaching et plus de données sensibles côté serveur.
  - Lire les échantillons de pas bruts : risque de double comptage téléphone + montre.
- **Trade-offs** :
  - Sur iOS, impossible de savoir si la lecture a été refusée (choix d'Apple) : l'app affiche « Demandé » et lit ce qu'on lui donne.
  - Pas d'historique au-delà de 28 jours.
  - Un deuxième appareil ne voit pas les données importées sur le premier.
- **Date** : 2026-10-01

## D-019 — Lieux et cartes : fournisseur interchangeable, serveurs OSM publics réservés au développement

- **Contexte** : la phase 2 utilise l'instance publique d'Overpass. Il faut pouvoir changer de fournisseur (Nominatim, Overpass auto-hébergé, service commercial) sans toucher l'UI ni le moteur de recommandations.
- **Décision** :
  - Types neutres `Place` / `PlaceKind` / `GeoPoint` dans `src/domain/places/types.ts`.
  - L'UI passe uniquement par `providers.places.nearby(kind, point, rayon)` (`PlacesProvider`) et `providers.maps.open(point)` (`MapsProvider`) ; plus aucune URL de carte n'est construite dans une feature.
  - L'implémentation OSM (`src/providers/osm.ts`) se remplace en changeant une ligne de `src/providers/index.ts`.
  - Nominatim (géocodage) n'est **pas** utilisé : aucune recherche d'adresse n'en a besoin aujourd'hui.
  - L'instance publique d'Overpass sert au développement et à la bêta fermée seulement. Raison : sa politique d'usage, lue le 2026-10-01, limite un usage régulier à environ 100 requêtes et 10 Mo par jour.
- **Avant la production**, choisir :
  - soit un Overpass auto-hébergé (extrait France),
  - soit un fournisseur commercial avec contrat et attribution,

  puis l'implémenter derrière `PlacesProvider`.
- **Alternatives** : appeler Nominatim/Overpass publics en production (contraire à leurs conditions) ; Google Places (coût, conditions d'affichage, données à ne pas stocker).
- **Trade-offs** : un fournisseur commercial peut exiger une clé : elle irait dans une Edge Function, jamais dans le client.
- **Date** : 2026-10-01

## D-020 — Valeurs nutritionnelles : import de la table Ciqual 2025 (ANSES)

- **Décision** : les nutriments des aliments viennent uniquement du fichier officiel `Table Ciqual 2025_FR_2025_11_03.xlsx`, conservé tel quel dans `data/ciqual/`. Un script (`scripts/ciqual/import_ciqual.py`) vérifie la structure puis extrait les aliments utilisés vers `src/domain/meals/ciqual/foods.generated.json`, avec le texte brut de chaque cellule. Le client valide ce fichier avec Zod au chargement. Provenance et conventions : `docs/DATA_SOURCES.md`.
- **Identifiants** : les identifiants d'aliments de l'app (`tofu`, `rice`…) restent stables, car l'inventaire et les plans enregistrés les utilisent. Le code Ciqual (`alim_code`) est porté par `food.ciqualCode` et `meta.externalId`. L'association est éditoriale, dans `mapping.json`.
- **Choix d'association** :
  - on prend l'état réellement pesé dans les recettes : riz et pâtes crus, lentilles sèches, conserves égouttées, viandes et poissons crus ;
  - les protéines de soja texturées sont désormais comptées **réhydratées** (`tvp_rehydrated`, code 20591), car c'est la seule forme présente dans la table ;
  - le « yaourt au soja » correspond au « Dessert au soja, nature, sans sucres ajoutés, non enrichi, fermenté » (19693).
- **Aliments retirés** (aucun équivalent fidèle dans la table), remplacés dans les recettes :
  - skyr et yaourt grec → fromage blanc 0 % ;
  - edamame → pois chiches en conserve (recette « Pois chiches tièdes à l'huile d'olive ») ;
  - fruits rouges surgelés → framboises crues ;
  - pâte de curry → curry en poudre ;
  - protéines de soja texturées sèches → réhydratées.
- **Conventions** : « traces » et « < x » comptent pour 0 (statuts `traces` / `below_limit` conservés), « - » est une valeur manquante. Un aliment sans énergie ou sans l'un des 3 macronutriments est exclu, jamais complété.
- **Portions des recettes véganes revues** : avec les valeurs réelles (tofu 13,4 g de protéines/100 g, soja texturé réhydraté 18,6 g, dessert au soja 3,76 g), les plans « véganes en perte de poids » passaient sous 90 % de la cible de protéines (121,6 g pour 126,9 g requis). Les tests n'ont pas été assouplis. Nous avons ajusté des portions éditoriales, toutes calculées avec les valeurs Ciqual :
  - seitan 150 → 200 g ;
  - tempeh 150 → 200 g ;
  - soja texturé réhydraté 200 g et pâtes 70 g ;
  - bol tofu au micro-ondes : tofu 250 g et pommes de terre 150 g ;
  - bol au dessert de soja : 250 g, soit deux pots de 125 g.

  `MEAL_PLANNER_VERSION` passe à 3 : les plans enregistrés sont régénérés.
- **Données MOCK** : il n'existe plus de valeur nutritionnelle de démonstration dans l'app. Les scénarios de profils MOCK (`src/domain/scenarios`) restent réservés aux tests et au mode développement. Le mécanisme `isMock` / badge MOCK est conservé (`hasMockFood`) pour toute future donnée de démonstration.
- **Alternatives** :
  - embarquer toute la table (3 484 aliments, environ 1,5 Mo) : inutile tant que les recettes n'utilisent que 36 aliments ;
  - une table `foods` dans Supabase : ajoutée quand la recherche d'aliments libre arrivera ;
  - « corriger » les cellules « < x » ou estimer les valeurs manquantes : refusé.
- **Trade-offs** :
  - la cible de protéines des profils véganes à cible élevée est atteinte avec une marge faible (environ 1 % au pire dans le test « inventaire limité ») ;
  - les éléments d'inventaire déjà enregistrés avec un aliment retiré restent affichés sous leur nom, mais ne servent plus au plan ;
  - l'empreinte du fichier n'a pas pu être comparée au site de l'ANSES depuis l'environnement cloud.
- **Date** : 2026-10-01

## D-021 — Exclusions en texte libre traduites en catégories ; plan incomplet toujours expliqué

- **Contexte** : revue de la PR #1, points critiques C1 et C2.
  - C1 : les aliments exclus et intolérances saisis en texte libre étaient cherchés comme sous-chaînes des noms d'aliments. Résultat : « soja » laissait le tofu, « poisson » ne retirait rien, « pomme » retirait la pomme de terre.
  - C2 : végan + allergie au soja donnait des repas manquants sans aucune explication.
- **Décision C1** (`src/domain/meals/exclusions.ts`) : texte → mots normalisés (minuscules, sans accents, œ → oe, ponctuation, pluriels) → dictionnaire de sens (soja, poisson, viande, œuf, lait, gluten, arachide, fruits à coque…) → allergènes, origines animales, catégories ou aliments précis → filtrage du catalogue.
  - Une expression connue décide seule (« pomme de terre » ≠ « pomme »).
  - Sinon, chaque mot connu compte (« lait de soja » exclut lait et soja : exclure trop vaut mieux qu'exclure trop peu).
  - Les mots sans règle sont comparés aux noms des aliments par mots entiers, jamais par sous-chaîne.
  - Les intolérances passent par le même dictionnaire.
  - L'app affiche ce qu'elle a compris pour chaque saisie, y compris « non reconnu, rien n'est exclu », dans l'onboarding et sur l'écran Nutrition.
- **Décision C2** (`src/domain/meals/diagnosis.ts`) : quand un créneau n'a aucune recette compatible ou que la cible de protéines n'est pas atteinte, le plan porte un diagnostic qui contient :
  - les créneaux sans recette ;
  - les contraintes en cause, trouvées en relâchant une contrainte à la fois et en replanifiant un jour ;
  - des ajustements, chacun vérifié par replanification : autoriser un aliment exclu, plus de temps de cuisine, un équipement, un autre nombre de repas (seulement s'il remplit tous les créneaux), une cible de protéines un peu plus basse (seulement si le meilleur jour atteint au moins 75 % de la cible).
  - Le régime, les allergies et les intolérances sont nommés mais **jamais** proposés à la suppression.
  - Affiché sur l'écran Nutrition (détail) et sur Aujourd'hui (résumé).
- `MEAL_PLANNER_VERSION` passe à 4 : les plans enregistrés sont régénérés.
- **Alternatives** :
  - garder la recherche par sous-chaîne en ajoutant des synonymes : les faux positifs demeurent ;
  - ajouter tout de suite des protéines végétales sans soja ni gluten : utile, mais hors du périmètre demandé pour cette PR (voir TODO).
- **Trade-offs** :
  - le dictionnaire est éditorial et en français/anglais : un mot absent est signalé « non reconnu », jamais deviné ;
  - le diagnostic replanifie une journée par contrainte, ce qui coûte quelques millisecondes à la génération du plan.
- **Date** : 2026-10-01

