# Sources de données

**Règle : ne jamais inventer une donnée externe.** Sans donnée réelle → « Donnée indisponible » ou alternative clairement identifiée. Toute donnée de démonstration porte `isMock: true` et s'affiche avec le badge **MOCK**.

## Métadonnées obligatoires

Toute donnée externe importante transporte `ExternalDataMeta` (`src/domain/shared/external.ts`) :

`provider` · `externalId` · `source` · `fetchedAt` · `updatedAt` · `confidence` (`high` / `medium` / `low`) · `isMock`.

## Sources par domaine

| Donnée | Source prévue | Statut | Remarques |
|---|---|---|---|
| Composition des aliments génériques | **CIQUAL (ANSES)**, licence ouverte Etalab | à importer (TODO) | référence française officielle |
| Produits emballés (code-barres) | **Open Food Facts** (ODbL) | phase 2 | collaboratif : `confidence: medium`, afficher la source, permettre correction |
| Catalogue aliments de démonstration | `src/domain/meals/catalog.ts` | **MOCK** | valeurs approximatives de démonstration ; à remplacer par CIQUAL avant bêta |
| Recettes | éditoriales Project You | interne | nutrition **calculée** à partir des aliments (donc MOCK tant que le catalogue l'est) |
| Exercices | bibliothèque éditoriale Project You | interne | consignes générales ; vidéos/illustrations seulement de source légitime |
| Prix, promotions | aucun fournisseur fiable choisi | indisponible | pas de prix affiché au MVP ; saisie utilisateur (ticket) possible |
| Magasins, salles, lieux sportifs | **OpenStreetMap via Overpass** (`PlacesProvider`, D-017/D-019) | phase 2, branché | instance publique = dev/bêta seulement ; fournisseur de production à choisir |
| Fréquentation des salles | aucune | indisponible | jamais inventée ; on optimise seulement selon horaires/planning |
| Sécurité d'un parcours | aucune par défaut | indisponible | jamais « safe/dangerous » ; seulement données publiques sourcées et datées |
| Calendrier | EventKit (iOS), Google Calendar | phase 2 | MVP : créneaux saisis manuellement |
| Santé | **Apple Santé (HealthKit), Health Connect** (D-018) | phase 2, branché (non testé sur appareil) | lecture seule de 4 types, gardé sur l'appareil, confiance `high` (mesures de l'utilisateur) |

## Serveurs OpenStreetMap publics (D-019)

Lu le 2026-10-01 sur les pages officielles ; à revérifier avant chaque changement de volume.

- **Overpass** (`overpass-api.de`, utilisé pour les lieux) :
  - Usage ponctuel : moins de 10 000 requêtes et 1 Go par jour.
  - Application qui l'appelle régulièrement : diviser par 100, soit environ **100 requêtes et 10 Mo par jour**.
  - Usage commercial : instance auto-hébergée ou payante.
  - Sur une erreur 429 ou 406 : attendre avant de réessayer.
- **Nominatim** (`nominatim.openstreetmap.org`, géocodage, **non utilisé**) :
  - 1 requête par seconde maximum.
  - User-Agent ou Referer identifiant l'application.
  - Cache obligatoire.
  - Attribution visible.
  - **Autocomplétion interdite**, ainsi que les requêtes systématiques.
  - Usage plus important : fournisseur tiers ou instance propre.
- **Attribution ODbL** : « © les contributeurs OpenStreetMap ». La source est affichée sous chaque liste de lieux.

**Conséquence** :
- Ces serveurs conviennent au développement et à une bêta fermée, pas à la production.
- Avant le lancement, choisir et brancher derrière `PlacesProvider` une instance auto-hébergée ou un fournisseur sous contrat.
- L'UI et le moteur n'ont pas à changer.

## Formules (données internes, pas externes)

Les formules utilisées par les moteurs (Mifflin-St Jeor, facteurs d'activité, fourchettes de protéines) sont documentées avec leurs références dans `NUTRITION_ENGINE.md`.
