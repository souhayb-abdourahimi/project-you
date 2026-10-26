# Analyse photo des repas (W-10, D-045)

## Principe

```
photo (choisie par l'utilisateur) → Edge Function analyze-meal → vision : QUOI (id Ciqual | null) + COMBIEN (g | null)
                                                                         ↓
                        domain/meals/photo-analysis.ts : nutrition = Σ Ciqual(id) × g / 100 (estimation)
                                                                         ↓
                          brouillon vérifié et corrigé par l'utilisateur → « Confirmer et ajouter » → logged_meals
```

Le modèle ne renvoie **jamais** de calories ni de macros : on lui demande seulement de nommer des aliments du catalogue (ou `null`), d'estimer des grammes et de donner une confiance. Le handler ne garde que ces quatre champs, retire tout chiffre nutritionnel du libellé libre (« 300 kcal », « 20 g de protéines »), et le schéma `MealPhotoDetection` (`src/domain/ai/schemas.ts`) refuse tout autre champ côté app. Tout chiffre affiché ou enregistré vient de la table Ciqual 2025 et reste étiqueté « estimation ».

## Fournisseurs de vision

Choisi par le secret `MEAL_VISION_PROVIDER` (insensible à la casse) : un fournisseur, ou une **liste ordonnée** séparée par des virgules (D-048), par exemple `openai,cloudflare`. Le suivant n'est essayé que si le précédent échoue (quota, clé, modèle, limite, délai, sortie invalide), sans rien montrer à l'utilisateur ; 25 s par fournisseur, 45 s pour toute la chaîne. Les adaptateurs (`supabase/functions/analyze-meal/vision.ts`) envoient le même prompt (`visionPrompt` : catalogue `id: nom`, « Do not return calories or macros ») et renvoient la même forme brute, contrôlée ensuite par `sanitizeDetection`.

| `MEAL_VISION_PROVIDER` | Clé | Modèle | API appelée | Paramètres |
|---|---|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | `MEAL_VISION_MODEL` | `POST https://api.anthropic.com/v1/messages` | `temperature: 0`, 800 tokens max |
| `cloudflare` (gratuit, D-048) | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_TOKEN` | `MEAL_VISION_CLOUDFLARE_MODEL`, défaut `@cf/mistralai/mistral-small-3.1-24b-instruct` | `POST https://api.cloudflare.com/client/v4/accounts/<id>/ai/run/<modèle>` (Workers AI) | sortie imposée `guided_json` (même schéma strict), image en data-URI, 700 tokens max ; offre gratuite 10 000 neurons / jour |
| `openai` | `OPENAI_API_KEY` | `MEAL_VISION_MODEL` | `POST https://api.openai.com/v1/responses` | sortie structurée stricte (`text.format` json_schema `meal_foods`), `reasoning.effort: low`, `max_output_tokens: 4096`, `store: false`, pas de `temperature` |

Contrat de sortie, identique pour tous : `{"items":[{"label","foodId","grams","confidence"}]}`, 12 aliments au plus. Côté OpenAI, le schéma strict `MEAL_DETECTION_SCHEMA` ne contient que ces quatre champs : aucun champ nutritionnel ; le libellé libre est nettoyé de tout chiffre nutritionnel par le handler. Un id hors du catalogue devient « non reconnu », une portion impossible devient « inconnue », tout champ en plus est supprimé, et la nutrition est recalculée depuis Ciqual dans `domain/meals/photo-analysis.ts`.

Réponse OpenAI lue seulement si `status` vaut `completed` : on prend le texte des parties `output_text` des éléments `message` (les éléments `reasoning` sont ignorés). Un refus (`refusal`) → `invalid_output` ; une réponse `incomplete` (plafond de tokens, filtre) ou `failed` → `analysis_failed`. Rien n'est réparé.

### Modèles OpenAI compatibles (doc OpenAI relue le 2026-10-18)

Conditions : entrée image, sorties structurées, effort de raisonnement `low` accepté, modèle non déprécié.

| Modèle | Usage conseillé | Prix (entrée / sortie, par million de tokens) |
|---|---|---|
| `gpt-6-luna` | **recommandé** : le plus économique, fait pour les tâches ciblées à fort volume | 0,10 $ / 0,50 $ |
| `gpt-5.6-luna` | alternative économique | 0,20 $ / 1,20 $ |
| `gpt-5.6-terra` | intermédiaire | 2,00 $ / 12,00 $ |
| `gpt-6.1-sol`, `gpt-6-sol`, `gpt-5.6-sol`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5` | compatibles, plus chers ou plus lents sans gain attendu ici | de 0,75 $ à 5 $ en entrée |
| `gpt-6-astra` | compatible mais très cher pour cet usage | 10 $ / 50 $ |

Non compatibles : `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini` (dépréciés, arrêt le 14 janvier 2027, pas de paramètre de raisonnement), `gpt-5-mini` et `gpt-5-nano` (arrêt le 11 décembre 2026), les modèles « pro » (pas d'effort `low`). Un modèle incompatible ou inconnu fait échouer l'appel : l'app affiche une erreur avec « Composer mon repas à la main ».

Pas encore testé contre l'API réelle (pas de clé ni de réseau vers OpenAI depuis l'environnement de développement) : le premier appel après déploiement sert de validation. Le premier appel avec un nouveau schéma peut être plus lent. La fonction coupe à 20 s (504) ; l'app relance une fois automatiquement, donc l'erreur avec « Composer mon repas à la main » arrive après environ 40 s et deux appels facturés.

## Fichiers

| Couche | Fichier |
|---|---|
| Domaine (pur, testé) | `src/domain/meals/photo-analysis.ts` — brouillon, corrections, total seulement si complet, `toLoggedMeal`, recalcul |
| Schéma de sortie IA | `src/domain/ai/schemas.ts` — `MealPhotoDetection` (strict, 12 aliments max, 1–1500 g) |
| Provider | `src/providers/meal-photo.ts` — `MealPhotoProvider` sur l'Edge Function ; timeout 25 s par essai, 1 nouvel essai sur réseau / 5xx, annulable |
| Photo | `src/services/mealPhoto.ts` — `expo-image-picker` (permission caméra au moment du geste), `expo-image-manipulator` (1024 px, JPEG 0,6) |
| Écran | `src/app/meal-analysis.tsx` → `features/nutrition/MealAnalysisScreen.tsx`, `useMealAnalysis.ts`, `MealDraftEditor.tsx`, `FoodPicker.tsx` |
| Serveur | `supabase/functions/analyze-meal/` — `handler.ts` (testé avec Jest), `vision.ts` (adaptateurs Anthropic et OpenAI, testés : `__tests__/handler.test.ts`, `__tests__/openai.test.ts`), `index.ts` (Deno) |
| Repli (handler → provider → view model) | `src/features/nutrition/__tests__/mealAnalysisFallback.test.tsx` — handler réel → provider réel → view model de l'écran, sans réseau : fournisseur absent, mal configuré, en erreur, trop lent → composition à la main ; nutrition toujours Ciqual |
| Stockage | `supabase/migrations/20261017000001_logged_meals.sql`, sync dans `src/domain/sync/projection.ts` |

## États de l'écran

`start` (photo ou composition à la main) → `preview` (rien n'est envoyé avant « Analyser ») → `analyzing` (annulable) → `review` (brouillon) ; `unavailable` avec sa raison précise (D-048) : mode local, fonction non déployée (404), réglage manquant (503 `not_configured` avec les noms des secrets), fonction qui ne démarre pas (`BOOT_ERROR`) ; `error` avec sa raison : quota ou crédit épuisé, clé refusée, modèle introuvable, limite atteinte, délai, réseau, résultat inexploitable (la photo est gardée, rien n'est ajouté). Composition à la main : même brouillon, même calcul, sans photo ni service.

## Règles

- Portion inconnue ou aliment non reconnu → repas **incomplet** : pas de total, bouton d'ajout désactivé. Jamais de somme partielle présentée comme un total.
- Une portion ajoutée à la main part **vide** (aucune masse « par pièce » supposée).
- Seuls des aliments du catalogue peuvent être choisis (valeurs connues).
- Enregistré : ids d'aliments, grammes, estimation, créneau facultatif, origine. **Jamais** la photo ni le libellé du modèle.

## Sécurité et confidentialité

- Clé du fournisseur de vision uniquement dans les secrets de la fonction (`MEAL_VISION_PROVIDER`, `MEAL_VISION_MODEL`, et `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY`). Aucun secret dans l'app.
- OpenAI : `store: false` sur chaque appel (sinon la réponse est gardée 30 jours comme état applicatif). Les données de l'API ne servent pas à l'entraînement par défaut, mais les journaux anti-abus sont gardés jusqu'à 30 jours ; la conservation zéro (ZDR) et la résidence UE (`eu.api.openai.com`, images comprises) demandent un accord commercial d'OpenAI et ne sont pas utilisées aujourd'hui. Le cache de prompt peut garder des données chiffrées jusqu'à 24 h sur un compte sans ZDR.
- Appel authentifié (JWT de l'utilisateur) ; quota par utilisateur (30 / heure, par instance) ; corps validé (base64 ≤ ~1,5 Mo, jpeg/png/webp, catalogue ≤ 200 ids) ; erreurs du fournisseur jamais renvoyées telles quelles ; rien n'est journalisé ni stocké côté serveur.
- La photo part seulement après un geste explicite, avec la phrase « Project You ne l’enregistre pas ; le service d’analyse peut la garder jusqu’à 30 jours pour sa sécurité, sans s’en servir pour entraîner ses modèles. » Ce texte doit rester vrai pour le fournisseur réellement configuré (30 jours vérifié pour OpenAI le 2026-10-18 ; à revérifier si Anthropic est choisi).
- Export et suppression : catégorie « Repas » du Privacy Center (`meal_plan_items`, `logged_meals`).

## Déploiement

Depuis un poste connecté au projet (`supabase login` puis `supabase link --project-ref krcqdrrfnvfpvczxwrmt`) :

1. Appliquer la migration `20261017000001_logged_meals.sql` dans l'éditeur SQL (pas `supabase db push`, voir `docs/RELEASE_RUNBOOK.md`).
2. Définir les secrets de la fonction (valeurs saisies sur le poste, jamais commitées) : `supabase secrets set --env-file <fichier hors du dépôt>`, puis supprimer le fichier. Recommandé : `MEAL_VISION_PROVIDER=openai,cloudflare` avec `OPENAI_API_KEY`, `MEAL_VISION_MODEL=gpt-6-luna`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN` ; tout gratuit : `MEAL_VISION_PROVIDER=cloudflare` et les deux secrets Cloudflare ; ou `anthropic` avec `ANTHROPIC_API_KEY` et `MEAL_VISION_MODEL` (`MEAL_VISION_ANTHROPIC_MODEL` pour l'avoir dans une chaîne). Changer de fournisseur = changer ces secrets puis relancer `supabase functions deploy analyze-meal` (le fournisseur est lu au démarrage de la fonction) ; aucune nouvelle version de l'app.
3. Déployer : `supabase functions deploy analyze-meal`, avec la vérification JWT par défaut (ne pas passer `--no-verify-jwt`).
4. Vérifier : la fonction est ACTIVE ; un appel sans JWT répond 401 ; un GET avec un jeton de session répond `{version, providers, missing}` (aucun appel au fournisseur, noms de secrets seulement) ; dans l'app connectée, « Analyser » renvoie un brouillon.

Repli (testé du handler au view model de l'écran, sans réseau ni appareil) :

| Situation | Réponse de la fonction | Écran |
|---|---|---|
| Fonction non déployée | 404 | « Service d'analyse non déployé » + « Composer mon repas à la main » |
| Secret absent, fournisseur inconnu, clé publique Supabase absente | 503 `not_configured` + `missing` (noms) + `version` | « Analyse photo pas encore configurée » avec le nom du réglage manquant + composition |
| La fonction ne démarre pas | 503 / 5xx `BOOT_ERROR` de la passerelle | « Le service d'analyse ne démarre pas » + composition |
| Un fournisseur échoue, le suivant répond | 200 | brouillon, rien de visible |
| Tous échouent : quota / crédit, clé refusée, modèle introuvable, limite, panne | 502 `analysis_failed` + `reason` + `tried` | raison précise, « Réessayer » + composition |
| Refus du modèle, réponse illisible | 502 `invalid_output` | idem, pas de nouvel essai automatique |
| Délai de la chaîne (45 s) | 504 `timeout` | idem (délai côté app 50 s) |

Rien n'est ajouté au journal sans confirmation. Checklist complète : `docs/RELEASE_CHECKLIST.md`.

## À décider (validation humaine)

1. **Fournisseur de vision** et son contrat de traitement des données (photos de repas = donnée personnelle) : adaptateurs Anthropic, OpenAI et Cloudflare Workers AI prêts, choix et ordre par `MEAL_VISION_PROVIDER` ; un autre fournisseur = un adaptateur `VisionModel` de plus. Cloudflare : relire ses conditions Workers AI (conservation des entrées) avant la bêta publique ; la mention de consentement parle aujourd'hui de 30 jours (cas OpenAI).
2. **Quota partagé** (table ou Redis) avant un lancement public ; le quota par instance est une protection minimale.
3. **Catalogue** : 36 aliments Ciqual aujourd'hui ; un repas courant (pizza, sandwich) restera « non reconnu » tant que le catalogue n'est pas élargi (import Ciqual, D-020).
4. **Mentions App Store / Play** (caméra, photothèque, traitement par un tiers).
