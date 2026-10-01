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
