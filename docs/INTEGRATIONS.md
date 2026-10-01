# Intégrations

Toutes passent par les interfaces de `src/providers/types.ts`. Câblage : `src/providers/index.ts` (registre importé par les features). Ce qui n'est pas branché reste dans `src/providers/unavailable.ts` (tout renvoie `unavailable`, rien n'est inventé) ; `ciqual-food.ts` = recherche dans le catalogue issu de Ciqual 2025 (D-020).

| Provider | Cible | Phase | Notes |
|---|---|---|---|
| FoodProvider | CIQUAL (import) | 2 | licence Etalab |
| ProductProvider | Open Food Facts | 2 | code-barres, confiance moyenne, confirmation utilisateur |
| CalendarProvider | **branché** : calendrier de l'appareil via `expo-calendar` (EventKit / Android) | 2 | D-016 : lecture des heures occupées seulement ; écriture dans un calendrier « Project You » dédié ; jamais d'édition d'événements personnels ; web non supporté |
| HealthProvider | **branché** : Apple Santé (`@kingstinct/react-native-healthkit`), Health Connect (`react-native-health-connect`), rien sur le web | 2 | D-018 : lecture seule de 4 types, gardé sur l'appareil ; build de développement requis (pas Expo Go) ; non testé sur appareil réel (`docs/MOBILE_HEALTH_TEST_PLAN.md`) |
| PlacesProvider (+ Gym/Store) | **branché** : OpenStreetMap (Overpass) | 2 | D-017/D-019 : seul point d'entrée de l'UI (`places.nearby(kind, …)`) ; instance publique pour dev/bêta seulement |
| MapsProvider | **branché** : openstreetmap.org | 2 | `maps.open(point)` ; aucune URL de carte dans les features |
| LocationProvider | **branché** : `expo-location` (premier plan, à la demande) | 2 | position jamais enregistrée ni synchronisée |
| SportsProvider | OpenStreetMap | 2 | non branché (parcs, activités) |
| PriceProvider / PromotionProvider | à choisir | 3 | uniquement données réelles |
| NotificationProvider | expo-notifications | MVP (M-18) | local, par catégorie |
| AIProvider | Edge Function `ai-coach` | 2–3 | clé côté serveur, sorties structurées |

Chaque provider gère : authentification, erreurs, timeout, retry, cache, rate limit, absence de données, changement de fournisseur. Avant d'intégrer : vérifier la doc officielle et l'existence d'un Skill/MCP adapté.
