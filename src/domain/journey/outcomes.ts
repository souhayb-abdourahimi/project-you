/**
 * What actually happened, as the user recorded it (docs/ADAPTATION_ENGINE.md §3). Reasons are
 * optional and chosen from closed lists: never guessed, never free text (data minimisation).
 */
import { daysBetween, type IsoDate } from '../shared/dates';
import type { ReplacementReason } from '../training/replacement';

/** Why a meal was skipped or replaced, when the user said so. */
export const MEAL_REASONS = [
  'not_hungry',
  'no_time',
  'missing_ingredient',
  'restaurant',
  'wanted_else',
  'forgot',
] as const;
export type MealReason = (typeof MEAL_REASONS)[number];

/** Why a planned session was skipped or replaced, when the user said so. */
export const SESSION_REASONS = ['no_time', 'no_motivation', 'tired', 'pain', 'schedule', 'other'] as const;
export type SessionReason = (typeof SESSION_REASONS)[number];

/** What the user did instead of the planned session. */
export const LIGHT_ACTIVITIES = ['walk', 'mobility', 'rest', 'other_sport'] as const;
export type LightActivity = (typeof LIGHT_ACTIVITIES)[number];

/** A planned session that was not done as planned (done sessions live in `completedSessions`). */
export interface SessionOutcome {
  status: 'skipped' | 'replaced';
  replacedBy?: LightActivity;
  reason?: SessionReason;
  at: string;
}

/** How the user framed the day (buttons on Today): never inferred. */
export const DAY_MODES = ['normal', 'difficult', 'short', 'low_motivation'] as const;
export type DayMode = (typeof DAY_MODES)[number];

/**
 * One row of `daily_checkins`: the day's declared state, the mode chosen and any light activity
 * done. Every field is optional: the user answers only what they want.
 */
export interface DayLog {
  date: IsoDate;
  energy?: number;
  motivation?: number;
  fatigue?: number;
  availableMinutes?: number;
  mode?: DayMode;
  activity?: Exclude<LightActivity, 'other_sport'>;
  activityMinutes?: number;
}

/** Day logs that carry the three declared levels, as the journey state reads them. */
export function checkinSignals(
  logs: readonly DayLog[],
): { date: IsoDate; energy: number; motivation: number; fatigue: number }[] {
  const out: { date: IsoDate; energy: number; motivation: number; fatigue: number }[] = [];
  for (const d of logs) {
    if (d.energy === undefined || d.motivation === undefined || d.fatigue === undefined) continue;
    out.push({ date: d.date, energy: d.energy, motivation: d.motivation, fatigue: d.fatigue });
  }
  return out;
}

/**
 * Declared fatigue on a day (the single definition, used by the journey state and the progression
 * engine, D-035): the most recent check-in of that day or the day before; high when fatigue ≥ 4 or
 * energy ≤ 2; unknown without a check-in (never guessed).
 */
export function declaredFatigue(
  checkins: readonly { date: IsoDate; energy: number; fatigue: number }[],
  date: IsoDate,
): 'high' | 'normal' | 'unknown' {
  const recent = checkins
    .filter((c) => c.date <= date && daysBetween(c.date, date) <= 1)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!recent) return 'unknown';
  return recent.fatigue >= 4 || recent.energy <= 2 ? 'high' : 'normal';
}

/** An exercise swapped during a session, with the reason picked by the user. */
export interface ExerciseSwap {
  /** `${date}#${sessionIndex}` */
  session: string;
  fromId: string;
  toId: string;
  reason: ReplacementReason;
}

/** A meal the user marked, kept after its week leaves the plan (journal of the journey). */
export interface MealLogEntry {
  /** Planner meal id (`${date}…`), also the server row's source id. */
  id: string;
  /** Server row id when the entry came from another device (its planner id is unknown here). */
  rowId?: string;
  date: IsoDate;
  slot: 'breakfast' | 'lunch' | 'snack' | 'dinner';
  recipeId: string;
  servings: number;
  status: 'eaten' | 'skipped' | 'replaced';
  reason?: MealReason;
  kcal: number;
}

/** Body measurements other than the waist (the waist keeps its own list for compatibility). */
export const MEASUREMENT_KINDS = ['hips', 'chest', 'arm', 'thigh', 'neck'] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];

export interface MeasurementEntry {
  id: string;
  date: IsoDate;
  kind: MeasurementKind;
  cm: number;
}

/** A milestone reached (derived) and whether it was celebrated: celebrated once, on any device. */
export interface MilestoneRecord {
  reachedOn: IsoDate;
  celebratedAt: string | null;
}
