/**
 * Safety rule of the Transformation Journey Engine (CLAUDE.md rule 8, docs/TRANSFORMATION_JOURNEY.md §4.5).
 * Detects excess, deterministically, from logged values only:
 * - several consecutive fully logged days well under the calorie target or under the floor (BMR);
 * - weight going down faster than the safe rate for two weeks in a row;
 * - more sessions than planned in a week together with high declared fatigue.
 * It also covers the users who log little, the profile most at risk (docs/TRANSFORMATION_JOURNEY.md §4.5):
 * - low_logging: several recent days with meals neither marked eaten nor skipped, from someone who
 *   logged before; a neutral check-in, not the full safety message;
 * - fast_weight_loss with one weigh-in per week: speaks only when the trend is clearly above the
 *   safe rate, and says the measure is infrequent so the trend is imprecise;
 * - training_load on frequency alone: far more sessions than planned several weeks in a row,
 *   without declared fatigue (check-ins are optional); a proposal to slow down, not an alert.
 * When active, every channel slows down: no congratulations, no push, an explanation instead.
 * It is evaluated before any motivation rule. Thresholds are design parameters (to be reviewed by
 * a health professional before the public beta), not external data.
 */
import { addDays, daysBetween, type IsoDate } from '../shared/dates';

export const SAFETY = {
  /** A logged day under this share of its target counts as "well under". */
  lowIntakeRatio: 0.7,
  lowIntakeDays: 3,
  /** The low-intake streak must have ended this recently (days before today). */
  lowIntakeRecentDays: 2,
  /** Weekly drop of the 7-day weight average, as a share of body weight. */
  fastLossWeeklyRatio: 0.01,
  /** Weigh-ins needed in each 7-day window. */
  minWeighInsPerWindow: 2,
  /** The latest weigh-in must be this recent for the weight rule to speak. */
  weightRecentDays: 7,
  loadWindowDays: 7,
  /** Days with high declared fatigue (fatigue ≥ 4 or energy ≤ 2) in the window. */
  loadFatigueDays: 2,

  // Added for users who log little (PR #3). Design parameters, to be reviewed by a health professional.
  /** Consecutive past days with at least one meal neither marked eaten nor skipped. */
  lowLoggingDays: 3,
  /** "Logged before": fully logged days needed in the window just before the unlogged streak. */
  lowLoggingPriorLoggedDays: 3,
  lowLoggingPriorWindowDays: 7,
  /** Weigh-ins per 7-day window on the degraded path (one is enough). */
  sparseMinWeighInsPerWindow: 1,
  /** Degraded path: weekly drop needed, two weeks in a row (twice the safe rate: clearly above it). */
  sparseFastLossWeeklyRatio: 0.02,
  /** Frequency alone: sessions in a 7-day window at least planned × ratio and planned + extra… */
  loadFrequencyRatio: 1.5,
  loadFrequencyMinExtra: 2,
  /** …in this many consecutive 7-day windows (ending today). */
  loadFrequencyWeeks: 3,
} as const;

/** Most important first; `low_logging` is the weakest signal (a neutral check-in). */
export type SafetyFlag = 'low_intake' | 'fast_weight_loss' | 'training_load' | 'low_logging';

export interface SafetyAssessment {
  active: boolean;
  /** Most important first. */
  flags: SafetyFlag[];
  /** At least one day of the low-intake streak was under the floor (BMR or absolute floor). */
  belowFloor: boolean;
  /** `sparse`: the weight rule spoke with a single weigh-in in some week, so the trend is imprecise. */
  weightPrecision: 'regular' | 'sparse' | null;
  /** `frequency`: the load rule spoke on session frequency alone, without declared fatigue. */
  trainingLoadBasis: 'fatigue' | 'frequency' | null;
  /** First day of the current low-logging episode (one check-in per episode). */
  lowLoggingSince: IsoDate | null;
  /** Logged values that triggered the rule (never estimates). */
  evidence: Record<string, string>;
}

export const NO_SAFETY_ISSUE: SafetyAssessment = {
  active: false,
  flags: [],
  belowFloor: false,
  weightPrecision: null,
  trainingLoadBasis: null,
  lowLoggingSince: null,
  evidence: {},
};

/** One day of the meal plan as the user logged it. */
export interface LoggedDay {
  date: IsoDate;
  /** Every planned meal is marked eaten or skipped, and at least one was eaten. */
  complete: boolean;
  /** Planned meals still neither marked eaten nor skipped. */
  unmarkedMeals: number;
  /** Energy of the meals marked eaten. */
  kcal: number;
  targetKcal: number;
}

export interface SafetyInput {
  today: IsoDate;
  loggedDays: LoggedDay[];
  floorKcal: number | null;
  weights: { date: IsoDate; weightKg: number }[];
  sessionDates: IsoDate[];
  plannedSessionsPerWeek: number;
  checkins: { date: IsoDate; energy: number; fatigue: number }[];
}

function lowIntake(input: SafetyInput): { days: number; belowFloor: boolean } | null {
  const { today, floorKcal } = input;
  const days = input.loggedDays
    .filter((d) => d.date < today && d.complete)
    .sort((a, b) => a.date.localeCompare(b.date));
  const isLow = (d: LoggedDay) =>
    d.kcal < SAFETY.lowIntakeRatio * d.targetKcal || (floorKcal !== null && d.kcal < floorKcal);
  let best: LoggedDay[] | null = null;
  let streak: LoggedDay[] = [];
  for (const d of days) {
    const follows = streak.length > 0 && daysBetween(streak[streak.length - 1].date, d.date) === 1;
    streak = isLow(d) ? (follows ? [...streak, d] : [d]) : [];
    if (
      streak.length >= SAFETY.lowIntakeDays &&
      daysBetween(streak[streak.length - 1].date, today) <= SAFETY.lowIntakeRecentDays
    ) {
      best = streak;
    }
  }
  if (!best) return null;
  return { days: best.length, belowFloor: floorKcal !== null && best.some((d) => d.kcal < floorKcal) };
}

function fastWeightLoss(input: SafetyInput): 'regular' | 'sparse' | null {
  const entries = input.weights.filter((w) => w.date <= input.today);
  if (entries.length === 0) return null;
  const last = entries.map((w) => w.date).reduce((a, b) => (a > b ? a : b));
  if (daysBetween(last, input.today) > SAFETY.weightRecentDays) return null;
  const windows = [0, 7, 14].map((d) => {
    const end = addDays(last, -d);
    return entries.filter((w) => w.date > addDays(end, -7) && w.date <= end).map((w) => w.weightKg);
  });
  const average = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
  const twoFastWeeks = (ratio: number) => {
    const [a0, a1, a2] = windows.map(average);
    return (a1 - a0) / a1 > ratio && (a2 - a1) / a2 > ratio;
  };
  if (windows.every((w) => w.length >= SAFETY.minWeighInsPerWindow)) {
    return twoFastWeeks(SAFETY.fastLossWeeklyRatio) ? 'regular' : null;
  }
  // Degraded path: one weigh-in per week is noisy, so only a trend clearly above the safe rate speaks.
  if (windows.every((w) => w.length >= SAFETY.sparseMinWeighInsPerWindow)) {
    return twoFastWeeks(SAFETY.sparseFastLossWeeklyRatio) ? 'sparse' : null;
  }
  return null;
}

function trainingLoad(input: SafetyInput): { sessions: number; basis: 'fatigue' | 'frequency' } | null {
  const window = (weeksAgo: number) => {
    const to = addDays(input.today, -7 * weeksAgo);
    const from = addDays(to, -(SAFETY.loadWindowDays - 1));
    return (d: IsoDate) => d >= from && d <= to;
  };
  const inWindow = window(0);
  const sessions = input.sessionDates.filter(inWindow).length;
  if (sessions <= input.plannedSessionsPerWeek) return null;
  const tiredDays = new Set(
    input.checkins.filter((c) => inWindow(c.date) && (c.fatigue >= 4 || c.energy <= 2)).map((c) => c.date),
  ).size;
  if (tiredDays >= SAFETY.loadFatigueDays) return { sessions, basis: 'fatigue' };
  // Check-ins are optional: far above the plan several weeks in a row is enough to propose slowing down.
  const planned = input.plannedSessionsPerWeek;
  const far = Math.max(planned + SAFETY.loadFrequencyMinExtra, Math.ceil(planned * SAFETY.loadFrequencyRatio));
  const everyWeek = Array.from({ length: SAFETY.loadFrequencyWeeks }, (_, w) => window(w)).every(
    (inWeek) => input.sessionDates.filter(inWeek).length >= far,
  );
  return everyWeek ? { sessions, basis: 'frequency' } : null;
}

/**
 * Low logging: the latest past days have meals neither marked eaten nor skipped, from a user who
 * fully logged days just before. Returns the episode's first day.
 */
function lowLogging(input: SafetyInput): { since: IsoDate; days: number } | null {
  const { today } = input;
  const byDate = new Map(input.loggedDays.filter((d) => d.date < today).map((d) => [d.date, d]));
  const unlogged = (date: IsoDate) => {
    const d = byDate.get(date);
    return d !== undefined && d.unmarkedMeals > 0;
  };
  let since = addDays(today, -1);
  if (!unlogged(since)) return null;
  while (unlogged(addDays(since, -1))) since = addDays(since, -1);
  const days = daysBetween(since, today);
  if (days < SAFETY.lowLoggingDays) return null;
  let loggedBefore = 0;
  for (let i = 1; i <= SAFETY.lowLoggingPriorWindowDays; i++) {
    if (byDate.get(addDays(since, -i))?.complete) loggedBefore++;
  }
  return loggedBefore >= SAFETY.lowLoggingPriorLoggedDays ? { since, days } : null;
}

export function evaluateSafety(input: SafetyInput): SafetyAssessment {
  const flags: SafetyFlag[] = [];
  const evidence: Record<string, string> = {};
  const intake = lowIntake(input);
  if (intake) {
    flags.push('low_intake');
    evidence.lowIntakeDays = String(intake.days);
  }
  const weightPrecision = fastWeightLoss(input);
  if (weightPrecision) {
    flags.push('fast_weight_loss');
    evidence.fastLossWeeks = '2';
    if (weightPrecision === 'sparse') evidence.weighInsPerWeek = 'one';
  }
  const load = trainingLoad(input);
  if (load) {
    flags.push('training_load');
    evidence.sessionsLast7Days = String(load.sessions);
    evidence.plannedSessionsPerWeek = String(input.plannedSessionsPerWeek);
    if (load.basis === 'frequency') evidence.loadWeeks = String(SAFETY.loadFrequencyWeeks);
  }
  const logging = lowLogging(input);
  if (logging) {
    flags.push('low_logging');
    evidence.unloggedDays = String(logging.days);
  }
  return {
    active: flags.length > 0,
    flags,
    belowFloor: intake?.belowFloor ?? false,
    weightPrecision,
    trainingLoadBasis: load?.basis ?? null,
    lowLoggingSince: logging?.since ?? null,
    evidence,
  };
}
