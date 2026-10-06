/**
 * Session durations (W-3, D-034): the single source of truth for every duration a session can be
 * announced or prescribed with. The Daily Coach announces one of these, the workout screen builds
 * the variant with the same number, and the prescription stores it (`adapted_minutes`): what is
 * announced is what is prescribed.
 */
export const SESSION_DURATION = {
  /** "J'ai 15 minutes", comeback, short slot by default. */
  short: 15,
  /** Difficult day or low motivation: the minimal version of a planned session. */
  minimal: 20,
  /** Shortest session the engine builds (fewer minutes → a walk or mobility, never a session). */
  shortest: 10,
  /** A short session keeps its rest under this (it fits in the time by resting less, not by cutting). */
  shortRestSeconds: 60,
  /** Warm-up counted in a short session (the full one counts 8 minutes, see `estimateMinutes`). */
  shortWarmUpMinutes: 4,
  /** Minutes offered on "J'ai peu de temps". */
  choices: [10, 15, 20, 30, 45, 60],
} as const;

/** The length of a short session for what the user has, never longer than the planned session. */
export function shortMinutes(available: number | null | undefined, planned: number): number {
  const wanted = Math.round(available ?? SESSION_DURATION.short);
  return Math.max(SESSION_DURATION.shortest, Math.min(wanted, Math.max(planned, SESSION_DURATION.shortest)));
}
