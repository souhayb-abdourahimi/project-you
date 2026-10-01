/**
 * Facts the Progress Journey and its milestones are built from (docs/PROGRESS_JOURNEY.md §1).
 * Everything here is recomputed from recorded data: sessions, sets, weigh-ins, measurements, marked
 * meals and check-ins. No estimate (no 1RM, no body composition, no calories burned).
 */
import { addDays, daysBetween, startOfWeek, type IsoDate } from '../shared/dates';
import type { LoggedSet } from '../training/progression';
import type { DayLog } from './outcomes';

export interface ProgressData {
  completedSessions: { date: IsoDate; sessionIndex: number; variant: 'full' | 'short' | 'light' }[];
  /** Keyed `${date}#${sessionIndex}`. */
  setLogs: Record<string, Record<string, LoggedSet[]>>;
  weights: { date: IsoDate; weightKg: number }[];
  waist: { date: IsoDate; cm: number }[];
  measurements: { date: IsoDate; kind: string; cm: number }[];
  dayLogs: DayLog[];
  meals: { date: IsoDate; status: 'planned' | 'eaten' | 'skipped' | 'replaced' }[];
  weeklyCheckins: { weekStart: IsoDate; answeredAt: string }[];
}

const byDate = <T extends { date: IsoDate }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.date.localeCompare(b.date));

/** Days with a session, a light activity, a marked meal, a weigh-in, a measurement or a check-in. */
export function activeDates(d: ProgressData): IsoDate[] {
  const dates = new Set<IsoDate>();
  for (const s of d.completedSessions) dates.add(s.date);
  for (const l of d.dayLogs) dates.add(l.date);
  for (const m of d.meals) if (m.status !== 'planned') dates.add(m.date);
  for (const w of d.weights) dates.add(w.date);
  for (const w of d.waist) dates.add(w.date);
  for (const m of d.measurements) dates.add(m.date);
  return [...dates].sort();
}

export function sessionDates(d: ProgressData): IsoDate[] {
  return d.completedSessions.map((s) => s.date).sort();
}

/** Monday of every week from the start week to the current week, oldest first. */
export function weeksSince(startedOn: IsoDate, today: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let w = startOfWeek(startedOn); w <= today; w = addDays(w, 7)) out.push(w);
  return out;
}

/** Sessions done per week (Monday key). */
export function sessionsPerWeek(d: ProgressData): Map<IsoDate, IsoDate[]> {
  const out = new Map<IsoDate, IsoDate[]>();
  for (const date of sessionDates(d)) {
    const w = startOfWeek(date);
    out.set(w, [...(out.get(w) ?? []), date]);
  }
  return out;
}

/**
 * Consecutive weeks with at least `min` sessions, ending with the current week, or with last week
 * while the current week has not reached `min` yet (a week in progress never breaks the streak).
 */
export function weekStreak(d: ProgressData, today: IsoDate, min = 1): number {
  const per = sessionsPerWeek(d);
  let week = startOfWeek(today);
  if ((per.get(week)?.length ?? 0) < min) week = addDays(week, -7);
  let n = 0;
  while ((per.get(week)?.length ?? 0) >= min) {
    n += 1;
    week = addDays(week, -7);
  }
  return n;
}

/**
 * The first date on which `length` consecutive weeks with at least `min` sessions were complete:
 * the date of the session that met the quota of the last week of the run. Null when never.
 */
export function streakReachedOn(d: ProgressData, length: number, min = 1): IsoDate | null {
  const per = sessionsPerWeek(d);
  const weeks = [...per.keys()].sort();
  for (const end of weeks) {
    let ok = true;
    for (let i = 0; i < length && ok; i++) ok = (per.get(addDays(end, -7 * i))?.length ?? 0) >= min;
    if (ok) return per.get(end)![min - 1];
  }
  return null;
}

/** 7-day average of the weigh-ins ending on `date`, with at least `minEntries` weigh-ins; else null. */
export function weightAverageAt(weights: ProgressData['weights'], date: IsoDate, minEntries = 2): number | null {
  const from = addDays(date, -6);
  const values = weights.filter((w) => w.date >= from && w.date <= date).map((w) => w.weightKg);
  if (values.length < minEntries) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

/** Average of the first week that holds at least 2 weigh-ins, with the date that week ends. */
export function startWeight(weights: ProgressData['weights']): { avgKg: number; until: IsoDate } | null {
  for (const w of byDate(weights)) {
    const until = addDays(w.date, 6);
    // The 7-day window ending on `until` starts on this weigh-in.
    const avgKg = weightAverageAt(weights, until);
    if (avgKg !== null) return { avgKg, until };
  }
  return null;
}

export interface PersonalRecord {
  exerciseId: string;
  date: IsoDate;
  loadKg: number;
  reps: number;
  /** Heavier load than ever, or more reps than ever at this load or above. */
  kind: 'load' | 'reps';
}

/** Sessions with their sets, in date order. */
function loggedSessions(d: Pick<ProgressData, 'setLogs'>): { date: IsoDate; exercises: Record<string, LoggedSet[]> }[] {
  return Object.entries(d.setLogs)
    .map(([key, exercises]) => ({ key, date: key.split('#')[0], exercises }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * New best sets, at most one per exercise and session. The first session of an exercise sets the
 * reference: it is never a record (no false record on the first try).
 */
export function personalRecords(d: Pick<ProgressData, 'setLogs'>): PersonalRecord[] {
  const history = new Map<string, LoggedSet[]>();
  const out: PersonalRecord[] = [];
  for (const session of loggedSessions(d)) {
    for (const [exerciseId, sets] of Object.entries(session.exercises)) {
      const done = sets.filter((s) => s.reps >= 1);
      if (done.length === 0) continue;
      const before = history.get(exerciseId);
      if (before && before.length > 0) {
        const maxLoad = Math.max(...before.map((s) => s.loadKg));
        let best: PersonalRecord | null = null;
        for (const s of done) {
          const repsAtOrAbove = before.filter((b) => b.loadKg >= s.loadKg).map((b) => b.reps);
          const kind =
            s.loadKg > maxLoad
              ? 'load'
              : repsAtOrAbove.length > 0 && s.reps > Math.max(...repsAtOrAbove)
                ? 'reps'
                : null;
          if (!kind) continue;
          const candidate: PersonalRecord = { exerciseId, date: session.date, loadKg: s.loadKg, reps: s.reps, kind };
          if (!best || s.loadKg > best.loadKg || (s.loadKg === best.loadKg && s.reps > best.reps)) best = candidate;
        }
        if (best) out.push(best);
      }
      history.set(exerciseId, [...(before ?? []), ...done]);
    }
  }
  return out;
}

export interface ExerciseTrend {
  exerciseId: string;
  from: { loadKg: number; reps: number };
  to: { loadKg: number; reps: number };
  trend: 'up' | 'stable' | 'down';
}

export const TREND = { windowDays: 14, stablePct: 2.5 } as const;

/** Heaviest set, then the most reps at that load (no volume score: 47.5 × 8 beats 40 × 10). */
const better = (a: LoggedSet, b: LoggedSet) =>
  b.loadKg > a.loadKg || (b.loadKg === a.loadKg && b.reps > a.reps) ? b : a;
const bestSet = (sets: LoggedSet[]) => sets.reduce(better);
const pct = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : to > 0 ? 100 : 0);

/** Load decides; at a similar load (±2.5 %), reps decide; "stable" under ±2.5 % on both. */
function trendOf(a: LoggedSet, b: LoggedSet): ExerciseTrend['trend'] {
  const load = pct(a.loadKg, b.loadKg);
  const change = Math.abs(load) >= TREND.stablePct ? load : pct(a.reps, b.reps);
  return Math.abs(change) < TREND.stablePct ? 'stable' : change > 0 ? 'up' : 'down';
}

/**
 * Best set (heaviest, then most reps) of the first 14 days of an exercise vs the last 14 days, for exercises
 * followed for at least 14 days.
 */
export function exerciseTrends(d: Pick<ProgressData, 'setLogs'>): ExerciseTrend[] {
  const perExercise = new Map<string, { date: IsoDate; sets: LoggedSet[] }[]>();
  for (const session of loggedSessions(d)) {
    for (const [id, sets] of Object.entries(session.exercises)) {
      const done = sets.filter((s) => s.reps >= 1);
      if (done.length > 0) perExercise.set(id, [...(perExercise.get(id) ?? []), { date: session.date, sets: done }]);
    }
  }
  const out: ExerciseTrend[] = [];
  for (const [exerciseId, sessions] of perExercise) {
    const first = sessions[0].date;
    const last = sessions[sessions.length - 1].date;
    if (daysBetween(first, last) < TREND.windowDays) continue;
    const early = sessions.filter((s) => daysBetween(first, s.date) < TREND.windowDays).flatMap((s) => s.sets);
    const late = sessions.filter((s) => daysBetween(s.date, last) < TREND.windowDays).flatMap((s) => s.sets);
    const a = bestSet(early);
    const b = bestSet(late);
    out.push({
      exerciseId,
      from: { loadKg: a.loadKg, reps: a.reps },
      to: { loadKg: b.loadKg, reps: b.reps },
      trend: trendOf(a, b),
    });
  }
  const rank = { up: 0, stable: 1, down: 2 };
  return out.sort((x, y) => rank[x.trend] - rank[y.trend] || x.exerciseId.localeCompare(y.exerciseId));
}
