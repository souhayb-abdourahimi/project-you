/**
 * How the week's placement is said (D-050). Pure: words chosen from the planner's result, nothing
 * recomputed, and never an hour the planner did not give.
 */
import type { WeeklyPlan } from '@/domain/planning/engine';

/** "17:30 · Haut du corps · ≈ 39 min · Salle": the parts that exist, in that order. */
export function sessionLine(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p).join(' · ');
}

export type PlacementSummary =
  | { kind: 'placed'; count: number }
  | { kind: 'partial'; placed: number; requested: number }
  | { kind: 'none' };

/** What the calendar did to this week, for the Calendrier screen. Null when no calendar frames it. */
export function placementSummary(
  plan: Pick<WeeklyPlan, 'days' | 'availability' | 'warnings'>,
  requested: number,
): PlacementSummary | null {
  if (plan.availability === 'none') return null;
  const placed = plan.days.reduce(
    (n, d) => n + d.items.filter((i) => i.kind === 'workout' && i.start !== null).length,
    0,
  );
  if (placed === 0) return { kind: 'none' };
  if (placed < requested) return { kind: 'partial', placed, requested };
  return { kind: 'placed', count: placed };
}
