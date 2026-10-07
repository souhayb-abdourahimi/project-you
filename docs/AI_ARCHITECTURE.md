# Architecture IA

## Principe

```
USER DATA → RULES → DETERMINISTIC ENGINES → RECOMMENDATIONS → AI EXPLANATION
```

Jamais `USER DATA → LLM → n'importe quoi`.

- Les **moteurs déterministes** (`src/domain`) calculent : énergie, macros, séances, progression, planning.
- L'**IA** explique, reformule, motive, et **propose** des modifications sous forme structurée. Elle n'est jamais la source de vérité d'un calcul.

## Appels

- Uniquement depuis une **Edge Function** (`ai-coach`), jamais depuis le client (clé API côté serveur).
- Fournisseur abstrait derrière `AIProvider` (`src/providers/types.ts`) ; changement de modèle ou de fournisseur sans toucher au reste.
- Rate limiting par utilisateur, timeout, retry borné, réponse de repli non-IA si indisponible.

## Contexte minimal

Le coach reçoit un **extrait** du `UserContextSnapshot` limité à la question (ex. pour une substitution de repas : régime, allergies, cibles du jour, inventaire). Jamais : photos, email, réponses de motivation brutes sauf pour un message de motivation, données santé brutes.

## Sorties structurées

Toute action qui modifie une donnée passe par un schéma Zod validé **avant** application puis revalidé par le moteur concerné :

| Schéma | Effet |
|---|---|
| `MealReplacementRequest` | remplace un repas par une recette qui respecte régime/allergies (revérifié) |
| `WorkoutAdjustment` | change durée/variante/exercice (revérifié par WorkoutEngine) |
| `ScheduleChange` | déplace une séance dans un créneau libre (revérifié par PlanningEngine) |
| `InventoryUpdate` | propose un ajout/retrait — **confirmation utilisateur obligatoire** |
| `MotivationMessage` | texte court, ton non culpabilisant |

Schémas : `src/domain/ai/schemas.ts`. Une sortie invalide est rejetée, jamais « réparée » silencieusement.

## Mémoire du coach

Mémoire **structurée uniquement**. Aujourd'hui : lignes `coach.*` du journal `adjustments` (D-039), seule source ; la table `coach_memory` (`kind` : `disliked_food`, `refused_exercise`, `motivation_style`, `preferred_slot`, `equipment`, `habit`) est héritée et inutilisée, son sort est à décider avant le coach IA (D-042). Pas de stockage arbitraire de texte sensible. Consultable et supprimable par l'utilisateur.

## « Pourquoi cette recommandation ? »

Chaque recommandation porte un `Rationale` produit par le moteur (objectif, contraintes, données utilisées, raison). L'IA peut le reformuler, mais n'affiche jamais son raisonnement interne.

## Garde-fous

Refus/redirection pour : restriction extrême, déshydratation, compensation, diagnostic médical, douleur persistante (→ professionnel de santé). Pas de promesse de résultat.

## Calendrier

MVP : aucun appel IA (les moteurs suffisent). Coach IA simple en fin de MVP/phase 2, avancé en phase 3.
