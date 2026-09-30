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
| Magasins, salles, lieux sportifs | Google Places / OpenStreetMap (à évaluer) | phase 2 | horaires et adresses du fournisseur, avec date |
| Fréquentation des salles | aucune | indisponible | jamais inventée ; on optimise seulement selon horaires/planning |
| Sécurité d'un parcours | aucune par défaut | indisponible | jamais « safe/dangerous » ; seulement données publiques sourcées et datées |
| Calendrier | EventKit (iOS), Google Calendar | phase 2 | MVP : créneaux saisis manuellement |
| Santé | HealthKit, Health Connect | phase 2 | lecture seule, permissions granulaires |

## Formules (données internes, pas externes)

Les formules utilisées par les moteurs (Mifflin-St Jeor, facteurs d'activité, fourchettes de protéines) sont documentées avec leurs références dans `NUTRITION_ENGINE.md`.
