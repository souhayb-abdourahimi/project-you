/**
 * Adaptation decisions (docs/ADAPTATION_ENGINE.md §9): the journal of what the Adaptation Engine
 * proposed and what the user decided. Append-only: only `status` changes.
 */
import type { IsoDate } from '../shared/dates';

export const ADAPTATION_KINDS = [
  'nutrition',
  'training',
  'planning',
  'reduce_load',
  'add_recovery',
  'simplify_tracking',
] as const;
export type AdaptationKind = (typeof ADAPTATION_KINDS)[number] | 'none';

export interface Adjustment {
  id: string;
  kind: (typeof ADAPTATION_KINDS)[number];
  /** What changes (`calories_per_day`, `sessions_per_week`, `light_week`…). */
  changeKey: string;
  from: number | string | null;
  to: number | string | null;
  reasonKey: string;
  evidence: Record<string, string | number>;
  status: 'proposed' | 'applied' | 'declined' | 'reverted';
  effectiveFrom: IsoDate;
  decidedAt: string;
}

/**
 * Calorie offset currently applied: `to` of the latest applied `calories_per_day` decision
 * (from/to are offsets in kcal/day against the computed target, e.g. 0 → −120). 0 when none.
 */
export function appliedCalorieOffset(adjustments: Adjustment[]): number {
  const latest = adjustments
    .filter((a) => a.status === 'applied' && a.changeKey === 'calories_per_day')
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
    .at(-1);
  return latest ? Number(latest.to) || 0 : 0;
}

/** Sessions per week chosen through an applied adaptation, or null (the profile value stands). */
export function appliedSessionsPerWeek(adjustments: Adjustment[]): number | null {
  const latest = adjustments
    .filter((a) => a.status === 'applied' && a.changeKey === 'sessions_per_week')
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
    .at(-1);
  return latest ? Number(latest.to) : null;
}
