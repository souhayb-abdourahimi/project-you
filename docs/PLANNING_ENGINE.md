# Moteur de planification

Code : `src/domain/planning/engine.ts`. Tests : `planning/__tests__/`.

## Entrées

Créneaux libres et contraintes fixes (saisis à l'onboarding, calendrier réel en phase 2), séances/sem, durée, salle oui/non, **trajet saisi par l'utilisateur** (jamais estimé par nous).

## Algorithme

1. Temps libre par jour = créneaux − contraintes.
2. Option du jour : salle si le plus long créneau ≥ durée + 2 × trajet ; sinon maison si ≥ durée ; sinon séance courte maison si ≥ 15 min.
3. Choix des jours : toutes les combinaisons (≤ 35) notées par qualité (salle 3, maison 2, courte 1) avec pénalité pour deux jours consécutifs.
4. Séance placée au début du créneau (+ trajet).
5. Préparation des repas (60 min) le jour sans séance le plus libre, courses (30 min) la veille si possible.
6. Jours sans séance = repos.

Avertissements : `needs_availability` (pas de créneaux : jours répartis sans heure, jamais d'horaire inventé), `fewer_sessions_than_requested`, `home_fallback_used`.

## Report intelligent

`rescheduleOptions` : prochains jours libres de la semaine qui peuvent accueillir la séance (complète ou courte).

## Anti-abandon (`motivation/anti-abandon.ts`)

Check-in (énergie, motivation, fatigue, temps) → options ordonnées : repos, marche, mobilité, version allégée, séance courte, report. 1 jour manqué → reprise simple ; ≥ 3 → reprise douce ; planning impossible → replanification. La régularité se compte en **semaines** : un jour manqué ne casse rien.
