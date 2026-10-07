/**
 * Minimum data before a before / after comparison says anything (W-7.1, D-041). One place: the
 * effect of an adaptation, the coach's follow-up, Progression and the history all read it. Below
 * it, the answer is `insufficient_data`: a missing check-in is never an improvement.
 */
export const EFFECT_COVERAGE = {
  /** Fatigue: share of the window's days with a declared fatigue (daily check-in), each side. */
  minCheckinShare: 0.5,
  /** Fatigue: and never fewer check-in days than this, each side. */
  minCheckinDays: 3,
  /** Completion: planned sessions (from their prescriptions) needed on each side. */
  minPlannedSessions: 2,
} as const;

/** Check-in days a window of `days` days needs before its fatigue can be compared. */
export function minCheckinDays(days: number): number {
  return Math.max(EFFECT_COVERAGE.minCheckinDays, Math.ceil(days * EFFECT_COVERAGE.minCheckinShare));
}
