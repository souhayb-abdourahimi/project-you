import { validatedMedia, type MediaRegistry, type ValidatedMedia } from '@/features/media/registry';

/** Exercise media batch 01, validated by the product owner on 2026-10-17 (docs/MEDIA.md). */
const BATCH_01 = {
  status: 'validated',
  credit: 'Project You — lot médias exercices 01, validé par Souhayb',
  reviewedOn: '2026-10-17',
} as const;

/**
 * Exercise media registry (W-10): `exercise.id -> validated Project You media`, nothing else.
 *
 * Batch 01 (2026-10-17): 9 of the 36 exercises, each file reviewed for its exact movement. Only
 * `bodyweight_squat` is a landscape master that can fill the hero; the 8 others are portrait crops
 * of ~280 × 500 px (fine for thumbnails, shown whole beside the hero text — `heroFit` — never
 * upscaled into a banner) and must be replaced by high-resolution originals before release. The
 * alternate `db_bench_press` crop of the batch is a duplicate and is not bundled; the poster
 * references are not either. Every other exercise keeps its drawn artwork: never another
 * exercise's picture. Expected files, format and review checklist: docs/MEDIA.md.
 */
export const EXERCISE_MEDIA: MediaRegistry = {
  bodyweight_squat: {
    source: require('../../../assets/media/exercises/bodyweight_squat.webp'),
    ...BATCH_01,
    size: { width: 1448, height: 1086 },
    focus: { x: 0.5, y: 0.35 },
    alt: {
      fr: 'Homme en squat au poids du corps, cuisses parallèles au sol, mains jointes devant la poitrine',
      en: 'Man in a bodyweight squat, thighs parallel to the floor, hands together in front of the chest',
    },
  },
  db_bench_press: {
    source: require('../../../assets/media/exercises/db_bench_press.webp'),
    ...BATCH_01,
    size: { width: 279, height: 490 },
    focus: { x: 0.5, y: 0.3 },
    alt: {
      fr: 'Développé couché haltères sur banc plat, bras tendus au-dessus de la poitrine',
      en: 'Dumbbell bench press on a flat bench, arms extended above the chest',
    },
  },
  db_row: {
    source: require('../../../assets/media/exercises/db_row.webp'),
    ...BATCH_01,
    size: { width: 287, height: 509 },
    focus: { x: 0.5, y: 0.4 },
    alt: {
      fr: 'Rowing haltère à un bras, genou et main en appui sur un banc, dos plat',
      en: 'One-arm dumbbell row, knee and hand braced on a bench, flat back',
    },
  },
  db_shoulder_press: {
    source: require('../../../assets/media/exercises/db_shoulder_press.webp'),
    ...BATCH_01,
    size: { width: 287, height: 505 },
    focus: { x: 0.5, y: 0.05 },
    alt: {
      fr: 'Développé épaules haltères debout, haltères au-dessus de la tête',
      en: 'Standing dumbbell shoulder press, dumbbells overhead',
    },
  },
  deadlift: {
    source: require('../../../assets/media/exercises/deadlift.webp'),
    ...BATCH_01,
    size: { width: 271, height: 491 },
    focus: { x: 0.5, y: 0.6 },
    alt: {
      fr: 'Soulevé de terre à la barre, barre contre les tibias, dos plat',
      en: 'Barbell deadlift, bar against the shins, flat back',
    },
  },
  lat_pulldown: {
    source: require('../../../assets/media/exercises/lat_pulldown.webp'),
    ...BATCH_01,
    size: { width: 300, height: 509 },
    focus: { x: 0.5, y: 0.3 },
    alt: {
      fr: 'Tirage vertical à la poulie vu de dos, bras tendus vers la barre',
      en: 'Lat pulldown on the cable machine, seen from behind, arms reaching for the bar',
    },
  },
  plank: {
    source: require('../../../assets/media/exercises/plank.webp'),
    ...BATCH_01,
    size: { width: 299, height: 509 },
    focus: { x: 0.5, y: 0.6 },
    alt: {
      fr: 'Gainage planche sur les avant-bras, corps aligné',
      en: 'Forearm plank, body in a straight line',
    },
  },
  pull_up: {
    source: require('../../../assets/media/exercises/pull_up.webp'),
    ...BATCH_01,
    size: { width: 280, height: 510 },
    focus: { x: 0.5, y: 0.1 },
    alt: {
      fr: 'Traction à la barre fixe vue de dos, bras tendus',
      en: 'Pull-up on a fixed bar, seen from behind, arms extended',
    },
  },
  push_up: {
    source: require('../../../assets/media/exercises/push_up.webp'),
    ...BATCH_01,
    size: { width: 292, height: 505 },
    focus: { x: 0.5, y: 0.6 },
    alt: {
      fr: 'Pompe, corps gainé en planche, bras tendus',
      en: 'Push-up, body braced in a plank, arms extended',
    },
  },
};

/** The validated media of an exercise, or null (the UI then draws its artwork). */
export function exerciseMedia(exerciseId: string, registry: MediaRegistry = EXERCISE_MEDIA): ValidatedMedia | null {
  return validatedMedia(registry, exerciseId);
}
