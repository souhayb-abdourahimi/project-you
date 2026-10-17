import type { ImageSourcePropType } from 'react-native';

/**
 * One validated Project You media (W-10, D-045): an image reviewed for its exact subject, with its
 * licence and review date. Exercises (`exercise.id`) and recipes (`recipe.id`) use the same shape;
 * nothing else is ever shown as a photo — no random or "close enough" picture.
 */
export interface ValidatedMedia {
  /** A bundled asset (`require('@/assets/…')`) or a hosted URL of the Project You storage. */
  source: ImageSourcePropType;
  status: 'validated';
  /** Who made it and under which licence (audit only, never shown). */
  credit: string;
  /** Review date (ISO). */
  reviewedOn: string;
  /**
   * Focal point (0..1) kept visible when the same picture is cropped differently: a 16:10 hero, a
   * square thumbnail. Defaults to the centre.
   */
  focus?: { x: number; y: number };
  /** What the picture shows, for screen readers. */
  alt: { fr: string; en: string };
}

export type MediaRegistry = Readonly<Partial<Record<string, ValidatedMedia>>>;

/** The validated media of an id, or null (the UI then draws its artwork). */
export function validatedMedia(registry: MediaRegistry, id: string): ValidatedMedia | null {
  const entry = registry[id];
  return entry && entry.status === 'validated' ? entry : null;
}

/** `contentPosition` for expo-image from a focal point. */
export function focusPosition(media: ValidatedMedia): { left: string; top: string } {
  const { x, y } = media.focus ?? { x: 0.5, y: 0.5 };
  const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
  return { left: pct(x), top: pct(y) };
}

/** Problems of a registry against the known ids (tests and the media review). */
export function registryProblems(registry: MediaRegistry, ids: readonly string[]): string[] {
  const known = new Set(ids);
  const problems: string[] = [];
  for (const [id, entry] of Object.entries(registry)) {
    if (!known.has(id)) problems.push(`${id}: unknown id`);
    if (!entry) continue;
    if (entry.status !== 'validated') problems.push(`${id}: not validated`);
    if (!entry.credit.trim()) problems.push(`${id}: missing credit`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn)) problems.push(`${id}: missing review date`);
    if (!entry.alt.fr.trim() || !entry.alt.en.trim()) problems.push(`${id}: missing alt text`);
    if (entry.focus && [entry.focus.x, entry.focus.y].some((v) => v < 0 || v > 1))
      problems.push(`${id}: focus outside the picture`);
  }
  return problems;
}
