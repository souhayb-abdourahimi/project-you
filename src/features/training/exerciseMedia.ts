import { validatedMedia, type MediaRegistry, type ValidatedMedia } from '@/features/media/registry';

/**
 * Exercise media registry (W-10): `exercise.id -> validated Project You media`, nothing else.
 *
 * Status (2026-10-17): no production asset is validated yet. The 36 crops of the "guide ultime des
 * exercices en salle" poster are temporary visual references (baked-in labels and numbers, 163×248
 * px) and are deliberately NOT bundled. Expected files, format and review checklist:
 * docs/EXERCISE_MEDIA.md. Adding one:
 *
 *   bench_press: {
 *     source: require('@/assets/media/exercises/bench_press.webp'),
 *     status: 'validated', credit: 'Project You — studio 2026', reviewedOn: '2026-11-02',
 *     focus: { x: 0.5, y: 0.4 }, alt: { fr: 'Développé couché barre, barre au-dessus de la poitrine', en: '…' },
 *   },
 */
export const EXERCISE_MEDIA: MediaRegistry = {};

/** The validated media of an exercise, or null (the UI then draws its artwork). */
export function exerciseMedia(exerciseId: string, registry: MediaRegistry = EXERCISE_MEDIA): ValidatedMedia | null {
  return validatedMedia(registry, exerciseId);
}
