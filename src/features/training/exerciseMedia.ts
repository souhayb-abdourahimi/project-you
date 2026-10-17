import type { ImageSourcePropType } from 'react-native';

/**
 * Exercise media registry (W-10): `exercise.id -> validated Project You media`, nothing else.
 *
 * Only an entry listed here, reviewed and marked `validated`, is ever shown as a photo. Without one
 * the UI draws its neutral artwork: never a random web image, never a picture of another movement.
 *
 * Status (2026-10-17): no production asset is validated yet. The 36 crops of the "guide ultime des
 * exercices en salle" poster are temporary visual references (baked-in labels and numbers, 163×248
 * px); they are deliberately NOT bundled. Production assets spec and review checklist:
 * docs/EXERCISE_MEDIA.md.
 */
export interface ExerciseMediaEntry {
  /** A bundled asset (`require('@/../assets/exercises/<id>.webp')`) or a hosted URL. */
  source: ImageSourcePropType;
  status: 'validated';
  /** Who made it and under which licence (shown nowhere, kept for the audit). */
  credit: string;
  /** Review date (ISO). */
  reviewedOn: string;
}

export const EXERCISE_MEDIA: Readonly<Partial<Record<string, ExerciseMediaEntry>>> = {};

/** The validated media of an exercise, or null (the UI then draws its artwork). */
export function exerciseMedia(
  exerciseId: string,
  registry: Readonly<Partial<Record<string, ExerciseMediaEntry>>> = EXERCISE_MEDIA,
): ImageSourcePropType | null {
  const entry = registry[exerciseId];
  return entry && entry.status === 'validated' ? entry.source : null;
}
