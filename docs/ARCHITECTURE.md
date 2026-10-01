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
  providers/           FoodProvider, CalendarProvider, … + implémentations (réelles ou « indisponible »)
  domain/
    profile/           UserProfile, GoalProfile, …, UserContextSnapshot
    onboarding/        étapes adaptatives
    nutrition/         NutritionEngine (BMR, TDEE, macros, réalisme)
    meals/             recettes, plan alimentaire, courses, budget ; ciqual/ = extrait Ciqual 2025 validé (D-020)
    training/          bibliothèque, WorkoutEngine, remplacement, progression
    planning/          PlanningEngine (WeeklyPlan), modes 15 min / pas envie
    progress/          moyennes de poids, tendances, check-ins
    motivation/        messages, anti-abandon
    sync/              projection état local ↔ lignes serveur, diff et fusion (D-015)
    shared/            types communs (Result, ExternalDataMeta, dates)
supabase/
  migrations/          SQL versionné (tables + RLS)
  tests/               tests SQL RLS (psql)
  seed.sql             données de démonstration (MOCK)
scripts/               outils dev (db-test.sh) ; ciqual/import_ciqual.py (import Ciqual, D-020)
data/ciqual/           fichier officiel Ciqual 2025, non modifié
```

## Données et offline-first

1. L'UI lit les **stores locaux** (persistés sur l'appareil).
2. Les écritures ne modifient que le store local ; aucune file d'attente à maintenir dans chaque action.
3. Le service de sync (`src/services/sync.ts`, lancé par `useSync` à la connexion, toutes les 30 s et au retour au premier plan) **tire** d'abord les lignes modifiées depuis le dernier curseur serveur (`updated_at`, recouvrement de 60 s), les fusionne, puis **pousse** la différence entre la projection de l'état local (`src/domain/sync/projection.ts`) et l'empreinte de ce qui a déjà été synchronisé.
4. Conflits : un changement local pas encore poussé gagne ; sinon le serveur gagne. Suppressions logiques (`deleted_at`) pour l'inventaire, les pesées, les mensurations et les dépenses ; l'historique (repas consommés, séances, séries) n'est jamais supprimé automatiquement. Première connexion d'un appareil ayant des données locales : les données du compte gagnent, les données uniquement locales sont envoyées. Données d'un autre compte présentes sur l'appareil : effacées avant la synchronisation. Déconnexion : données locales effacées. Détails : D-015.
5. Testé contre le vrai schéma, les migrations et les politiques RLS (`src/services/__tests__/sync.db.test.ts`, lancé par `npm run test:db` et en CI).

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
