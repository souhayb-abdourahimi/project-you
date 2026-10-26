# Sources de données

**Règle : ne jamais inventer une donnée externe.** Sans donnée réelle → « Donnée indisponible » ou alternative clairement identifiée. Toute donnée de démonstration porte `isMock: true` et s'affiche avec le badge **MOCK**.

## Métadonnées obligatoires

Toute donnée externe importante transporte `ExternalDataMeta` (`src/domain/shared/external.ts`) :

`provider` · `externalId` · `source` · `fetchedAt` · `updatedAt` · `confidence` (`high` / `medium` / `low`) · `isMock`.

## Sources par domaine

| Donnée | Source prévue | Statut | Remarques |
|---|---|---|---|
| Composition des aliments génériques | **Ciqual 2025 (ANSES)**, Licence Ouverte Etalab (D-020) | **importé** (36 aliments) | référence française officielle ; provenance détaillée ci-dessous |
| Produits emballés (code-barres) | **Open Food Facts** (ODbL) | phase 2 | collaboratif : `confidence: medium`, afficher la source, permettre correction |
| Recettes | éditoriales Project You | interne | nutrition **calculée** à partir des valeurs Ciqual de chaque ingrédient, affichée comme estimation |
| Exercices | bibliothèque éditoriale Project You | interne | consignes générales ; vidéos/illustrations seulement de source légitime |
| Prix, promotions | aucun fournisseur fiable choisi | indisponible | pas de prix affiché au MVP ; saisie utilisateur (ticket) possible |
| Magasins, salles, lieux sportifs | **Geoapify Places** (données OpenStreetMap) via `places-nearby`, secours **Overpass** (`PlacesProvider`, D-017/D-019/D-051) | branché | Geoapify plan Free (clé serveur `GEOAPIFY_API_KEY`) ; Overpass public = secours best-effort |
| Fréquentation des salles | aucune | indisponible | jamais inventée ; on optimise seulement selon horaires/planning |
| Sécurité d'un parcours | aucune par défaut | indisponible | jamais « safe/dangerous » ; seulement données publiques sourcées et datées |
| Calendrier | EventKit (iOS), Google Calendar | phase 2 | MVP : créneaux saisis manuellement |
| Santé | **Apple Santé (HealthKit), Health Connect** (D-018) | phase 2, branché (non testé sur appareil) | lecture seule de 4 types, gardé sur l'appareil, confiance `high` (mesures de l'utilisateur) |

## Table Ciqual 2025 (D-020)

| | |
|---|---|
| Éditeur | ANSES (Agence nationale de sécurité sanitaire de l'alimentation, de l'environnement et du travail) |
| Jeu de données | Table de composition nutritionnelle des aliments Ciqual 2025 |
| Fichier | `data/ciqual/Table_Ciqual_2025_FR_2025_11_03.xlsx`, copie **non modifiée** |
| SHA-256 | `5555c572fa3735991298d832d0427788fa69a11b4fd20a5d580d58942369fbb0` |
| Version | 2025-11-03 (nom du fichier) ; métadonnées internes : créé le 2025-11-06 |
| Site officiel | https://ciqual.anses.fr/ |
| Licence | Licence Ouverte / Open Licence (Etalab) : réutilisation libre avec mention de la source |
| Obtention | fourni par le propriétaire du projet le 2026-10-01 comme fichier officiel. Le site de l'ANSES n'est pas joignable depuis l'environnement de développement : l'empreinte n'a **pas** pu être comparée à un téléchargement direct |
| Mention affichée | « Valeurs nutritionnelles : estimations d'après la table Ciqual 2025 de l'ANSES. » (écran Nutrition et détail des recettes) |

**Structure vérifiée par le script avant import** (`scripts/ciqual/import_ciqual.py`, refus si un point échoue) :

- empreinte SHA-256 identique à celle ci-dessus ;
- deux feuilles exactement : « composition nutritionnelle » (3 484 aliments, 84 colonnes) et « codes INFOODS » ;
- chaque composant utilisé existe dans « codes INFOODS » et correspond à une seule colonne ;
- `alim_code` numérique et unique sur les 3 484 lignes ; chaque code associé existe ;
- chaque cellule suit une convention connue, sinon l'import échoue.

**Composants extraits** (tous pour 100 g) : énergie « Règlement UE N° 1169/2011 » en kcal, protéines (N × facteur de Jones), glucides, lipides, fibres, polyols, alcool, acides organiques. Les 4 premiers servent aux calculs ; les autres servent au contrôle de cohérence de l'énergie.

**Conventions des cellules** (texte brut conservé à côté de la valeur dans `foods.generated.json`) :

| Cellule | Valeur utilisée | Statut |
|---|---|---|
| `12,5` (virgule décimale) | 12.5 | `value` |
| `-` ou vide | aucune | `missing` |
| `traces` | 0 | `traces` |
| `< 0,5` (sous la limite de quantification) | 0 | `below_limit` |
| autre format | import refusé | — |

**Valeurs manquantes** : aucune sur l'énergie et les 3 macronutriments des 36 aliments retenus. Un aliment auquel il manquerait l'une de ces valeurs serait exclu du catalogue (jamais complété), et un test échouerait. Manquent seulement des polyols ou acides organiques pour quelques aliments (comptés 0 dans le seul contrôle de cohérence).

**Ce qui est éditorial (Project You, pas Ciqual)** : l'association aliment → code (`src/domain/meals/ciqual/mapping.json`), le nom court affiché, la catégorie, les allergènes, l'origine animale (Ciqual ne les décrit pas) et la masse moyenne d'une pièce (œuf 55 g, banane 120 g, pomme 150 g). Ces champs sont relus par les tests de contraintes (vegan, allergies).

**Mettre à jour la table** : déposer le nouveau fichier dans `data/ciqual/`, mettre à jour `SOURCE`, `SOURCE_SHA256` et `EXPECTED_ROWS` dans le script en connaissance de cause, `npm run ciqual:import`, relire le diff de `foods.generated.json`, puis `npm run check`. La CI lance `npm run ciqual:check` (le fichier généré doit correspondre exactement à la source).

## Geoapify Places : source principale des lieux (D-051)

Lu le 2026-10-26 dans la documentation et la spécification OpenAPI de Geoapify, et sur la page des tarifs.

- **Plan Free** : 3 000 crédits par jour, jusqu'à 5 requêtes par seconde, sans carte bancaire, usage commercial autorisé. Une recherche de lieux coûte 1 crédit par tranche de 20 lieux : l'app en demande 20, donc **1 crédit par recherche** (et le cache de 10 min évite les répétitions). Le quota est « souple » : Geoapify contacte le compte qui le dépasse souvent ; le code d'erreur exact d'un quota épuisé n'est pas documenté (402, ou 429 avec un message de crédits : les deux sont traités comme « limite du jour »).
- **Appel** : `GET https://api.geoapify.com/v2/places` avec `categories`, `filter=circle:lon,lat,rayon`, `bias=proximity:lon,lat`, `limit=20`, `lang`, `apiKey`. **Uniquement depuis la fonction `places-nearby`** : la clé est un secret serveur (`Deno.env.get('GEOAPIFY_API_KEY')`), jamais dans `EXPO_PUBLIC_*`, le bundle PWA, le stockage local ni le code client.
- **Catégories** (noms Geoapify, vérifiés dans la spécification) : salles `sport.fitness.fitness_centre`, `sport.fitness.gym` (`sport.fitness.fitness_station`, agrès d'extérieur, exclu) ; alimentation `commercial.supermarket`, `commercial.convenience`, `commercial.food_and_drink.fruit_and_vegetable`, `commercial.food_and_drink.health_food`, `commercial.marketplace` (même périmètre que la requête OpenStreetMap).
- **Réponse** : GeoJSON ; l'app garde `place_id`, `name`, `lat`/`lon`, `distance` (sinon calculée à vol d'oiseau), l'adresse seulement si une rue existe, `opening_hours` et `website` tels quels quand la source les a. Rien d'inventé : un lieu sans nom ou sans position est écarté. Pas de note, pas d'équipement.
- **Attribution** : « Powered by Geoapify · © OpenStreetMap contributors (ODbL) », affichée sous chaque liste.
- **Confidentialité** : position arrondie à ~100 m sur l'appareil puis de nouveau sur le serveur, ni stockée ni journalisée ; cache serveur 10 min par zone arrondie.
- **Ordre** : cache → quota par utilisateur → Geoapify (1 requête) → si échec (délai, 5xx, trop de demandes, quota, clé refusée) Overpass une fois (requête couverte ci-dessous, 2 instances au plus) → message précis. Jamais de boucle. Sans clé : Overpass seul.

## Serveurs OpenStreetMap publics (D-019) : secours best-effort

Lu le 2026-10-01 sur les pages officielles ; à revérifier avant chaque changement de volume.

- **Overpass** (`overpass-api.de`, utilisé pour les lieux) :
  - Usage ponctuel : moins de 10 000 requêtes et 1 Go par jour.
  - Application qui l'appelle régulièrement : diviser par 100, soit environ **100 requêtes et 10 Mo par jour**.
  - Usage commercial : instance auto-hébergée ou payante.
  - Sur une erreur 429 ou 406 : attendre avant de réessayer.
  - **Depuis le 2026-04-19** (relu le 2026-10-25, D-046) : une application sans User-Agent identifiant reçoit 406, un navigateur doit envoyer un Referer, une partie des plages AWS / Azure est bloquée. L'app envoie `User-Agent: ProjectYou/<version> (…)` en natif (un navigateur interdit de le changer) et garde le Referer sur le web (`strict-origin-when-cross-origin`).
  - Repli : une seule instance publique de secours, `overpass.private.coffee`, essayée une fois sur 429, 5xx, délai ou panne réseau ; jamais sur une requête refusée (400). Aucune boucle, aucune erreur mise en cache.
  - Limites côté app : délai serveur 10 s (`[timeout:10]`), délai client 14 s, 250 éléments au plus lus, les 30 plus proches affichés, cache 10 min des réponses réussies, une même recherche en cours partagée.
  - **Mesure du 2026-10-26 (D-048)** depuis un runner GitHub : 15 requêtes sur 16 sans réponse en 30 s, 1 réponse 502 « server currently busy » en 174 ms, sur les deux instances, pour l'ancienne comme la nouvelle requête. Les instances publiques étaient saturées ou limitaient ces adresses ; non mesuré depuis une IP résidentielle (`node scripts/places/measure-overpass.mjs`).
  - **Fonction `places-nearby` (D-048)** quand un compte est configuré : User-Agent identifiant (`ProjectYou/1.0 (…; +https://github.com/souhayb-abdourahimi/project-you)`), `[timeout:8]`, `[maxsize]` 16 Mo, 200 éléments au plus, une instance de repli, quota par utilisateur, cache 10 min en mémoire par zone arrondie. Position arrondie à ~100 m, ni stockée ni journalisée.
- **Nominatim** (`nominatim.openstreetmap.org`, géocodage, **non utilisé**) :
  - 1 requête par seconde maximum.
  - User-Agent ou Referer identifiant l'application.
  - Cache obligatoire.
  - Attribution visible.
  - **Autocomplétion interdite**, ainsi que les requêtes systématiques.
  - Usage plus important : fournisseur tiers ou instance propre.
- **Attribution ODbL** : « © les contributeurs OpenStreetMap ». La source est affichée sous chaque liste de lieux.

**Conséquence** :
- Ces serveurs ne sont plus la source principale (D-051) : ils servent de secours quand Geoapify n'est pas configuré ou échoue, et en mode local (sans compte).
- L'UI et le moteur n'ont pas à changer d'une source à l'autre (`PlacesProvider`).

## Calendrier iCal de l'utilisateur (D-049)

Source fournie par l'utilisateur (son propre lien) : seules les plages occupées sont lues et gardées, avec la date de lecture. Pas de métadonnées de fournisseur : ce n'est pas une donnée externe publique. Détails : `docs/CALENDAR_FEED.md`.

## Formules (données internes, pas externes)

Les formules utilisées par les moteurs (Mifflin-St Jeor, facteurs d'activité, fourchettes de protéines) sont documentées avec leurs références dans `NUTRITION_ENGINE.md`.
