# Intégrations

Toutes passent par les interfaces de `src/providers/types.ts`. Câblage actuel : `src/providers/unavailable.ts` (tout renvoie `unavailable`, rien n'est inventé) et `mock-food.ts` (catalogue MOCK).

| Provider | Cible | Phase | Notes |
|---|---|---|---|
| FoodProvider | CIQUAL (import) | 2 | licence Etalab |
| ProductProvider | Open Food Facts | 2 | code-barres, confiance moyenne, confirmation utilisateur |
| CalendarProvider | EventKit (iOS), Google Calendar | 2 | accès explicite ; événements de l'app marqués `createdByApp` ; jamais d'édition d'événements personnels |
| HealthProvider | HealthKit, Health Connect | 2 | lecture seule, permissions granulaires, déconnexion |
| PlacesProvider / GymProvider / SportsProvider / StoreProvider | Google Places ou OpenStreetMap | 2 | source + date affichées ; pas de fréquentation inventée |
| PriceProvider / PromotionProvider | à choisir | 3 | uniquement données réelles |
| NotificationProvider | expo-notifications | MVP (M-18) | local, par catégorie |
| AIProvider | Edge Function `ai-coach` | 2–3 | clé côté serveur, sorties structurées |

Chaque provider gère : authentification, erreurs, timeout, retry, cache, rate limit, absence de données, changement de fournisseur. Avant d'intégrer : vérifier la doc officielle et l'existence d'un Skill/MCP adapté.
