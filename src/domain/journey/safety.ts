/**
 * Safety rule of the Transformation Journey Engine (CLAUDE.md rule 8, docs/TRANSFORMATION_JOURNEY.md §4.5).
 * Detects excess, deterministically, from logged values only:
 * - several consecutive fully logged days well under the calorie target or under the floor (BMR);
 * - weight going down faster than the safe rate for two weeks in a row;
 * - more sessions than planned in a week together with high declared fatigue.
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
} as const;

export type SafetyFlag = 'low_intake' | 'fast_weight_loss' | 'training_load';

export interface SafetyAssessment {
  active: boolean;
  /** Most important first. */
  flags: SafetyFlag[];
  /** At least one day of the low-intake streak was under the floor (BMR or absolute floor). */
  belowFloor: boolean;
  /** Logged values that triggered the rule (never estimates). */
  evidence: Record<string, string>;
}

export const NO_SAFETY_ISSUE: SafetyAssessment = { active: false, flags: [], belowFloor: false, evidence: {} };

/** One day of the meal plan as the user logged it. */
export interface LoggedDay {
  date: IsoDate;
  /** Every planned meal is marked eaten or skipped, and at least one was eaten. */
  complete: boolean;
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

function fastWeightLoss(input: SafetyInput): boolean {
  const entries = input.weights.filter((w) => w.date <= input.today);
  if (entries.length === 0) return false;
  const last = entries.map((w) => w.date).reduce((a, b) => (a > b ? a : b));
  if (daysBetween(last, input.today) > SAFETY.weightRecentDays) return false;
  const windowAverage = (end: IsoDate): number | null => {
    const values = entries.filter((w) => w.date > addDays(end, -7) && w.date <= end).map((w) => w.weightKg);
    return values.length >= SAFETY.minWeighInsPerWindow ? values.reduce((s, v) => s + v, 0) / values.length : null;
  };
  const [a0, a1, a2] = [0, 7, 14].map((d) => windowAverage(addDays(last, -d)));
  if (a0 === null || a1 === null || a2 === null) return false;
  return (a1 - a0) / a1 > SAFETY.fastLossWeeklyRatio && (a2 - a1) / a2 > SAFETY.fastLossWeeklyRatio;
}

function trainingLoad(input: SafetyInput): { sessions: number } | null {
  const from = addDays(input.today, -(SAFETY.loadWindowDays - 1));
  const inWindow = (d: IsoDate) => d >= from && d <= input.today;
  const sessions = input.sessionDates.filter(inWindow).length;
  if (sessions <= input.plannedSessionsPerWeek) return null;
  const tiredDays = new Set(
    input.checkins.filter((c) => inWindow(c.date) && (c.fatigue >= 4 || c.energy <= 2)).map((c) => c.date),
  ).size;
  return tiredDays >= SAFETY.loadFatigueDays ? { sessions } : null;
}

export function evaluateSafety(input: SafetyInput): SafetyAssessment {
  const flags: SafetyFlag[] = [];
  const evidence: Record<string, string> = {};
  const intake = lowIntake(input);
  if (intake) {
    flags.push('low_intake');
    evidence.lowIntakeDays = String(intake.days);
  }
  if (fastWeightLoss(input)) {
    flags.push('fast_weight_loss');
    evidence.fastLossWeeks = '2';
  }
  const load = trainingLoad(input);
  if (load) {
    flags.push('training_load');
    evidence.sessionsLast7Days = String(load.sessions);
    evidence.plannedSessionsPerWeek = String(input.plannedSessionsPerWeek);
  }
  return { active: flags.length > 0, flags, belowFloor: intake?.belowFloor ?? false, evidence };
}
