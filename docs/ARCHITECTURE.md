# Architecture

## Vue d'ensemble

Une seule application **Expo (SDK 57) + Expo Router + React Native Web**, en TypeScript strict, pour iOS, Android et Web. Backend **Supabase** (PostgreSQL + Auth + Storage + Edge Functions), sécurisé par **RLS**.

```
┌──────────────── Client (iOS / Android / Web) ────────────────┐
│ src/app          routes Expo Router (minces)                 │
│ src/features     écrans et composants par fonctionnalité     │
│ src/components   design system (primitives UI)               │
│ src/state        stores locaux persistés (offline-first)     │
│ src/services     Supabase, stockage, notifications, sync     │
│ src/providers    interfaces de données externes + MOCK       │
│ src/domain       logique métier PURE (moteurs, schémas)      │
└──────────────────────────────┬───────────────────────────────┘
                               │ supabase-js (clé anon + JWT utilisateur)
┌──────────────────────────────▼───────────────────────────────┐
│ Supabase : Postgres (RLS) · Auth · Storage privé · Edge Fns  │
│ Edge Functions = seul endroit où vivent les secrets (IA,     │
│ APIs payantes, service role)                                 │
└──────────────────────────────────────────────────────────────┘
```

## Règle de dépendance

```
app → features → (components, state, services, providers) → domain
```

- `src/domain` n'importe **rien** de React, React Native, Expo ou Supabase. Fonctions pures, déterministes, testées unitairement. C'est la source de vérité des calculs.
- Aucune logique métier dans les composants : un écran appelle un moteur ou un store.
- `src/providers` expose des interfaces ; le reste de l'app ne connaît jamais un fournisseur concret.

## Arborescence

```
src/
  app/                 routes (tabs, onboarding, auth, réglages)
  features/<feature>/  écrans, hooks et composants propres à la fonctionnalité
  components/ui/       Button, Card, Screen, Text, ProgressBar, …
  theme/               tokens (couleurs, typo, espacements, rayons)
  i18n/                i18next, fr (défaut) + en
  state/               zustand + persistance (AsyncStorage / localStorage)
  services/            supabase client, repositories, sync, notifications
  providers/           FoodProvider, CalendarProvider, … + implémentations MOCK
  domain/
    profile/           UserProfile, GoalProfile, …, UserContextSnapshot
    onboarding/        étapes adaptatives
    nutrition/         NutritionEngine (BMR, TDEE, macros, réalisme)
    meals/             recettes, plan alimentaire, courses, budget
    training/          bibliothèque, WorkoutEngine, remplacement, progression
    planning/          PlanningEngine (WeeklyPlan), modes 15 min / pas envie
    progress/          moyennes de poids, tendances, check-ins
    motivation/        messages, anti-abandon
    sync/              file d'attente de synchronisation (outbox)
    shared/            types communs (Result, ExternalDataMeta, dates)
supabase/
  migrations/          SQL versionné (tables + RLS)
  tests/               tests SQL RLS (psql)
  seed.sql             données de démonstration (MOCK)
scripts/               outils dev (db-test.sh)
```

## Données et offline-first

1. L'UI lit les **stores locaux** (persistés sur l'appareil).
2. Toute écriture met à jour le store **et** ajoute une opération à l'**outbox** (`src/domain/sync/outbox.ts`).
3. Le service de sync vide l'outbox vers Supabase (retry exponentiel), puis récupère les changements distants (`updated_at > last_pulled_at`).
4. Conflits : *last-write-wins* par ligne sur `updated_at`, suppressions logiques (`deleted_at`) pour qu'une suppression hors ligne se propage. Choix documenté dans `DECISIONS.md` (D-006).

Fonctionne hors connexion : séance, repas, inventaire, poids, progression, recettes déjà téléchargées.

## Moteurs

| Moteur | Entrées | Sorties | Doc |
|---|---|---|---|
| NutritionEngine | profil, objectif, activité, fréquence sportive | énergie, P/G/L, alertes réalisme | `NUTRITION_ENGINE.md` |
| MealPlanner | cibles, inventaire, recettes, contraintes, budget | DailyMealPlan / WeeklyMealPlan, ShoppingList | `NUTRITION_ENGINE.md` |
| WorkoutEngine | objectif, niveau, jours, durée, matériel, refus | séances, exercices, séries, reps, repos | `WORKOUT_ENGINE.md` |
| ProgressionEngine | historique des séries, RPE, fatigue | suggestion prudente de charge/reps | `WORKOUT_ENGINE.md` |
| PlanningEngine | disponibilités, contraintes, récupération | WeeklyPlan (séances, repos, prépa repas, courses, rappels) | `PLANNING_ENGINE.md` |

Chaque recommandation importante porte une **explication** (`Rationale` : objectif, contraintes, données utilisées, raison) pour « Pourquoi cette recommandation ? ».

## Plateformes

- Fonctions natives (caméra, santé, calendrier) derrière un provider avec **fallback web** explicite (« Disponible sur l'application mobile » + alternative manuelle).
- Fichiers `*.web.tsx` uniquement quand le rendu diffère réellement (ex. sidebar web).

## Environnements

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` : seules variables exposées au client (publiques par conception, protégées par RLS).
- Tout autre secret vit dans les secrets des Edge Functions. Voir `.env.example` et `SECURITY.md`.
- Sans configuration Supabase, l'app démarre en **mode local** (données sur l'appareil uniquement), signalé à l'écran.
