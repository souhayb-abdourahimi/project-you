# Moteur d'entraînement

Code : `src/domain/training/`. Tests : `training/__tests__/`.

## Bibliothèque (`exercises.ts`)

35 exercices éditoriaux : nom FR/EN, schéma moteur (squat, charnière, fente, poussée/tirage horizontal/vertical, bras, gainage), muscles principaux/secondaires, matériel requis, niveau, incrément de charge, consignes, erreurs fréquentes. Vidéos/illustrations : seulement de sources légitimes (champ `media_url` + `media_source` en base).

## Génération (`engine.ts`)

- Split selon les séances/sem : 1–3 full body A/B · 4 haut/bas · 5 haut/bas/full/haut/bas · 6 haut/bas ×3.
- Nombre d'exercices selon la durée (`(min − 8) / 9`, 2 à 8 ; ≤ 6 pour débutant), réduit si l'estimation dépasse la durée.
- Choix par schéma moteur : matériel disponible, niveau ≤ niveau de l'utilisateur, jamais un exercice refusé ; variations tournantes entre séances identiques.
- Prescription : performance 4×4–6 (repos 150 s) · masse/recomposition 3×6–10 (120 s) · autres 3×8–12 (90 s) ; accessoires plus légers ; débutant ≤ 3 séries, ≥ 8 reps, RPE cible 7.

## Remplacement (`replacement.ts`)

« Je déteste », « Je ne sais pas faire », « Je n'ai pas la machine », « Plus facile », « Plus difficile ». Conserve dans l'ordre : schéma moteur, muscles principaux, niveau, matériel. Liste vide plutôt qu'une alternative inadaptée.

## Progression (`progression.ts`)

Double progression prudente :
- toutes les séries en haut de la fourchette et RPE ≤ 9 → +incrément de charge ;
- sinon +1 répétition ;
- RPE ≥ 9,5 ou reps sous la fourchette → on consolide ;
- fatigue élevée → on garde la charge ;
- deux séances ratées d'affilée → −10 %.

## Séances adaptées (`adapt.ts`)

- « J'ai 15 minutes » : circuit maison de 2–3 exercices au poids du corps (ou matériel maison), mêmes schémas moteurs.
- Version allégée : ~40 % de séries en moins, RPE ≤ 6.
- Une séance courte compte comme une vraie séance.
