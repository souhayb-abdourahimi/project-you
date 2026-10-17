# Analyse photo des repas (W-10, D-045)

## Principe

```
photo (choisie par l'utilisateur) → Edge Function analyze-meal → vision : QUOI (id Ciqual | null) + COMBIEN (g | null)
                                                                         ↓
                        domain/meals/photo-analysis.ts : nutrition = Σ Ciqual(id) × g / 100 (estimation)
                                                                         ↓
                          brouillon vérifié et corrigé par l'utilisateur → « Confirmer et ajouter » → logged_meals
```

Le modèle ne renvoie **jamais** de calories ni de macros : le schéma `MealPhotoDetection` (`src/domain/ai/schemas.ts`) les refuse. Tout chiffre affiché ou enregistré vient de la table Ciqual 2025 et reste étiqueté « estimation ».

## Fichiers

| Couche | Fichier |
|---|---|
| Domaine (pur, testé) | `src/domain/meals/photo-analysis.ts` — brouillon, corrections, total seulement si complet, `toLoggedMeal`, recalcul |
| Schéma de sortie IA | `src/domain/ai/schemas.ts` — `MealPhotoDetection` (strict, 12 aliments max, 1–1500 g) |
| Provider | `src/providers/meal-photo.ts` — `MealPhotoProvider` sur l'Edge Function ; timeout 25 s par essai, 1 nouvel essai sur réseau / 5xx, annulable |
| Photo | `src/services/mealPhoto.ts` — `expo-image-picker` (permission caméra au moment du geste), `expo-image-manipulator` (1024 px, JPEG 0,6) |
| Écran | `src/app/meal-analysis.tsx` → `features/nutrition/MealAnalysisScreen.tsx`, `useMealAnalysis.ts`, `MealDraftEditor.tsx`, `FoodPicker.tsx` |
| Serveur | `supabase/functions/analyze-meal/` — `handler.ts` (testé avec Jest), `vision.ts` (adaptateurs), `index.ts` (Deno) |
| Stockage | `supabase/migrations/20261017000001_logged_meals.sql`, sync dans `src/domain/sync/projection.ts` |

## États de l'écran

`start` (photo ou composition à la main) → `preview` (rien n'est envoyé avant « Analyser ») → `analyzing` (annulable) → `review` (brouillon) ; `unavailable` (pas de service : mode local, secrets absents ou fonction non déployée) ; `error` (délai, réseau, quota, connexion, résultat inexploitable — la photo est gardée, rien n'est ajouté). Composition à la main : même brouillon, même calcul, sans photo ni service.

## Règles

- Portion inconnue ou aliment non reconnu → repas **incomplet** : pas de total, bouton d'ajout désactivé. Jamais de somme partielle présentée comme un total.
- Une portion ajoutée à la main part **vide** (aucune masse « par pièce » supposée).
- Seuls des aliments du catalogue peuvent être choisis (valeurs connues).
- Enregistré : ids d'aliments, grammes, estimation, créneau facultatif, origine. **Jamais** la photo ni le libellé du modèle.

## Sécurité et confidentialité

- Clé du fournisseur de vision uniquement dans les secrets de la fonction (`MEAL_VISION_PROVIDER`, `ANTHROPIC_API_KEY`, `MEAL_VISION_MODEL`). Aucun secret dans l'app.
- Appel authentifié (JWT de l'utilisateur) ; quota par utilisateur (30 / heure, par instance) ; corps validé (base64 ≤ ~1,5 Mo, jpeg/png/webp, catalogue ≤ 200 ids) ; erreurs du fournisseur jamais renvoyées telles quelles ; rien n'est journalisé ni stocké côté serveur.
- La photo part seulement après un geste explicite, avec la phrase « elle n'est pas enregistrée ».
- Export et suppression : catégorie « Repas » du Privacy Center (`meal_plan_items`, `logged_meals`).

## Déploiement

Depuis un poste connecté au projet (`supabase login` puis `supabase link --project-ref krcqdrrfnvfpvczxwrmt`) :

1. Appliquer la migration `20261017000001_logged_meals.sql` dans l'éditeur SQL (pas `supabase db push`, voir `docs/RELEASE_RUNBOOK.md`).
2. Définir les secrets de la fonction (valeurs saisies sur le poste, jamais commitées) : `supabase secrets set --env-file <fichier hors du dépôt>` avec `MEAL_VISION_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `MEAL_VISION_MODEL`, puis supprimer le fichier.
3. Déployer : `supabase functions deploy analyze-meal`, avec la vérification JWT par défaut (ne pas passer `--no-verify-jwt`).
4. Vérifier : la fonction est ACTIVE ; un appel sans JWT répond 401 ; dans l'app connectée, « Analyser » renvoie un brouillon.

Repli : tant que la fonction n'est pas déployée (404) ou que ses secrets manquent (503), l'app passe à l'état `unavailable` et propose « Composer mon repas à la main ». Une erreur réseau, de délai ou de quota garde aussi ce bouton. Checklist complète : `docs/RELEASE_CHECKLIST.md`.

## À décider (validation humaine)

1. **Fournisseur de vision** et son contrat de traitement des données (photos de repas = donnée personnelle) ; adaptateur Anthropic prêt, autre fournisseur = un adaptateur `VisionModel` de plus.
2. **Quota partagé** (table ou Redis) avant un lancement public ; le quota par instance est une protection minimale.
3. **Catalogue** : 36 aliments Ciqual aujourd'hui ; un repas courant (pizza, sandwich) restera « non reconnu » tant que le catalogue n'est pas élargi (import Ciqual, D-020).
4. **Mentions App Store / Play** (caméra, photothèque, traitement par un tiers).
