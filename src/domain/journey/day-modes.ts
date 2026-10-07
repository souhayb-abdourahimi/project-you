/**
 * Difficult day, "J'ai 15 minutes" and "Je n'ai pas envie" (docs/DAILY_COACH.md §7). Built only from
 * what the user declared (check-in of the day, buttons) or planned (availability, calendar): the
 * coach never guesses how the user feels. The answer is always a smaller version of the day,
 * never giving up the programme.
 */
import { SESSION_DURATION } from '../training/durations';

import type { DayLog } from './outcomes';

export const DAY_MODE = {
  /** Available time under this share of the planned session counts as "little time". */
  littleTimeRatio: 0.5,
  /** Fixed constraints or calendar events today from which the day counts as busy. */
  busyConstraints: 2,
  /** Signals needed to call the day difficult without the user saying so. */
  difficultSignals: 2,
  // Same numbers as the workout screen builds (single source, D-034).
  minimalSessionMinutes: SESSION_DURATION.minimal,
  shortSessionMinutes: SESSION_DURATION.short,
  walkMinutes: 15,
  mobilityMinutes: 10,
  comebackWalkMinutes: 10,
} as const;

export type DifficultySignal = 'little_time' | 'tired' | 'low_motivation' | 'busy';

export interface DayContext {
  dayLog: DayLog | null;
  /** Planned session length today; null without a session. */
  plannedSessionMinutes: number | null;
  /** Free minutes today (availability minus constraints and calendar); null when unknown. */
  freeMinutesToday: number | null;
  fixedConstraintsToday: number;
}

export function difficultySignals(ctx: DayContext): DifficultySignal[] {
  const log = ctx.dayLog;
  const out: DifficultySignal[] = [];
  const planned = ctx.plannedSessionMinutes;
  const available = log?.availableMinutes ?? null;
  if (
    (planned !== null && available !== null && available < planned * DAY_MODE.littleTimeRatio) ||
    (planned !== null && ctx.freeMinutesToday === 0)
  ) {
    out.push('little_time');
  }
  if ((log?.fatigue ?? 0) >= 4 || (log?.energy ?? 5) <= 2) out.push('tired');
  if ((log?.motivation ?? 5) <= 2) out.push('low_motivation');
  if (ctx.fixedConstraintsToday >= DAY_MODE.busyConstraints) out.push('busy');
  return out;
}

/** The user said so, or at least two declared/planned signals agree. */
export function isDifficultDay(ctx: DayContext): boolean {
  if (ctx.dayLog?.mode === 'difficult') return true;
  return difficultySignals(ctx).length >= DAY_MODE.difficultSignals;
}

export type MinimalVersion =
  | { kind: 'session'; minutes: number }
  | { kind: 'mobility'; minutes: number }
  | { kind: 'walk'; minutes: number }
  | { kind: 'rest' };

/**
 * The minimal version of a difficult day: very tired → rest; tired → mobility; a planned session →
 * 20 minutes (15 when even that does not fit); otherwise a short walk. Keeps the feeling of progress.
 */
export function minimalVersion(ctx: DayContext, options: { slowDown?: boolean } = {}): MinimalVersion {
  const log = ctx.dayLog;
  if ((log?.fatigue ?? 0) >= 5 || (log?.energy ?? 5) <= 1) return { kind: 'rest' };
  if ((log?.fatigue ?? 0) >= 4 || options.slowDown) return { kind: 'mobility', minutes: DAY_MODE.mobilityMinutes };
  if (ctx.plannedSessionMinutes !== null) {
    const available = log?.availableMinutes ?? ctx.freeMinutesToday;
    const minutes =
      available !== null && available < DAY_MODE.minimalSessionMinutes
        ? DAY_MODE.shortSessionMinutes
        : DAY_MODE.minimalSessionMinutes;
    return { kind: 'session', minutes: Math.min(minutes, ctx.plannedSessionMinutes) };
  }
  return { kind: 'walk', minutes: DAY_MODE.walkMinutes };
}

export interface ShortDayPlan {
  /** Session length for today (null without a session today). */
  sessionMinutes: number | null;
  /** Planned meals of today that take longer than the time available: a faster recipe is proposed. */
  mealsToSpeedUp: string[];
  /** Organisation items of today proposed for another day. */
  deferred: ('meal_prep' | 'shopping')[];
}

/** "J'ai 15 minutes": a short version of the whole day (sport, meals, organisation). Never a failure. */
export function shortDay(input: {
  minutes: number;
  hasSession: boolean;
  meals: { id: string; status: string; minutes: number }[];
  organisation: ('meal_prep' | 'shopping')[];
}): ShortDayPlan {
  return {
    sessionMinutes: input.hasSession ? Math.min(input.minutes, DAY_MODE.minimalSessionMinutes) : null,
    mealsToSpeedUp: input.meals.filter((m) => m.status === 'planned' && m.minutes > input.minutes).map((m) => m.id),
    deferred: [...input.organisation],
  };
}

export type NoMotivationOption = 'rest' | 'short_session' | 'light_activity' | 'reschedule' | 'skip_this_week';

/**
 * "Je n'ai pas envie": short version, light activity, smart reschedule or rest. Rest comes first when
 * the user is tired, when the safety rule asks to slow down, or when this week's sessions are done.
 * Without a free slot later this week, the session is simply left for this week (no catch-up).
 */
export function noMotivationOptions(input: {
  dayLog: DayLog | null;
  slowDown: boolean;
  sessionsDoneThisWeek: number;
  plannedPerWeek: number;
  canReschedule: boolean;
}): NoMotivationOption[] {
  const tired = (input.dayLog?.fatigue ?? 0) >= 4 || (input.dayLog?.energy ?? 5) <= 2;
  const restFirst = tired || input.slowDown || input.sessionsDoneThisWeek >= input.plannedPerWeek;
  const later: NoMotivationOption = input.canReschedule ? 'reschedule' : 'skip_this_week';
  const options: NoMotivationOption[] = restFirst
    ? ['rest', 'light_activity', later]
    : ['short_session', 'light_activity', later, 'rest'];
  // Pushing for a session is never offered while the safety rule asks to slow down.
  return input.slowDown ? options.filter((o) => o !== 'short_session') : options;
}
