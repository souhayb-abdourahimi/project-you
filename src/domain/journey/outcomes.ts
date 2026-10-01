/**
 * What actually happened, as the user recorded it (docs/ADAPTATION_ENGINE.md §3). Reasons are
 * optional and chosen from closed lists: never guessed, never free text (data minimisation).
 */
import type { IsoDate } from '../shared/dates';
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

/** An exercise swapped during a session, with the reason picked by the user. */
export interface ExerciseSwap {
  /** `${date}#${sessionIndex}` */
  session: string;
  fromId: string;
  toId: string;
  reason: ReplacementReason;
}
