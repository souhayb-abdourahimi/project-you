# Moteur nutrition

Code : `src/domain/nutrition/engine.ts`, `src/domain/meals/*`. Tests : `__tests__/` à côté. Tous les chiffres affichés sont des **estimations**.

## Estimation énergétique

1. **Dépense de repos** — Mifflin-St Jeor (1990) : `10 × poids + 6,25 × taille − 5 × âge + s`, avec `s = +5` (homme), `−161` (femme), `−78` (non renseigné : moyenne, avertissement « estimation moyenne »).
2. **Facteur d'activité** (vie quotidienne) : sédentaire 1,2 · légère 1,375 · modérée 1,55 · élevée 1,725, **+ entraînement planifié** : ≥ 90 min/sem +0,075 · ≥ 180 +0,15 · ≥ 300 +0,2 ; plafond 1,9.
3. **Ajustement selon l'objectif** : perte de gras −15 % · perte de poids −20 % · recomposition −5 % · maintien / condition 0 % · performance +5 % · prise de masse +10 %.

## Garde-fous (non négociables)

| Cas | Règle |
|---|---|
| Moins de 18 ans | aucun déficit (`minor_no_deficit`) ; l'onboarding refuse < 16 ans |
| IMC < 18,5 | aucun déficit (`underweight_no_deficit`) |
| Plancher | calories ≥ max(dépense de repos, 1200 F / 1500 H / 1350 non renseigné) (`calorie_floor_applied`) |
| Objectif agressif | perte > 1 % du poids/sem ou prise > 0,5 %/sem → `aggressive` + date réaliste proposée ; l'utilisateur garde le choix |
| Cible sous IMC 18,5 | `unsafe_target` : on ne la soutient pas |

## Macronutriments

- Protéines (g/kg) : perte de gras 2,0 · recomposition 2,0 · perte de poids 1,8 · prise de masse 1,8 · performance 1,8 · maintien/condition 1,4. Si IMC ≥ 30, poids de référence = poids à IMC 25.
- Lipides : 25 % des calories, minimum 0,6 g/kg.
- Glucides : le reste.

## Plan alimentaire (`meals/planner.ts`)

Répartition par repas (3 repas : 25 / 37,5 / 37,5 %). Pour chaque créneau :

1. **Contraintes dures** (`constraints.ts`) : régime, allergènes (14 allergènes UE), aliments interdits et intolérances (texte libre, insensible aux accents ; « lactose » → lait), équipement de cuisine, temps de cuisine. Un ingrédient interdit est remplacé par une substitution autorisée, sinon la recette est exclue. **Jamais relâchées.**
2. **Score** : couverture par l'inventaire (×4) → aliments qui expirent bientôt (+1,5 chacun) → densité protéique (×1,5) → aliments aimés (+0,5) / détestés (−2) → variété sur la semaine (−1,5 par réutilisation).
3. **Portion** : ajustée à la cible calorique du créneau (0,5 à 2,5 portions, pas de 0,25).
4. **Choix à l'échelle de la journée** (D-013) : pour chaque créneau, on garde les 4 meilleures recettes du score + les 3 plus denses en protéines, puis on cherche la combinaison de la journée qui maximise : score − 20 × manque de protéines − 60 × manque sous le seuil de 90 % − 10 × écart calorique au-delà de 5 % − 3 par recette répétée dans la journée. La nutrition passe ainsi avant l'inventaire et les préférences, conformément à l'ordre de priorité.
5. **Couverture protéique** : chaque jour expose `protein { targetG, plannedG, met }` (atteint à partir de 90 %). Si les contraintes rendent la cible inatteignable, le plan le dit (`met: false` + message dans l'écran Nutrition) au lieu de masquer l'écart.
6. **Substitutions visibles** : un repas adapté indique « tofu à la place de blanc de poulet ».

Le plan de la semaine est généré une fois par semaine et consomme l'inventaire virtuellement jour après jour. Il est **régénéré** si le régime, les allergies, les exclusions, les cibles ou le nombre de repas changent (`mealPlanKey`), en conservant les repas déjà consommés.

Actions : « Remplacer », « Je n'ai pas cet ingrédient », « Plus rapide », « Plus riche en protéines ». « Moins cher » renvoie `unavailable` tant qu'aucun prix réel n'existe.

## Exclusions et plan impossible (D-021)

- Les aliments exclus et les intolérances saisis en texte libre sont traduits par `meals/exclusions.ts` en allergènes, origines animales, catégories ou aliments précis. Ce n'est jamais une recherche par sous-chaîne. L'app affiche ce qu'elle a compris.
- `meals/diagnosis.ts` explique un plan incomplet ou pauvre en protéines : créneaux sans recette, contraintes en cause, ajustements vérifiés par replanification. Le régime, les allergies et les intolérances ne sont jamais proposés à la suppression.

## Courses et budget

- `shopping.ts` : besoins du plan − inventaire, priorité selon la date du premier repas, coût **null** sans prix réel.
- `budget.ts` : prévu / dépensé / restant sur la semaine ; mensuel = hebdo × 52 / 12.
- Limite actuelle : sans données de prix, le budget n'influence pas encore le choix des recettes (TODO).

## Limites connues

Aucun prix réel : le budget ne peut pas encore départager les recettes. Les valeurs des aliments viennent de la table **Ciqual 2025 de l'ANSES** (D-020) et restent des estimations : un produit réel varie selon la marque, la variété et la cuisson. Les cibles de protéines élevées des profils véganes sont atteintes avec peu de marge (D-020). Recalibrage par la tendance de poids réelle à venir.
