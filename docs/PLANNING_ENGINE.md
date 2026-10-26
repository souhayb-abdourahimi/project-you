# Moteur de planification

Code : `src/domain/planning/engine.ts`. Tests : `planning/__tests__/`.

## Entrées

Créneaux libres et contraintes fixes (saisis à l'onboarding), séances/sem, durée, salle oui/non, **trajet saisi par l'utilisateur** (jamais estimé par nous), et le **calendrier actif** de la semaine (`calendar.busy` : calendrier de l'appareil ou lien iCal, horaires seulement, D-049/D-050).

## Disponibilités effectives (D-050)

`effectiveAvailability(schedule, calendarActive)` (pure, jamais écrite dans le profil) :
- disponibilités saisies → elles, **toujours prioritaires** ;
- aucune saisie et un calendrier actif → fenêtre automatique **07:00–22:00** chaque jour ;
- ni l'un ni l'autre → aucune (ancien comportement : jours répartis sans heure, `needs_availability`).

Les plages occupées du calendrier s'ajoutent aux contraintes fixes et sont soustraites dans les deux premiers cas. Les événements « journée entière » sont ignorés ; un événement qui passe minuit bloque la fin de soirée et le début du lendemain.

## Algorithme

1. Temps libre par jour = créneaux − contraintes.
2. Option du jour : chaque trou est évalué (salle si ≥ durée + 2 × trajet, sinon maison si ≥ durée, sinon séance courte maison si ≥ 15 min) ; le meilleur du jour est la salle avant la maison avant la séance courte, puis le plus **confortable** (marge autour de la séance, plafonnée à 30 min : un trou exactement serré passe en dernier), puis le plus tôt.
3. Choix des jours : toutes les combinaisons (≤ 35) notées par qualité (salle 3, maison 2, courte 1) et confort, avec pénalité pour deux jours consécutifs. Déterministe : mêmes entrées, même planning.
4. Placement dans le trou : disponibilités saisies → au début (+ trajet), comme avant ; fenêtre automatique → au milieu du trou (arrondi à 5 min), pour laisser de la marge avant et après les événements. Le trajet aller et retour reste toujours dans le trou : jamais avant 07:00 ni après 22:00 en mode automatique, jamais sur un événement.
5. Préparation des repas (60 min) le jour sans séance le plus libre, courses (30 min) la veille si possible (seulement avec des disponibilités saisies).
6. Jours sans séance = repos.

Avertissements : `needs_availability` (pas de créneaux : jours répartis sans heure, jamais d'horaire inventé), `fewer_sessions_than_requested`, `home_fallback_used`, `no_free_slot` (calendrier actif mais aucun trou assez long : aucune séance, aucune heure inventée ; Programme propose « Modifier mes disponibilités » et « Changer la durée des séances »).

`WeeklyPlan.availability` dit d'où vient le cadre (`manual`, `calendar_auto`, `none`). Le planning visible se recalcule dès que les plages du calendrier changent (lien ajouté, actualisé, activé ou désactivé) : `useWeekCalendar` → `usePlan`.

## Report intelligent

`rescheduleOptions` : prochains jours libres de la semaine qui peuvent accueillir la séance (complète ou courte).

## Anti-abandon (`motivation/anti-abandon.ts`)

Check-in (énergie, motivation, fatigue, temps) → options ordonnées : repos, marche, mobilité, version allégée, séance courte, report. 1 jour manqué → reprise simple ; ≥ 3 → reprise douce ; planning impossible → replanification. La régularité se compte en **semaines** : un jour manqué ne casse rien.
