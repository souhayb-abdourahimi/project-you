# Intégrations

Toutes passent par les interfaces de `src/providers/types.ts`. Câblage : `src/providers/index.ts` (registre importé par les features). Ce qui n'est pas branché reste dans `src/providers/unavailable.ts` (tout renvoie `unavailable`, rien n'est inventé) ; `mock-food.ts` = catalogue MOCK.

| Provider | Cible | Phase | Notes |
|---|---|---|---|
| FoodProvider | CIQUAL (import) | 2 | licence Etalab |
| ProductProvider | Open Food Facts | 2 | code-barres, confiance moyenne, confirmation utilisateur |
| CalendarProvider | **branché** : calendrier de l'appareil via `expo-calendar` (EventKit / Android) | 2 | D-016 : lecture des heures occupées seulement ; écriture dans un calendrier « Project You » dédié ; jamais d'édition d'événements personnels ; web non supporté |
| HealthProvider | HealthKit, Health Connect | 2 | lecture seule, permissions granulaires, déconnexion |
| GymProvider / StoreProvider | **branchés** : OpenStreetMap (Overpass) | 2 | D-017 : position arrondie, source + date affichées, champs absents = « Donnée indisponible » ; pas de fréquentation |
| LocationProvider | **branché** : `expo-location` (premier plan, à la demande) | 2 | position jamais enregistrée ni synchronisée |
| PlacesProvider / SportsProvider | OpenStreetMap | 2 | non branchés |
| PriceProvider / PromotionProvider | à choisir | 3 | uniquement données réelles |
| NotificationProvider | expo-notifications | MVP (M-18) | local, par catégorie |
| AIProvider | Edge Function `ai-coach` | 2–3 | clé côté serveur, sorties structurées |

Chaque provider gère : authentification, erreurs, timeout, retry, cache, rate limit, absence de données, changement de fournisseur. Avant d'intégrer : vérifier la doc officielle et l'existence d'un Skill/MCP adapté.
