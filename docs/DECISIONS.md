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

## D-022 — Journée incomplète : calories redistribuées, manque toujours affiché

- **Contexte** : revue finale de la PR #1, point bloquant B1. Quand un repas n'avait aucune recette possible, les autres repas gardaient leur part. Exemple : femme végane de 50 kg, allergie soja, 10 min de cuisine : journée à 664 kcal pour une cible de 1 850 kcal (métabolisme de base 1 210), sans aucun message sur les calories.
- **Décision** :
  - la part d'un repas impossible est redistribuée sur les repas possibles de la journée, dans la limite existante de 2,5 portions par recette ;
  - chaque journée porte `energy` : calories prévues, manque (arrondi au-dessus, par 50 kcal), créneaux impossibles, plancher et deux drapeaux, `belowFloor` et `incomplete` ;
  - plancher (`NutritionTargets.floorKcal`) = le plus haut entre le métabolisme de base et le plancher absolu (1 200 / 1 500 / 1 350 kcal), jamais au-dessus de la cible ;
  - `incomplete` est vrai quand un repas impossible laisse au moins 10 % de la cible non couverte, ou quand la journée passe sous le plancher, même sans repas impossible ;
  - l'app affiche alors sur Nutrition et Aujourd'hui : « Cette journée est incomplète. Il manque environ X kcal. Ajoute un repas ou un complément alimentaire adapté. ». Sous le plancher, elle ajoute que la journée est sous le métabolisme de base et ne doit pas être suivie telle quelle.
- `MEAL_PLANNER_VERSION` passe à 5.
- **Alternatives** :
  - lever la limite de 2,5 portions : refusé, les portions deviendraient irréalistes ;
  - compléter avec un aliment « de secours » : refusé, ce serait une recette non relue.
- **Trade-offs** : le manque est une estimation. Le même message s'affiche que le repas manquant soit dû aux contraintes ou au catalogue.
- **Date** : 2026-10-01


## D-023 — « Refaire le questionnaire » prérempli ; suppression d'allergie confirmée

- **Contexte** : revue finale de la PR #1, point bloquant B2. « Refaire le questionnaire » repartait du brouillon local : vide après une reconnexion, ou périmé sur un second appareil. L'étape Allergies étant facultative et le résumé ne montrant ni le régime ni les allergies, il suffisait de tout valider pour effacer une allergie, puis la synchronisation la supprimait partout.
- **Décision** :
  - au démarrage, le brouillon est reconstruit à partir du profil enregistré (`draftFromSnapshot`) : toutes les réponses sont préremplies, et le profil du compte l'emporte sur un ancien brouillon local ;
  - le résumé final affiche toujours une carte « Ton alimentation » : régime, allergies, intolérances et aliments exclus (« aucune » quand la liste est vide) ;
  - avant l'enregistrement, toute allergie du profil absente des nouvelles réponses (`removedAllergies`) déclenche une confirmation explicite : « Tu es sur le point de supprimer l'allergie suivante : - Soja. Confirmer ? ». « Non » ramène à l'étape Allergies sans rien enregistrer ; seul « Oui, supprimer » enregistre.
- **Formulation** : tutoiement, comme le reste de l'application (la demande citait « Vous »).
- **Alternatives** : rendre l'étape Allergies obligatoire. Refusé : beaucoup d'utilisateurs n'ont aucune allergie, et cela ne protégeait pas d'un brouillon périmé.
- **Trade-offs** : les intolérances et exclusions retirées sont visibles dans le résumé mais ne demandent pas de confirmation ; seule l'allergie la demande, comme demandé.
- **Date** : 2026-10-01

## D-024 — Transformation Journey Engine : un seul moteur, la sécurité d'abord ; notifications = canal de sortie

- **Contexte** : demande du 2026-10-01 (thread « Transformation Journey ») : concevoir le Transformation Journey Engine, puis construire un Motivation & Notification Engine personnalisé (why / change / feel), sans IA générative, jamais culpabilisant. Puis trois contraintes ajoutées avant le code : un seul moteur de motivation, aucune estimation inventée, détection de l'excès par une règle de sécurité déterministe (CLAUDE.md règles 6 à 8).
- **Décision** :
  - `src/domain/journey/state.ts` : `deriveJourneyState` calcule le seul état de l'utilisateur (objectif, mots de motivation, progression, momentum, difficultés, sécurité), à partir de données saisies uniquement ; non stocké, recalculé. Côté app, un seul hook `useJourneyState()` le fournit à l'écran Aujourd'hui et aux notifications.
  - `src/domain/journey/safety.ts` : règle de sécurité (3 journées notées en entier sous 70 % de la cible ou sous le plancher ; perte > 1 %/semaine deux semaines de suite ; plus de séances que prévu + fatigue déclarée 2 jours sur 7). Prioritaire sur toute règle de motivation.
  - `src/domain/journey/voice/` : catalogue de variantes (titre, ancre, action, sens) dans les fichiers de traduction, composeur déterministe avec rotation LRU, garde de ton testée sur chaque texte FR/EN (reproche, pression, vocabulaire clinique, estimations non mesurées). Remplace `motivation/messages.ts` : l'écran Aujourd'hui utilise la même voix.
  - `src/domain/notifications/` devient le canal de sortie : règles (sécurité → anti-abandon → motivation), un message « motivation » par jour, cooldowns, épisodes d'absence (J+2, J+5, J+10 puis silence, planifiés à l'avance et annulés au retour), plafond baissé après 5 messages ignorés, pause de 7 jours, historique local de 90 jours (ids de modèles, jamais le texte).
  - Tables `notification_settings` et `notification_history` (RLS, aucun texte libre possible dans `template_id`), pas encore synchronisées.
- **Alternatives** :
  - un moteur de notifications autonome avec ses propres signaux : refusé (deux vérités sur l'état de l'utilisateur) ;
  - générer chaque message avec un LLM : refusé (non déterministe, ton non garanti, données personnelles envoyées) ;
  - estimer l'apport réel à partir des repas non notés : refusé (règle 7) ; une journée partiellement notée ne compte pas.
- **Trade-offs** :
  - la détection `low_intake` ne voit que la semaine en cours (le plan repas local), donc pas avant le mercredi ; un utilisateur qui mange hors plan et marque ses repas « sautés » peut recevoir le message à tort (il dit « tes repas notés ») ;
  - « délivré » signifie « l'heure est passée sans replanification » : le système peut avoir masqué la notification ;
  - les seuils de sécurité sont des paramètres de conception, à faire relire par un professionnel de santé avant la bêta publique ;
  - l'écran Santé (PR #1) affiche encore l'« énergie active » estimée par l'appareil, contraire à la règle 7 : signalé, non modifié ici.
- **Date** : 2026-10-01

## D-025 — Interrupteur général des notifications : il coupe aussi les messages de sécurité ; la bannière d'Aujourd'hui compense

- **Contexte** : PR #3. `planNotifications` renvoie une liste vide quand `prefs.enabled = false` (`src/domain/notifications/engine.ts`), messages de sécurité compris. Les catégories désactivées, elles, ne bloquent pas la sécurité (D-024).
- **Décision** : comportement gardé et assumé. L'interrupteur général est un refus explicite de toute notification ; l'app ne l'outrepasse jamais, même pour la sécurité. En contrepartie, la règle de sécurité ne dépend pas des notifications : la bannière `SafetyNotice` de l'écran Aujourd'hui affiche le même message (même voix, même règle) que les rappels soient activés ou non, et la carte de motivation y est masquée.
- **Vérification** : `src/features/journey/__tests__/today-safety-banner.test.tsx` rend le vrai écran Aujourd'hui avec les rappels coupés et une règle de sécurité active : la bannière est affichée, la motivation non, et aucune notification n'est planifiée.
- **Alternatives** : laisser passer les messages de sécurité malgré l'interrupteur. Refusé : une notification envoyée après un refus explicite trahit la confiance et le système peut de toute façon l'empêcher (permission retirée) ; la sécurité ne doit pas reposer sur un canal que l'utilisateur peut fermer.
- **Trade-offs** : un utilisateur qui coupe les rappels et n'ouvre plus l'app ne voit plus rien. C'est assumé : l'app ne peut pas joindre quelqu'un qui a tout refusé.
- **Date** : 2026-10-01

## D-026 — Règle de sécurité : couvrir les utilisateurs qui journalisent peu ; âge et poids dans le parcours

- **Contexte** : PR #3. Les trois détections de D-024 supposent un utilisateur qui note sérieusement, alors que le profil le plus à risque est celui qui arrête de noter. Architecture et seuils existants inchangés ; on ajoute les cas manquants (`src/domain/journey/safety.ts`).
- **Décision** :
  - **`low_logging`** (nouveau signal, le plus faible) : au moins 3 jours passés consécutifs, jusqu'à hier, où au moins un repas prévu n'est ni marqué mangé ni marqué sauté, chez quelqu'un qui avait au moins 3 journées notées en entier dans les 7 jours précédents. Il ne déclenche pas le message de sécurité : un message neutre (`safety_low_logging`, ancre `checkin`) demande comment ça se passe et propose d'ajuster le plan, sans reproche ni chiffre. Une seule fois par épisode (épisode = premier jour non noté, comme les absences). Un autre signal actif le remplace. *Corrigé par D-027 : il ne suspend plus ni félicitations ni relances.*
  - **Perte rapide avec peu de pesées** : chemin dégradé quand une fenêtre de 7 jours n'a qu'une pesée (au moins une dans chacune des trois). Il ne parle que si la baisse dépasse **2 %/semaine deux semaines de suite** (le double du rythme sûr), et le message dit que la mesure est peu fréquente et la tendance imprécise ; aucun chiffre.
  - **Charge sur la seule fréquence** : au moins `max(prévu + 2, prévu × 1,5)` séances dans chacune des **3** dernières fenêtres de 7 jours, sans fatigue déclarée. Le message propose de ralentir (« et si tu gardais une journée de repos en plus ? ») ; les rappels de séance restent normaux.
  - **Âge et poids** : l'état du parcours reçoit l'âge (même calcul que le moteur nutrition) et le statut de poids (IMC < 18,5 à partir de la dernière pesée, sinon du poids du profil). Mineur ou sous-poids → `profile.noPush` : le composeur retire toute variante qui pousse vers l'intensité ou le déficit (marquées `NO_PUSH`) et le bilan du dimanche ne félicite jamais une baisse de poids.
  - Pour que ces cas soient atteignables : bouton « Je ne l'ai pas mangé » sur les repas (statut `skipped`, qui existait sans interface) et conservation locale du plan de la semaine précédente (`previousMealPlan`, jamais synchronisé), sans quoi la règle ne voyait rien avant le mercredi.
  - Migration `20261001000003_safety_low_logging.sql` : nouveau déclencheur et nouvelle ancre acceptés par `notification_history`.
- **Paramètres de conception à faire relire par un professionnel de santé** (avec ceux de D-024) : 3 jours non notés, 3 journées notées sur les 7 jours d'avant, 2 %/semaine avec une pesée par semaine, `prévu × 1,5` et `prévu + 2` séances, 3 semaines de suite, IMC 18,5 et 18 ans (repris du moteur nutrition). Valeurs dans `SAFETY` (`safety.ts`).
- **Alternatives** :
  - compter un repas non marqué comme non mangé : refusé (règle 7, aucune estimation) ;
  - envoyer le message de sécurité complet en cas de non-journalisation : refusé (ne pas noter n'est pas un excès ; un ton d'alerte ferait fuir) ;
  - exiger une fatigue déclarée pour toute alerte de charge : c'était le cas, mais les check-ins sont facultatifs.
- **Trade-offs** :
  - le statut `skipped` reste sur l'appareil (la synchronisation n'envoie que les repas mangés) ; un second appareil voit ces journées comme non notées ;
  - avec une pesée par semaine, la variation d'eau d'un jour pèse lourd : d'où le seuil doublé, au prix de détections plus tardives ;
  - un utilisateur qui n'a jamais noté ses repas ne reçoit pas `low_logging` (rien à comparer) : les relances d'absence s'en chargent.
- **Date** : 2026-10-01

## D-027 — `low_logging` est un signal d'engagement, pas un signal de danger (correction de D-026)

- **Contexte** : PR #3, correction demandée par Souhayb le 2026-10-01. Dans D-026, `low_logging` entrait dans `safety.flags`, donc `safety.active` passait à vrai : l'utilisateur perdait le rappel quotidien, les célébrations et les relances d'absence, et ses rappels recevaient le fait `safety`. C'est l'inverse de ce qu'il faut : quelqu'un qui arrête de noter est en train de décrocher, l'accompagnement doit rester présent.
- **Décision** :
  - `low_logging` sort de `flags` et devient un champ distinct, `SafetyAssessment.lowLogging` (`{ since, days }` ou `null`). `active` ne dépend plus que de `low_intake`, `fast_weight_loss` et `training_load`.
  - Avec `low_logging` seul : rappel quotidien, célébrations, relances d'absence et rappels sans fait `safety`, comme d'habitude. S'ajoute le check-in neutre `safety_low_logging`, une fois par épisode, inchangé.
  - Avec un vrai signal de sécurité en même temps : le message de sécurité prime, le check-in ne part pas (inchangé).
  - Le planificateur ne garde le check-in que sur un seul jour par planification : les jours suivants gardent leur message habituel au lieu de le perdre au profit d'un check-in que l'anti-répétition supprimerait.
- **Pourquoi** : ne pas noter ne dit rien de ce qui a été mangé. C'est un signe que l'utilisateur s'éloigne de l'app, pas un excès. Couper la motivation à ce moment-là accélérerait le décrochage.
- **Tests** : la matrice « ni félicitation ni relance » couvre seulement les trois signaux de sécurité ; un test vérifie que ces messages continuent de partir avec `low_logging` seul, avec le check-in en plus et sans fait `safety`.
- **Date** : 2026-10-01

## D-028 — Phase Daily Coach + Progress Journey : le même moteur, étendu ; l'historique du parcours sur le serveur

- **Contexte** : demande du 2026-10-01 (thread « Daily Coach + Progress Journey ») : faire de Project You un compagnon quotidien (Daily Coach, DailyPlan, Progress Journey, Weekly Check-in, adaptation, anti-abandon, anti-répétition, notifications cohérentes), sans fonctionnalités secondaires, sans casser la sécurité (D-024 à D-027). Audit et architecture : `docs/DAILY_COACH.md`, `docs/PROGRESS_JOURNEY.md`, `docs/ADAPTATION_ENGINE.md`, `docs/RETENTION.md`.
- **Décision** :
  - **Aucun nouveau moteur** : tout est dans `src/domain/journey` (règle 6). `deriveJourneyState` gagne la date de début, l'adhérence, le retour après absence, le risque et la base de poids ; `DailyPlan`, `ProgressJourney`, les jalons, le Weekly Check-in, l'Adaptation Engine et la mémoire sont des sorties pures du même état. `src/domain/today.ts` (`nextAction`) est remplacé par `journey/daily-plan.ts`, l'écran Progrès ne calcule plus rien lui-même.
  - **Hiérarchie du jour** : sécurité → contraintes fortes → entraînement → nutrition → récupération → activité → motivation. `low_logging` seul n'est pas une contrainte (D-027 inchangée).
  - **Voix** : why/change/feel choisis selon le contexte du jour (jamais concaténés), catégories de messages, historique de voix partagé entre l'écran et les notifications.
  - **Issues enregistrées, raisons jamais devinées** : séances (faite, raccourcie, allégée, remplacée, reportée, sautée), repas (mangé, sauté, remplacé, non renseigné), remplacements d'exercice, avec une raison facultative choisie dans une liste.
  - **Historique du parcours sur le serveur** (point 37 de la demande) : sync de `daily_checkins` ; `meal_plan_items` et `workout_sessions` élargis (statuts, raison) et synchronisés aussi quand le repas est sauté ou remplacé et la séance sautée ou remplacée (lève le compromis de D-026) ; nouvelles tables `weekly_checkins`, `exercise_substitutions`, `journey_milestones`, `adjustments`, toutes en RLS propriétaire. `JourneyState`, plans du jour, progression, risque et mémoire restent **dérivés et non stockés**.
  - **Poids de référence** recalculé par paliers de 14 jours (≥ 4 pesées, écart ≥ 1 kg), rejoué depuis le journal des pesées (déterministe, identique sur tous les appareils), gelé sous sécurité.
  - **Adaptations** : calories et nombre de séances seulement proposés (un geste), bornés (±150 kcal, jamais sous le plancher), jamais pendant la calibration ni sans données suffisantes, jamais quand l'adhérence est faible (on simplifie le plan) ; tracées dans `adjustments`.
  - **Coach IA** : pas de LLM dans cette phase. `journey/explain.ts` fournit des explications structurées (« Pourquoi ? ») que l'IA ne pourra que reformuler.
  - **Performance** : pas de cache persistant ; mémorisation dans le hook et test de performance sur un an de données. Un cache ne sera ajouté que si la mesure dépasse le budget.
- **Alternatives** :
  - un « DailyCoachEngine » séparé de `journey` : refusé (deux vérités, règle 6) ;
  - stocker `JourneyState` ou des scores côté serveur : refusé (désynchronisation, données sensibles déduites) ;
  - garder les nouveaux historiques sur l'appareil : refusé (perdus au changement de téléphone ; la demande exige des structures multi-appareils) ;
  - recalculer les calories à chaque pesée : refusé (une pesée fluctue de 1 à 2 kg avec l'eau).
- **Trade-offs** :
  - les séances prévues des semaines passées sont recalculées avec le profil actuel (le plan de la semaine n'est pas stocké) : si le nombre de séances change, l'adhérence passée est approximative (les adaptations acceptées sont datées, ce qui limite l'écart) ;
  - les reports restent sur l'appareil (planification de la semaine en cours) ;
  - les nouveaux seuils (14 jours, 6 pesées, 70 %, ±150 kcal, 28/21 jours pour le plateau, score de risque) sont des paramètres de conception à faire relire avec ceux de D-024/D-026.
- **Revue finale (2026-10-01)** : trois corrections avant livraison.
  - Les décisions d'adaptation ont un identifiant uuid aléatoire (la clé primaire est partagée par tous les comptes) ; la semaine de `effective_from` les relie à la recommandation (`decidedRecommendation`). Les recommandations sont identifiées par type, changement et semaine.
  - Profils protégés (mineur, sous-poids) : aucune proposition ni décalage accepté ne crée de déficit (`noDeficitProfile`, `minimumKcal`), même règle que les cibles (D-022).
  - « Repos aujourd'hui » à la place d'une séance est une séance **sautée** (sans rattrapage), une marche ou de la mobilité une séance **adaptée**.
  - Seuls calories, séances par semaine et semaine allégée s'appliquent en un geste ; jour de repos en plus et nouveau jour de séance restent des conseils.
- **Date** : 2026-10-01

## D-029 — Garde-fou de ton : toutes les chaînes visibles, FR et EN

- **Contexte** : demande du 2026-10-01, avant la fusion de la PR #4. `voice/tone.ts` ne contrôlait que `coach.*` ; la phase D-028 ajoute des textes sur les moments sensibles (journée difficile, pas envie, absence, adaptation, progression, plateau, sécurité) dans `daily`, `explain`, `adaptation`, `checkin`, `progress`.
- **Décision** :
  - **Le ton est une contrainte produit**, au même titre que la sécurité (CLAUDE.md règles 3 et 8, `.claude/rules/ui.md`) : un utilisateur qui vit une journée difficile ou revient après une absence abandonne plus facilement s'il se sent jugé. Une phrase culpabilisante est un défaut, pas une question de style.
  - **Couverture globale** : le test parcourt récursivement tout l'arbre de chaque locale (`localeToneFindings`), FR et EN, au même niveau d'exigence. Une nouvelle section des locales est contrôlée sans rien ajouter. Tout est contrôlé sauf une liste d'exclusions explicite (`TONE_EXCLUSIONS`), courte, justifiée clé par clé et vérifiée (une clé disparue fait échouer le test). Elle est vide aujourd'hui : aucune chaîne des locales n'est cachée à l'utilisateur.
  - **Formulations rassurantes autorisées** : « pas de rattrapage », « sans rien rattraper », « pas un échec », « jamais culpabilisant » disent à l'utilisateur qu'il n'a rien à se reprocher. Chaque règle peut porter une liste étroite de formes rassurantes (`allow`), retirées avant le test du motif ; chacune est testée dans les deux sens (« sans rattraper » passe, « il faut rattraper » échoue, et une réassurance ne masque pas un reproche dans la même phrase).
  - **Fait neutre ≠ culpabilisation** : « 2 séances sur 3 ont été réalisées cette semaine » ou « il faut des pesées sur plus d'une semaine » (ce dont le calcul a besoin) sont des constats ; « Tu n'as fait que 2 séances », « Tu as encore raté », « Tu dois te reprendre », « il faut te reprendre » sont des jugements ou des injonctions et sont refusés. Le coach n'est pas artificiellement positif : il peut dire un fait, jamais un reproche.
  - Deux chaînes reformulées : `adaptation.reason.shorter_sessions` (écart entre le plan et le rythme des deux dernières semaines, sans compter ce qui n'a pas été fait, au conditionnel) et `explain.workout.low_motivation` (répond au choix « Je n'ai pas envie » sans répéter un état négatif ni en inventer un).
- **Alternatives** : une liste de sections à contrôler (refusée : chaque nouvelle section devrait y être ajoutée à la main) ; supprimer les mots « rattrapage » ou « échec » des textes (refusé : les phrases rassurantes en ont besoin) ; un relecteur humain seul (refusé : non systématique).
- **Trade-offs** : des motifs lexicaux ne comprennent pas le sens ; ils attrapent les formulations connues et laissent passer une phrase blessante inédite. La relecture humaine des textes reste utile.
- **Date** : 2026-10-01

## D-030 — Workout Coach Engine : prévu figé, fait enregistré, écart dérivé (validée le 2026-10-02, voir D-031)

- **Contexte** : demande du 2026-10-01 (phase 5, thread « Workout Coach Engine ») : faire de Project You un coach sportif longitudinal qui sait ce qui était prévu, ce qui a été fait, pourquoi il y a eu une différence et quelle adaptation proposer. Audit : `docs/WORKOUT_ENGINE.md` §1 ; architecture : `docs/TRAINING_ARCHITECTURE.md`. Aucun code applicatif avant validation.
- **Constat principal** : le programme et la semaine sont recalculés à chaque rendu depuis le profil actuel (`usePlan`) ; `workout_plans` n'est jamais écrite ; la prescription par exercice et la charge proposée ne sont pas gardées. Le « prévu » de l'historique change donc avec le profil (compromis accepté par D-028), ce qui rend la comparaison prévu/fait impossible.
- **Décision proposée** :
  - **Pas de nouveau moteur de coaching** (règle 6) : `src/domain/training` reste un moteur de calcul pur (prescrire, figer, comparer, progresser) ; `src/domain/journey` reste le seul état, la seule voix, la seule sécurité et la seule adaptation ; `useJourney` reste le point d'assemblage.
  - **Prévu figé** : nouvelle table `training_programs` (programme versionné, un seul actif, raison de chaque version) et `planned_exercises` (prescription figée par séance, charge proposée et action de progression) ; `workout_sessions` étendue (programme, focus, durée prévue, raison d'adaptation du jour, report synchronisé, difficulté 1–5) ; `workout_plans`, jamais écrite, supprimée.
  - **Fait enregistré** : séries modifiables et supprimables (suppression logique), secondes dans `seconds`, heure de début, remplacements choisis par l'utilisateur, raisons `busy_equipment` et `discomfort` ajoutées. La fatigue reste dans `daily_checkins` (une seule source, lue par la sécurité).
  - **Écart dérivé, raison déclarée** : `training/compare.ts` calcule le statut de chaque exercice et de chaque séance ; la raison vient uniquement de ce qui a été déclaré (remplacement, issue de séance, mode du jour, adaptation du coach, fatigue du jour), sinon « non renseignée ». Rien n'est stocké (comme D-028).
  - **Adaptations** : nouvelles règles d'entraînement dans `journey/adaptation.ts` (durée de séance, remplaçant permanent, séries, stagnation, fin de cycle), mêmes blocages (sécurité, calibration, faible adhérence) ; `APPLICABLE_CHANGES` += `session_minutes`, `exercise_swap` ; décisions dans `adjustments` (pas de migration).
  - **Historique antérieur** : rattaché à un programme `reconstructed`, sans prescription inventée.
- **Alternatives** :
  - garder le recalcul et stocker seulement un hash du profil : refusé (on saurait que le prévu a changé, pas ce qu'il était) ;
  - stocker le plan de la semaine en un seul `jsonb` (`workout_plans`) : refusé (sync par différence ligne à ligne, contraintes et RLS par exercice impossibles, taille non bornée) ;
  - stocker l'écart et la progression côté serveur : refusé (désynchronisation, D-028) ;
  - un « TrainingCoachEngine » avec ses propres messages et notifications : refusé (règle 6).
- **Trade-offs** : plus de lignes synchronisées (une séance prévue et ses exercices chaque semaine, même non faite) ; migration locale v4 à tester avec soin ; les seuils (cycle de 6 semaines, stagnation sur 3 séances / 3 semaines, 75 % de la durée, 2 remplacements) sont des paramètres de conception à faire relire avec ceux de D-024, D-026 et D-028.
- **Points ouverts** : tranchés le 2026-10-02 (D-031).
- **Date** : 2026-10-01

## D-031 — Workout Coach : décisions validées et W-1 (modèle de données)

- **Contexte** : validation de l'architecture D-030 par Souhayb le 2026-10-02, avec quatre réponses et sept décisions (A à G), puis demande de W-1 seul : le modèle de données persistant, sans UI ni sync. Détail : `docs/WORKOUT_ENGINE.md` §6–7, `docs/TRAINING_ARCHITECTURE.md` §2–6.
- **Réponses** : cycle de 6 semaines, semaine allégée de fin de cycle proposée (accepter, refuser, reporter : `adjustments.status = 'postponed'` ajouté), jamais imposée ; difficulté en 5 mots (Très facile → Très difficile), stockée 1–5, sans obliger l'utilisateur à connaître le RPE ; historique rattaché à un programme « reconstitué » sans prescription inventée ; raisons de remplacement : machine prise, gêne / inconfort, technique inconnue, trop difficile aujourd'hui, matériel indisponible, manque de temps, préférence personnelle, autre (douleur : jamais de diagnostic ni d'encouragement à continuer).
- **Décision (W-1)** :
  - **A. Immuabilité** : `training_programs`, une ligne par **version publiée** (`lineage_id` + `version`), jamais réécrite ; seuls avancent le statut (`active` → `superseded` / `ended`) et la date de fin (posée une fois). Une adaptation publie v+1, l'historique garde v1. Triggers sur `training_programs`, `workout_sessions` (prescription figée, jamais de changement de programme) et `planned_exercises` (aucune modification ; un upsert identique d'un second appareil est accepté).
  - **B. Types de données** : FACT, USER_REPORTED, RECOMMENDATION stockés, DERIVED jamais (table dans `docs/TRAINING_ARCHITECTURE.md` §2.6 et `TRAINING_DATA_KINDS`, testée).
  - **C. Raison de prescription** structurée (`purpose` + `purpose_target`) sur la séance et chaque exercice ; pas de texte libre.
  - **D. Préférences** : un remplacement répété (préférence, n'aime pas, technique inconnue) devient une question à l'utilisateur ; seule sa confirmation enregistre une préférence durable. Une gêne, une machine prise, un manque de temps ne deviennent jamais une préférence.
  - **E. Prévu vs réalisé** : `planned_exercises` (exercice, ordre, séries, fourchette, unité, repos, RPE cible, charge proposée ou nulle, action et raison de progression, raison, variante) relié à la séance (focus, durée prévue, durée adaptée, raison) et à la version ; le réalisé (`exercise_logs`, `exercise_substitutions`, `workout_sessions` : séries, répétitions ou secondes, charge, difficulté, statut, remplacement, raison déclarée, notes) pointe vers la prescription (`planned_exercise_id`).
  - **F.** Aucun second Adaptation Engine : le Workout Coach produit signaux et recommandations, `journey/adaptation.ts` décide.
  - **G.** Les deux bugs confirmés (fatigue codée en dur dans `ExerciseCard`, séance courte toujours de 15 min) sont corrigés en **W-3**, avec l'écran de séance ; W-1 ne touche pas l'UI.
  - **Étendre plutôt que doubler** : seules `training_programs` et `planned_exercises` sont nouvelles ; `workout_sessions`, `exercise_logs`, `exercise_substitutions`, `adjustments` sont étendues. Une seule table pour les programmes et leurs versions (une ligne = une version) plutôt que deux.
  - **Historique** : fonction `attach_reconstructed_training_history()` (RLS appliquée, idempotente) : un programme reconstitué par utilisateur, sans paramètre (contraintes), séances `prescription_source = 'unknown'`, aucune ligne `planned_exercises`. Même règle côté domaine (`reconstructedProgram`, `attachLegacySessions`).
- **Alternatives** :
  - réutiliser `workout_plans` pour les versions : refusé (un `jsonb` hebdomadaire `unique (user_id, week_start)` ne porte ni lignée, ni version, ni contraintes par paramètre) ; laissée en place, inutilisée, sa suppression est une décision séparée ;
  - une table `training_program_versions` séparée : refusé (une ligne par version suffit, la lignée regroupe les versions) ;
  - réécrire la prescription du jour lors d'une adaptation : refusé (A) ; la variante adaptée a ses propres lignes ;
  - autoriser la suppression logique d'une prescription : refusé ; seul l'effacement par l'utilisateur (Privacy Center, compte) supprime, ce qui n'est pas une réécriture.
- **Trade-offs** :
  - l'app n'écrit pas encore ces colonnes (W-2) ; jusque-là le comportement est inchangé ;
  - deux appareils hors connexion qui publient chacun une version : l'index « un seul actif » refuse la seconde, à résoudre en W-2 ;
  - `effective_from` d'un programme reconstitué = première séance connue au moment du rattachement ; une séance plus ancienne arrivée plus tard le rejoint sans changer cette date ;
  - l'adaptation du jour (`adapted_minutes`, `adaptation_reason`) est modifiable jusqu'à la fin de la séance (un utilisateur peut passer de « courte » à « allégée » avant de commencer ; les deux prescriptions restent).
- **Date** : 2026-10-02

## D-032 — Workout Coach W-2 : publication, stockage local, sync et conflits

- **Contexte** : demande de W-2 seul par Souhayb le 2026-10-02 (W-1 validé) : publier et relire la prescription, versionner, idempotence, conflit multi-appareil, hors connexion, historique reconstitué, variantes, hors programme, reports, erreurs structurées. Détail : `docs/TRAINING_ARCHITECTURE.md` §4–6.
- **Décision** :
  - **Publication** : `usePlan` lit l'existant ; sinon `ensureProgram` publie, `ensureWeek` fige la semaine, puis l'app relit la prescription enregistrée (`plan.sessionTemplate`). Le moteur ne sert plus qu'à proposer (hors programme).
  - **Ids stables** (`trainingIds`) dérivés du compte, de la version, de `date#index`, de la variante et de la position : un redémarrage, une nouvelle tentative, un plantage ou un second appareil produisent les mêmes ids.
  - **Déclencheurs de version** (`versionReason`) : fréquence (adaptation si décision `adjustments`), matériel, objectif, niveau, durée, exercices exclus, version du moteur, reprise. Rien d'autre. Première version effective au début de la semaine, les suivantes à partir d'aujourd'hui.
  - **Source de vérité** : programmes et prescriptions = serveur (immuables), la copie locale est un cache ; réalisé = local d'abord (modification en attente gagne), puis serveur ; dérivé jamais stocké.
  - **Conflit** : programme, le serveur gagne (sauf fermeture locale d'une version inchangée sur le serveur, vérifiée à trois points) ; même id avec paramètres différents → version locale perdue, séances non commencées et non poussées re-prescrites ; plusieurs actives → la plus haute gagne, à égalité le serveur ; la perdante est abandonnée (locale, sans séance commencée) ou fermée ; colonnes de prescription d'une séance toujours celles du serveur ; puis réévaluation et éventuelle v+1. Les faits ne sont jamais abandonnés.
  - **Report** : la séance d'origine garde sa prescription (`rescheduled`, `rescheduled_to`), une copie est créée à la nouvelle date (contrainte W-1).
  - **Hors programme** : `prescription_source = 'off_plan'`, aucune prescription inventée. Les séances antérieures sont rattachées par `attach_reconstructed_training_history()`, appelée avant le pull tant que nécessaire.
  - **Erreurs** : `conflict`, `offline`, `rls`, `validation`, `server`, `invalid_data` (phase, table, nombre), jamais montrées en détail technique.
  - **Stockage local v4** : relecture complète du compte une fois après la mise à jour.
  - **Charge proposée** : progression sur l'historique réel, sinon `null`.
- **Alternatives** : ids aléatoires (refusé : doublons après une nouvelle tentative ou sur un second appareil) ; dernière écriture gagne pour les programmes (refusé : écraserait silencieusement le serveur) ; réécrire la séance reportée (refusé : la prescription d'origine doit rester) ; une migration W-2 (inutile, le schéma W-1 suffit).
- **Trade-offs** : une séance avec faits enregistrée sous une version perdante adopte la prescription du serveur si la même séance existe, sinon sa prescription locale est poussée sous la version du serveur ; collision de clé laissant une ligne serveur `planned` ; jours passés encore affichés depuis le planning courant (W-6) ; anciennes versions de l'app ignorent `superseded` ; aucune purge locale ; charge proposée avec fatigue « normale » (W-4) ; `SHORT_SESSION_MINUTES` = 15 (bug W-3) ; avant le premier pull la lignée dépend de la graine (`local` ou compte), ce qui peut créer une version de plus, puis converge.
- **Date** : 2026-10-02

## D-033 — Workout Coach : le serveur gagne pour le futur, la prescription utilisée gagne pour l'histoire

- **Contexte** : revue W-2, points 3 et 4. Souhayb (2026-10-02) : une séance commencée ou contenant des faits ne doit jamais être rattachée après coup à une prescription différente de celle réellement présentée. Avec D-032, une séance avec faits enregistrée sous une version perdante prenait la prescription du serveur si celui-ci avait la même séance ; une collision `date#index` laissait la ligne du serveur `planned`. Détail : `docs/TRAINING_ARCHITECTURE.md` §5.
- **Décision** :
  - **Deux règles** : convergence de la sync (le serveur décide de la version active future) ; préservation de l'histoire (une prescription déjà utilisée reste liée aux faits produits sous elle).
  - **Séance utilisée** : ouverte (`workout_sessions.started_at`, enregistré quand l'écran de séance montre la prescription le jour même ou après), une série, un remplacement, une issue ou une difficulté. Sa prescription devient historique ; un conflit ne peut plus la remplacer. Ouvrir n'empêche pas de reporter (la copie garde la même prescription).
  - **Version perdante mais utilisée** : conservée, fermée (`superseded`, statut existant, aucune migration), sous sa propre lignée dérivée de son contenu (`trainingIds.archivedLineage`) car `(lineage_id, version)` est unique. Les séances utilisées sont gardées sous de nouveaux ids stables avec un contenu identique (`keptSession`), toujours `prescription_source = 'engine'`, jamais `off_plan`. La version du serveur reste la seule active.
  - **Même séance prescrite deux fois** (même version, autre prescription sur le serveur) : la séance utilisée est gardée sous `trainingIds.kept`, même version.
  - **Collision `date#index`** : la séance utilisée est celle du créneau ; une séance seulement prévue en face devient `superseded` (gardée, jamais comptée). Deux séances utilisées : les deux sont gardées ; la plus petite id garde le créneau sur tous les appareils, l'autre est affichée dans un créneau libre du même jour (`sessionSlots`, local) et sa ligne serveur garde sa date et son index.
- **Alternatives** :
  - un statut `conflict_archived` : refusé (migration et nouveau statut inutiles, `superseded` suffit) ;
  - supprimer la version perdante ou ses séances : refusé (perte de faits) ;
  - marquer la séance `off_plan` : refusé (elle était prescrite) ;
  - garder la version perdante dans la même lignée avec un autre numéro : refusé (l'ordre des numéros décide de la version active).
- **Trade-offs** : une version archivée apparaît comme une seconde « v2 » dans une autre lignée ; deux séances réelles pour le même créneau comptent chacune une fois (ce sont deux séances), la seconde dans un créneau `#6` sans modèle de séance associé jusqu'à l'historique W-6 ; ouvrir une séance future (avant son jour) ne l'enregistre pas comme vue.
- **Date** : 2026-10-02

## D-034 — Workout Coach W-3 : la séance réelle (saisie, durées, remplacement, issue)

- **Contexte** : demande de W-3 seul par Souhayb le 2026-10-06 (W-2 et D-033 validés) : l'écran de séance réel, la saisie rapide, la correction, le minuteur, le remplacement avec raison, l'exercice non fait, le résumé, et les deux bugs confirmés (fatigue codée en dur dans `ExerciseCard`, séance courte annoncée 20 min qui en exécutait 15). Détail : `docs/WORKOUT_ENGINE.md` §8, `docs/TRAINING_ARCHITECTURE.md` §7.2.
- **Décision** :
  - **Moteur de séance** (`training/session.ts`, fonctions pures) : l'écran lit la prescription enregistrée et les faits, jamais le profil. Statut d'exercice, progression et issue de séance sont **dérivés**, jamais stockés.
  - **Prévu ≠ fait** : « Proposé : 70 kg × 8–10 » vient de `planned_exercises` ; « Réalisé » vient des séries ; « Dernière fois » vient de la meilleure série réelle de la séance précédente avec cet exercice (sinon rien).
  - **Préremplissage** (aucune charge inventée), dans l'ordre : série précédente du jour → charge proposée par la prescription → charge réelle de la dernière fois → 0 pour un exercice au poids du corps → champ vide. Un exercice chargé sans charge saisie est refusé avec un message (« 0 si tu n'en as pas pris »).
  - **Bug fatigue (ExerciseCard supprimé)** : plus aucune décision de progression pendant la séance (`suggestProgression` retiré de l'UI, W-4). La fatigue du jour et la sécurité viennent de `JourneyState` : fatigue élevée ou `training_load` + hausse prévue → la charge de la dernière fois est préremplie avec la phrase « garder la charge » ; la prescription n'est pas modifiée.
  - **Trois notions distinctes** : difficulté d'un exercice (facultative, après sa dernière série, `exercise_reports.difficulty`) ; difficulté de la séance (une question dans le résumé, `workout_sessions.difficulty`) ; fatigue du jour (Journey, `daily_checkins`, inchangée). Échelle en 5 mots (Très facile … Très difficile) stockée 1–5. Ressenti facultatif d'une série en 3 mots (Facile, Correct, Très difficile) stocké en RPE 6 / 8 / 10 (échelle des répétitions en réserve).
  - **Séries** : charge + répétitions, ou charge + secondes pour un maintien (`{ reps: 0, seconds }` en local, `reps null, seconds` sur le serveur). Correction et suppression : `editSet` / `deleteSet` ; la sync supprime (soft delete) les lignes en trop **seulement** si la séance est encore projetée (`deleteOnMissing: 'with_session'`), et le pull applique les suppressions puis compacte.
  - **Durées, une seule source** (`training/durations.ts`, `SESSION_DURATION`) : courte 15, minimale 20, plus courte 10, choix 10/15/20/30/45/60. Le Daily Coach annonce `plannedVariantMinutes` (variante stockée → sa durée ; sinon courte = minutes demandées bornées par la séance prévue ; allégée = estimation des lignes qu'elle construira) ; l'écran construit la variante avec ces mêmes minutes (`adaptSession({ minutes })`) et les stocke (`adapted_minutes`) ; ensuite tout le monde lit la valeur stockée.
  - **Courte ≠ allégée** : courte = les exercices essentiels dans l'ordre, repos ≤ 60 s, échauffement de 4 min, ajustée aux minutes, charges gardées ; allégée = ~60 % des séries, RPE ≤ 6, charges gardées sauf une hausse prévue (jamais de hausse un jour allégé). Une variante stockée n'est jamais recréée ; ce n'est jamais une coupure après N minutes.
  - **Remplacement** : seulement à la demande, avant la première série de l'exercice ; raison d'abord, puis alternatives, l'utilisateur choisit ; prévu, réalisé et raison enregistrés ; annulable tant qu'aucune série. Gêne → jamais « continue » : remplacer, ne pas faire l'exercice ou terminer la séance ici ; technique inconnue → consignes et alternative plus simple, jamais une préférence ; machine prise → ponctuel. Préférence : observation répétée → question en fin de séance → confirmation → exercice exclu du profil (nouvelle version, D-032) ; « le garder » ne redemande qu'après de nouvelles occurrences.
  - **« Je ne fais pas cet exercice »** : nouvelle table `exercise_reports` (`not_performed`, raison de la liste fermée, difficulté 1–5), la prescription reste.
  - **Issue de séance** : `completed` / `partial` (dérivé) / `stopped` (terminée plus tôt avec une raison : `workout_sessions.status = completed` + `outcome_reason`) / `skipped`. Jamais « échec ».
  - **Minuteur de repos** : état en mémoire sur des horodatages (`useWorkoutUi`), démarre après une série, ignorer / +30 s / pause / reprise, continue d'un écran à l'autre, jamais bloquant.
  - **Écriture locale** : un échec d'écriture sur l'appareil est signalé (bannière) sans perdre la séance en mémoire ; la prochaine écriture réessaie.
- **Alternatives** :
  - difficulté demandée à chaque série : refusé (trop de questions, une main) ;
  - fatigue demandée en fin de séance : refusé (une seule source de fatigue, le Journey) ;
  - « non fait » stocké dans `planned_exercises` : refusé (prescription immuable) ;
  - couper la séance complète après 15 min : refusé (demande explicite) ;
  - charge proposée recalculée pendant la séance : refusé (W-4, et la prescription fait foi).
- **Trade-offs** : une séance hors programme n'a pas de `started_at` (durée « Donnée indisponible » dans le résumé) ; `keptExercises` reste local ; le remplacement n'est proposé qu'avant la première série ; la correspondance mots → RPE est une convention à faire relire ; la migration `20261006000001` doit être appliquée sur Supabase avant toute version de l'app contenant W-3 (le pull de `exercise_reports` échoue sinon).
- **Date** : 2026-10-06
