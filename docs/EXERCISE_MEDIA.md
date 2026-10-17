# Médias des exercices (W-10, D-045)

Règle : `exercise.id → média officiel validé`, rien d'autre (`src/features/training/exerciseMedia.ts`). Sans média validé, l'app dessine son visuel neutre (`ExerciseMedia`) : jamais une photo du web, jamais l'image d'un autre mouvement.

## État (2026-10-17)

- Registre **vide** : aucun asset de production n'est encore relu.
- Les 36 images fournies (« guide ultime des exercices en salle », `exercise_media_manifest.csv`) sont des **références visuelles temporaires** : recadrages 163×248 px d'un poster, numéro et nom incrustés, droits non précisés. Elles ne sont **pas** dans le bundle.
- Le manifeste correspond exactement aux 36 ids du catalogue (`src/features/training/__tests__/exerciseMedia.test.ts`).

## Spécification des assets de production

| | |
|---|---|
| Fichier | `assets/exercises/<exercise_id>.webp` (ou URL du stockage public Project You) |
| Format | 4:5 vertical, 1080×1350 min., WebP qualité 80, < 250 Ko |
| Contenu | le mouvement exact de l'id, position clé lisible, fond sombre homogène, **aucun texte, numéro ni logo incrusté** |
| Cohérence | même éclairage et même cadrage sur les 36, hommes et femmes alternés comme la référence |
| Droits | production propre ou licence commerciale écrite ; crédit noté dans `credit` |

## Relecture (avant d'ajouter une entrée)

1. Le mouvement correspond à l'id (variante haltères ≠ barre, etc.) et aux consignes `cues` du catalogue.
2. Technique sûre (dos neutre, amplitude correcte) : ne pas montrer une erreur listée dans `mistakes`.
3. Aucun texte incrusté ; lisible en vignette 40 px et en héros 168 px.
4. Licence vérifiée ; `reviewedOn` daté.

Ajout : `EXERCISE_MEDIA[id] = { source: require('@/assets/exercises/<id>.webp'), status: 'validated', credit, reviewedOn }`. Le test vérifie l'id et les champs.
