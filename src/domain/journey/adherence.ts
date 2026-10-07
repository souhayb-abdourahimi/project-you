/**
 * Adherence (docs/ADAPTATION_ENGINE.md §3): "is the plan doable?", never "did you do well?".
 * Short and light sessions count as done, a replaced session is "adapted" (neither done nor
 * missed), a past day with nothing recorded is "not logged" (not "ignored"), and today is never
 * counted as missed. Shown only as a positive sentence; mostly read by the adaptation rules.
 */
import { addDays, type IsoDate } from '../shared/dates';
import type { SessionOutcome } from './outcomes';

export interface AdherenceInput {
  today: IsoDate;
  /** Dates of planned sessions (after rescheduling), any range. */
  plannedSessionDates: IsoDate[];
  completedSessions: { date: IsoDate; sessionIndex: number }[];
  /** Keyed `${date}#${sessionIndex}`. */
  sessionOutcomes: Record<string, SessionOutcome>;
  /**
   * Past days whose plan is unknown (no stored prescription, W-7.1 `unknownPrescriptionDates`):
   * left out on both sides, so nothing is counted against a plan nobody knows.
   */
  unknownDates?: readonly IsoDate[];
  /** Planned meals with their status (current plan, last week's and the journal). */
  meals: { date: IsoDate; status: 'planned' | 'eaten' | 'skipped' | 'replaced' }[];
}

export interface SessionAdherence {
  /** Planned sessions whose day has come (today only once it has an outcome). */
  planned: number;
  done: number;
  adapted: number;
  skipped: number;
  notLogged: number;
  /** done / (planned − adapted); null when nothing could be done yet. */
  ratio: number | null;
  /** Days of the window whose original prescription is unavailable (not counted). */
  unknownDays: number;
}

export interface Adherence {
  windowDays: number;
  sessions: SessionAdherence;
  /** Meals marked (eaten, skipped, replaced) / meals planned on past days; null without a meal plan. */
  mealLogging: { planned: number; logged: number; ratio: number | null } | null;
}

const ratio = (part: number, whole: number) => (whole > 0 ? Math.min(1, part / whole) : null);

export function adherence(input: AdherenceInput, windowDays: 14 | 28 = 14): Adherence {
  const from = addDays(input.today, -(windowDays - 1));
  const unknown = new Set(input.unknownDates ?? []);
  const inWindow = (d: IsoDate) => d >= from && d <= input.today && !unknown.has(d);
  const doneDates = input.completedSessions.filter((c) => inWindow(c.date));
  const outcomes = Object.entries(input.sessionOutcomes)
    .map(([key, o]) => ({ date: key.split('#')[0], status: o.status }))
    .filter((o) => inWindow(o.date));
  const doneToday = doneDates.some((c) => c.date === input.today) || outcomes.some((o) => o.date === input.today);
  const planned = input.plannedSessionDates.filter((d) => inWindow(d) && (d < input.today || doneToday)).length;
  const done = doneDates.length;
  const adapted = outcomes.filter((o) => o.status === 'replaced').length;
  const skipped = outcomes.filter((o) => o.status === 'skipped').length;

  const pastMeals = input.meals.filter((m) => m.date >= from && m.date < input.today);
  const logged = pastMeals.filter((m) => m.status !== 'planned').length;

  return {
    windowDays,
    sessions: {
      planned,
      done,
      adapted,
      skipped,
      notLogged: Math.max(0, planned - done - adapted - skipped),
      ratio: ratio(done, planned - adapted),
      unknownDays: [...unknown].filter((d) => d >= from && d <= input.today).length,
    },
    mealLogging:
      pastMeals.length > 0 ? { planned: pastMeals.length, logged, ratio: ratio(logged, pastMeals.length) } : null,
  };
}
