/**
 * Weekly Check-in (docs/ADAPTATION_ENGINE.md §7): a very short questionnaire, closed answers only
 * (no free text: data minimisation; pain is a choice, never a detail or a diagnosis).
 */
import { z } from 'zod';

import { addDays, startOfWeek, weekdayOf, type IsoDate } from '../shared/dates';

export const MAIN_PROBLEMS = [
  'none',
  'time',
  'hunger',
  'cravings',
  'fatigue',
  'pain',
  'motivation',
  'budget',
  'social',
  'sleep',
  'schedule',
  'other',
] as const;
export type MainProblem = (typeof MAIN_PROBLEMS)[number];

const level = z.number().int().min(1).max(5);

export const WeeklyCheckin = z.object({
  /** Monday of the week the answers are about. */
  weekStart: z.iso.date(),
  weekRating: level,
  energy: level.optional(),
  motivation: level.optional(),
  fatigue: level.optional(),
  /** 1 = easy to follow … 5 = hard. */
  nutrition: level.optional(),
  training: level.optional(),
  difficulty: level.optional(),
  mainProblem: z.enum(MAIN_PROBLEMS).optional(),
  answeredAt: z.iso.datetime(),
});
export type WeeklyCheckin = z.infer<typeof WeeklyCheckin>;

/**
 * Which week a check-in answered today is about: from Friday to Sunday, the current week; on Monday
 * and Tuesday, the week that just ended (catch-up). Wednesday and Thursday: none (the week is
 * simply skipped, never a reproach).
 */
export function checkinWeek(today: IsoDate): IsoDate | null {
  const weekday = weekdayOf(today);
  if (weekday >= 5) return startOfWeek(today);
  if (weekday <= 2) return addDays(startOfWeek(today), -7);
  return null;
}

/** The weekly check-in is open and not answered yet. */
export function weeklyCheckinDue(today: IsoDate, answered: WeeklyCheckin[]): boolean {
  const week = checkinWeek(today);
  // Shown on Today from Sunday (the notification's day) to Tuesday; the screen stays reachable from Friday.
  if (!week || weekdayOf(today) === 5 || weekdayOf(today) === 6) return false;
  return !answered.some((c) => c.weekStart === week);
}

/** Weight and measurements are asked only to users who already track them (last 30 days). */
export function asksBody(today: IsoDate, lastWeighIn: IsoDate | null, lastMeasurement: IsoDate | null) {
  const recent = (d: IsoDate | null) => d !== null && d >= addDays(today, -30);
  return { weight: recent(lastWeighIn), measurements: recent(lastMeasurement) };
}
