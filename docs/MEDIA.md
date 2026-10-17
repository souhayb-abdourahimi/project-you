# Médias : exercices et recettes (W-10, D-045)

Règle unique : **`exercise.id → média validé`** et **`recipe.id → photo validée de ce plat`**, rien d'autre.

- Registres : `src/features/training/exerciseMedia.ts` (`EXERCISE_MEDIA`) et `src/features/nutrition/recipeMedia.ts` (`RECIPE_MEDIA`), même forme `ValidatedMedia` (`src/features/media/registry.ts`) : `source`, `status: 'validated'`, `credit` (licence), `reviewedOn`, `focus` (point focal 0–1 pour les recadrages), `alt` (FR / EN).
- `size` (pixels du fichier livré) est obligatoire : il décide du rendu du héros (`heroFit`) pour ne jamais agrandir une petite image.
- `registryProblems` (testé) refuse un id inconnu, un crédit, une date de relecture, une taille ou un texte alternatif manquant, un point focal hors image.
- Lecteur d'écran : une vraie photo est annoncée par son texte alternatif (`alt`), le visuel dessiné est masqué.
- Sans média validé, l'app dessine son visuel : exercice = famille de mouvement (squat / fente, charnière, poussée, tirage, gainage) sur graphite (héros) ou sur teinte bleue (vignettes) ; recette = moment du repas sur teinte nutrition. **Jamais** une photo du web, jamais l'image d'un autre mouvement ou d'un autre plat.
- `Recipe.mediaUri` a été retiré (W-10) : l'id est la seule entrée.

## État (2026-10-17, lot 01)

### Exercices : 9 / 36 intégrés

Lot `PROJECT_YOU_exercise_media_batch_01` (statut `candidate_validated_by_user_batch_01`, validé par Souhayb). Chaque fichier a été relu pour son mouvement exact avant d'être mappé.

| `exercise.id` | Fichier | Pixels | Héros |
|---|---|---|---|
| `bodyweight_squat` | `assets/media/exercises/bodyweight_squat.webp` | 1448 × 1086 | plein cadre (`cover`) |
| `db_bench_press` | `assets/media/exercises/db_bench_press.webp` | 279 × 490 | photo entière à droite (`inset`) |
| `db_row` | `assets/media/exercises/db_row.webp` | 287 × 509 | `inset` |
| `db_shoulder_press` | `assets/media/exercises/db_shoulder_press.webp` | 287 × 505 | `inset` |
| `deadlift` | `assets/media/exercises/deadlift.webp` | 271 × 491 | `inset` |
| `lat_pulldown` | `assets/media/exercises/lat_pulldown.webp` | 300 × 509 | `inset` |
| `plank` | `assets/media/exercises/plank.webp` | 299 × 509 | `inset` |
| `pull_up` | `assets/media/exercises/pull_up.webp` | 280 × 510 | `inset` |
| `push_up` | `assets/media/exercises/push_up.webp` | 292 × 505 | `inset` |

- **Non embarqué** : `source_duplicates/db_bench_press_alternate.jpeg` (doublon du même exercice ; un id = un fichier). Un test vérifie que `assets/media/exercises/` ne contient que les fichiers des ids enregistrés.
- **Qualité** : les 8 recadrages portrait (~280 × 500 px) suffisent pour les vignettes (40–56 pt) et le héros en `inset` (affichés à peu près à leur taille, ~1,2× sur un écran 3x). Ils **doivent être remplacés par des originaux haute définition avant la publication** si on veut un héros plein cadre ; on ne les agrandit pas en bannière.
- **Encore sans image (27)** : `goblet_squat`, `back_squat`, `leg_press`, `romanian_deadlift_db`, `romanian_deadlift`, `glute_bridge`, `hip_thrust`, `kettlebell_swing`, `reverse_lunge`, `db_split_squat`, `bulgarian_split_squat`, `incline_push_up`, `bench_press`, `chest_press_machine`, `pike_push_up`, `overhead_press`, `band_row`, `barbell_row`, `seated_cable_row`, `inverted_row`, `band_pulldown`, `db_curl`, `band_curl`, `bench_dip`, `cable_triceps_pushdown`, `dead_bug`, `hanging_knee_raise`. Ils gardent le visuel dessiné de leur famille ; jamais la photo d'un exercice voisin (`db_bench_press` ne sert pas pour `bench_press`, `pull_up` ne sert pas pour `band_pulldown`).
- Les 36 images du poster « guide ultime des exercices en salle » restent des références temporaires, non embarquées.

### Recettes : 1 / 23 intégrée, 5 photos disponibles non liées

Lot `PROJECT_YOU_recipe_media_batch_01` (6 photos, ~240–300 px, EXIF retiré sans réencodage). Le catalogue `src/domain/meals/recipes.ts` reste la source de vérité : aucune recette n'a été créée ni modifiée pour utiliser une image, aucune valeur Ciqual n'est touchée, rien n'est lu dans la photo.

| Photo du lot | Décision | Raison | Proposition |
|---|---|---|---|
| `grilled_chicken_rice_broccoli` | **liée à `chicken_rice_broccoli`** → `assets/media/recipes/chicken_rice_broccoli.jpg` | mêmes aliments visibles que la recette (poulet, riz, brocoli ; l'huile ne se voit pas) | — Nuance : la recette dit « poulet émincé », la photo montre un filet grillé entier. À retirer du registre si Souhayb juge l'écart gênant. |
| `berry_banana_smoothie_bowl` | non liée → `assets/media/recipes/unlinked/` | aucune recette de smoothie bowl ; `soy_yogurt_bowl` (yaourt soja, avoine, framboises) et `vegan_oats` (porridge, banane) sont d'autres plats | future recette dédiée « smoothie bowl banane-fruits rouges » |
| `penne_meatballs_tomato` | non liée | aucune recette à boulettes ; `tuna_pasta` (thon) et `tvp_bolognese` (soja texturé) sont d'autres plats | future recette « pennes aux boulettes, sauce tomate » |
| `scrambled_eggs_spinach` | non liée | `egg_toast` = œufs brouillés **sur pain avec tomate**, sans épinards ; `tofu_scramble` = tofu | future recette « œufs brouillés aux épinards » (œuf et épinards existent déjà dans le catalogue Ciqual) |
| `banana_berry_pancakes` | non liée | aucune recette de pancakes | future recette « pancakes banane-fruits rouges » |
| `salmon_quinoa_vegetables` | non liée | `salmon_potatoes` = saumon, **pommes de terre et épinards** | future recette « saumon, quinoa et légumes » |

Les fichiers non liés ne sont référencés par aucun code, donc absents du bundle. Pour en lier un : créer d'abord la recette (avec ses aliments Ciqual, testée comme les autres), puis déplacer le fichier en `assets/media/recipes/<recipe.id>.jpg` et l'ajouter à `RECIPE_MEDIA`. Ces photos sont petites : bonnes en vignette (52–60 pt), pas en bannière (la variante `banner` exige un original paysage ≥ 1080 px, sinon le visuel dessiné reste).

**Encore sans photo (22)** : `overnight_oats`, `vegan_oats`, `egg_toast`, `yogurt_bowl`, `pb_banana_snack`, `tuna_pasta`, `lentil_curry`, `tofu_stir_fry`, `chickpea_salad`, `chili_sin_carne`, `salmon_potatoes`, `microwave_beef_bowl`, `quark_snack`, `apple_almonds_snack`, `tofu_scramble`, `soy_yogurt_bowl`, `chickpea_snack`, `tempeh_bowl`, `seitan_stir_fry`, `tvp_bolognese`, `microwave_tofu_bowl`, `tuna_potato_salad`.

## Où chaque image s'affiche (mêmes fichiers, recadrés autour du point focal)

| Usage | Ratio | Taille affichée |
|---|---|---|
| Héros de l'exercice en cours (Séance) | 16:9 | pleine largeur de carte (~330 × 186 pt). `heroFit` : original paysage ≥ 1080 px → plein cadre avec voile sombre bas ; sinon photo entière à droite, à hauteur du héros, bord fondu dans le graphite, texte à gauche |
| Liste de la séance, alternatives de remplacement, records (résumé, Progrès) | 1:1 | 40 à 56 pt |
| Repas (ligne Nutrition, Aujourd'hui, Recettes) | 1:1 | 52 à 60 pt |
| Détail de recette (prévu) | 16:10 | pleine largeur |

## Spécification des fichiers

| | Exercices | Recettes |
|---|---|---|
| Dossier | `assets/media/exercises/` | `assets/media/recipes/` |
| Format | WebP qualité 80, < 250 Ko | WebP qualité 80, < 250 Ko |
| Taille source | 1600 × 1200 (4:3) min., sujet centré avec marge (recadré en 16:9 et 1:1) | 1600 × 1200 (4:3) min., assiette centrée vue de 3/4 ou de dessus |
| Contenu | le mouvement exact de l'id, position clé lisible (milieu d'amplitude), fond sombre homogène, **aucun texte, numéro ni logo** | le plat de la recette, avec ses ingrédients visibles et la portion d'une personne, **aucun texte** |
| Cohérence | même studio, même lumière, même cadrage sur les 36 ; hommes et femmes alternés | même vaisselle, même lumière naturelle sur les 23 |
| Droits | production propre ou licence commerciale écrite → `credit` | idem |

## Relecture avant d'ajouter une entrée

1. Le sujet correspond exactement à l'id (haltères ≠ barre ; « pâtes au thon » ≠ « pâtes bolognaise »).
2. Exercices : technique sûre, aucune erreur listée dans `mistakes` du catalogue. Recettes : ingrédients cohérents avec la recette (pas de viande sur une recette végane).
3. Lisible en vignette 40 pt et en héros ; point focal choisi (`focus`).
4. Licence vérifiée, `reviewedOn` daté, `alt` écrit en FR et EN.

Exemple : `bench_press: { source: require('../../../assets/media/exercises/bench_press.webp'), status: 'validated', credit: 'Project You — studio 2026', reviewedOn: '2026-11-02', size: { width: 1600, height: 1200 }, focus: { x: 0.5, y: 0.45 }, alt: { fr: 'Développé couché à la barre, barre au-dessus de la poitrine', en: 'Barbell bench press, bar above the chest' } }`.

## Les 36 fichiers d'exercices attendus (cible haute définition)

| # | `exercise.id` | Fichier attendu | Mouvement (FR) | Famille |
|---|---|---|---|---|
| 1 | `goblet_squat` | `assets/media/exercises/goblet_squat.webp` | Goblet squat | squat |
| 2 | `bodyweight_squat` | `assets/media/exercises/bodyweight_squat.webp` | Squat au poids du corps | squat |
| 3 | `back_squat` | `assets/media/exercises/back_squat.webp` | Squat barre | squat |
| 4 | `leg_press` | `assets/media/exercises/leg_press.webp` | Presse à cuisses | squat |
| 5 | `romanian_deadlift_db` | `assets/media/exercises/romanian_deadlift_db.webp` | Soulevé de terre roumain haltères | hinge |
| 6 | `romanian_deadlift` | `assets/media/exercises/romanian_deadlift.webp` | Soulevé de terre roumain barre | hinge |
| 7 | `deadlift` | `assets/media/exercises/deadlift.webp` | Soulevé de terre | hinge |
| 8 | `glute_bridge` | `assets/media/exercises/glute_bridge.webp` | Pont fessier | hinge |
| 9 | `hip_thrust` | `assets/media/exercises/hip_thrust.webp` | Hip thrust | hinge |
| 10 | `kettlebell_swing` | `assets/media/exercises/kettlebell_swing.webp` | Swing kettlebell | hinge |
| 11 | `reverse_lunge` | `assets/media/exercises/reverse_lunge.webp` | Fente arrière | lunge |
| 12 | `db_split_squat` | `assets/media/exercises/db_split_squat.webp` | Split squat haltères | lunge |
| 13 | `bulgarian_split_squat` | `assets/media/exercises/bulgarian_split_squat.webp` | Squat bulgare | lunge |
| 14 | `push_up` | `assets/media/exercises/push_up.webp` | Pompes | push_horizontal |
| 15 | `incline_push_up` | `assets/media/exercises/incline_push_up.webp` | Pompes inclinées | push_horizontal |
| 16 | `db_bench_press` | `assets/media/exercises/db_bench_press.webp` | Développé couché haltères | push_horizontal |
| 17 | `bench_press` | `assets/media/exercises/bench_press.webp` | Développé couché barre | push_horizontal |
| 18 | `chest_press_machine` | `assets/media/exercises/chest_press_machine.webp` | Développé machine | push_horizontal |
| 19 | `pike_push_up` | `assets/media/exercises/pike_push_up.webp` | Pompes piquées | push_vertical |
| 20 | `db_shoulder_press` | `assets/media/exercises/db_shoulder_press.webp` | Développé épaules haltères | push_vertical |
| 21 | `overhead_press` | `assets/media/exercises/overhead_press.webp` | Développé militaire | push_vertical |
| 22 | `band_row` | `assets/media/exercises/band_row.webp` | Tirage élastique | pull_horizontal |
| 23 | `db_row` | `assets/media/exercises/db_row.webp` | Rowing haltère | pull_horizontal |
| 24 | `barbell_row` | `assets/media/exercises/barbell_row.webp` | Rowing barre | pull_horizontal |
| 25 | `seated_cable_row` | `assets/media/exercises/seated_cable_row.webp` | Tirage horizontal poulie | pull_horizontal |
| 26 | `inverted_row` | `assets/media/exercises/inverted_row.webp` | Tirage australien | pull_horizontal |
| 27 | `lat_pulldown` | `assets/media/exercises/lat_pulldown.webp` | Tirage vertical | pull_vertical |
| 28 | `pull_up` | `assets/media/exercises/pull_up.webp` | Tractions | pull_vertical |
| 29 | `band_pulldown` | `assets/media/exercises/band_pulldown.webp` | Tirage vertical élastique | pull_vertical |
| 30 | `db_curl` | `assets/media/exercises/db_curl.webp` | Curl haltères | arms |
| 31 | `band_curl` | `assets/media/exercises/band_curl.webp` | Curl élastique | arms |
| 32 | `bench_dip` | `assets/media/exercises/bench_dip.webp` | Dips sur banc | arms |
| 33 | `cable_triceps_pushdown` | `assets/media/exercises/cable_triceps_pushdown.webp` | Extension triceps poulie | arms |
| 34 | `plank` | `assets/media/exercises/plank.webp` | Gainage planche | core |
| 35 | `dead_bug` | `assets/media/exercises/dead_bug.webp` | Dead bug | core |
| 36 | `hanging_knee_raise` | `assets/media/exercises/hanging_knee_raise.webp` | Relevés de genoux suspendu | core |

## Les 23 photos de recettes attendues

| # | `recipe.id` | Fichier attendu | Plat |
|---|---|---|---|
| 1 | `overnight_oats` | `assets/media/recipes/overnight_oats.webp` | Overnight oats aux framboises |
| 2 | `vegan_oats` | `assets/media/recipes/vegan_oats.webp` | Porridge soja-banane |
| 3 | `egg_toast` | `assets/media/recipes/egg_toast.webp` | Tartines aux œufs brouillés |
| 4 | `yogurt_bowl` | `assets/media/recipes/yogurt_bowl.webp` | Bol fromage blanc, pomme et amandes |
| 5 | `pb_banana_snack` | `assets/media/recipes/pb_banana_snack.webp` | Banane et beurre de cacahuète |
| 6 | `chicken_rice_broccoli` | `assets/media/recipes/chicken_rice_broccoli.webp` | Poulet, riz et brocoli |
| 7 | `tuna_pasta` | `assets/media/recipes/tuna_pasta.webp` | Pâtes au thon et sauce tomate |
| 8 | `lentil_curry` | `assets/media/recipes/lentil_curry.webp` | Curry de lentilles |
| 9 | `tofu_stir_fry` | `assets/media/recipes/tofu_stir_fry.webp` | Poêlée de tofu et légumes |
| 10 | `chickpea_salad` | `assets/media/recipes/chickpea_salad.webp` | Salade de pois chiches |
| 11 | `chili_sin_carne` | `assets/media/recipes/chili_sin_carne.webp` | Chili sin carne |
| 12 | `salmon_potatoes` | `assets/media/recipes/salmon_potatoes.webp` | Saumon, pommes de terre et épinards |
| 13 | `microwave_beef_bowl` | `assets/media/recipes/microwave_beef_bowl.webp` | Bol bœuf-légumes au micro-ondes |
| 14 | `quark_snack` | `assets/media/recipes/quark_snack.webp` | Fromage blanc et framboises |
| 15 | `apple_almonds_snack` | `assets/media/recipes/apple_almonds_snack.webp` | Pomme et amandes |
| 16 | `tofu_scramble` | `assets/media/recipes/tofu_scramble.webp` | Brouillade de tofu aux épinards |
| 17 | `soy_yogurt_bowl` | `assets/media/recipes/soy_yogurt_bowl.webp` | Bol yaourt soja, avoine et framboises |
| 18 | `chickpea_snack` | `assets/media/recipes/chickpea_snack.webp` | Pois chiches tièdes à l'huile d'olive |
| 19 | `tempeh_bowl` | `assets/media/recipes/tempeh_bowl.webp` | Bol tempeh, riz et brocoli |
| 20 | `seitan_stir_fry` | `assets/media/recipes/seitan_stir_fry.webp` | Sauté de seitan aux légumes |
| 21 | `tvp_bolognese` | `assets/media/recipes/tvp_bolognese.webp` | Pâtes bolognaise au soja texturé |
| 22 | `microwave_tofu_bowl` | `assets/media/recipes/microwave_tofu_bowl.webp` | Bol tofu-légumes au micro-ondes |
| 23 | `tuna_potato_salad` | `assets/media/recipes/tuna_potato_salad.webp` | Salade tiède thon et pommes de terre |
