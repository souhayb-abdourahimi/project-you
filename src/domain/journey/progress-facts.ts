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
  /** Seconds held, for a hold (W-4): its record is a longer time, never a load or reps estimate. */
  seconds?: number;
  /** Heavier load than ever, more reps than ever at this load or above, or a longer hold. */
  kind: 'load' | 'reps' | 'time';
}

/** Sessions with their sets, in date order. */
function loggedSessions(
  d: Pick<ProgressData, 'setLogs'>,
): { key: string; date: IsoDate; exercises: Record<string, LoggedSet[]> }[] {
  return Object.entries(d.setLogs)
    .map(([key, exercises]) => ({ key, date: key.split('#')[0], exercises }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * New best sets, at most one per exercise and session. The first session of an exercise sets the
 * reference: it is never a record (no false record on the first try).
 */
// Recomputed from the same (immutable) set log by several views: cached per log object.
const recordsCache = new WeakMap<object, PersonalRecord[]>();

export function personalRecords(d: Pick<ProgressData, 'setLogs'>): PersonalRecord[] {
  const cached = recordsCache.get(d.setLogs);
  if (cached) return cached;
  // Per exercise: heaviest load so far and the most reps seen at each load (parallel arrays).
  const history = new Map<string, { maxLoad: number; loads: number[]; reps: number[] }>();
  const out: PersonalRecord[] = [];
  // Holds: the longest time so far at this load or above (W-4, measured seconds only).
  const holds = new Map<string, { loads: number[]; seconds: number[] }>();
  for (const session of loggedSessions(d)) {
    for (const [exerciseId, sets] of Object.entries(session.exercises)) {
      const held = sets.filter((s) => (s.seconds ?? 0) >= 1);
      if (held.length > 0) {
        const record = holdRecord(holds, exerciseId, session.date, held);
        if (record) out.push(record);
      }
      const done = sets.filter((s) => s.reps >= 1);
      if (done.length === 0) continue;
      const before = history.get(exerciseId);
      if (before) {
        let best: PersonalRecord | null = null;
        for (const s of done) {
          let repsAtOrAbove = -1;
          for (let i = 0; i < before.loads.length; i++) {
            if (before.loads[i] >= s.loadKg && before.reps[i] > repsAtOrAbove) repsAtOrAbove = before.reps[i];
          }
          const kind =
            s.loadKg > before.maxLoad ? 'load' : repsAtOrAbove >= 0 && s.reps > repsAtOrAbove ? 'reps' : null;
          if (!kind) continue;
          const candidate: PersonalRecord = { exerciseId, date: session.date, loadKg: s.loadKg, reps: s.reps, kind };
          if (!best || s.loadKg > best.loadKg || (s.loadKg === best.loadKg && s.reps > best.reps)) best = candidate;
        }
        if (best) out.push(best);
      }
      const h = before ?? { maxLoad: -Infinity, loads: [], reps: [] };
      for (const s of done) {
        h.maxLoad = Math.max(h.maxLoad, s.loadKg);
        const at = h.loads.indexOf(s.loadKg);
        if (at === -1) {
          h.loads.push(s.loadKg);
          h.reps.push(s.reps);
        } else if (s.reps > h.reps[at]) h.reps[at] = s.reps;
      }
      history.set(exerciseId, h);
    }
  }
  recordsCache.set(d.setLogs, out);
  return out;
}

/** A longer hold than ever at this load or above; the first session of a hold sets the reference. */
function holdRecord(
  holds: Map<string, { loads: number[]; seconds: number[] }>,
  exerciseId: string,
  date: IsoDate,
  held: LoggedSet[],
): PersonalRecord | null {
  const before = holds.get(exerciseId);
  let best: PersonalRecord | null = null;
  if (before) {
    for (const s of held) {
      const seconds = s.seconds!;
      let atOrAbove = -1;
      for (let i = 0; i < before.loads.length; i++) {
        if (before.loads[i] >= s.loadKg && before.seconds[i] > atOrAbove) atOrAbove = before.seconds[i];
      }
      if (atOrAbove < 0 || seconds <= atOrAbove) continue;
      if (!best || seconds > best.seconds!)
        best = { exerciseId, date, loadKg: s.loadKg, reps: 0, seconds, kind: 'time' };
    }
  }
  const h = before ?? { loads: [], seconds: [] };
  for (const s of held) {
    const at = h.loads.indexOf(s.loadKg);
    if (at === -1) {
      h.loads.push(s.loadKg);
      h.seconds.push(s.seconds!);
    } else if (s.seconds! > h.seconds[at]) h.seconds[at] = s.seconds!;
  }
  holds.set(exerciseId, h);
  return best;
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
 * followed for at least 14 days. Light and short sessions are left out (W-4): a lighter day or less
 * time is never read as a drop in level.
 */
const trendsCache = new WeakMap<object, WeakMap<object, ExerciseTrend[]>>();
const NO_SESSIONS: ProgressData['completedSessions'] = [];

export function exerciseTrends(
  d: Pick<ProgressData, 'setLogs'> & Partial<Pick<ProgressData, 'completedSessions'>>,
): ExerciseTrend[] {
  const completed = d.completedSessions ?? NO_SESSIONS;
  const byLog = trendsCache.get(d.setLogs) ?? new WeakMap<object, ExerciseTrend[]>();
  trendsCache.set(d.setLogs, byLog);
  const cached = byLog.get(completed);
  if (cached) return cached;
  const reduced = new Set(completed.filter((c) => c.variant !== 'full').map((c) => `${c.date}#${c.sessionIndex}`));
  const perExercise = new Map<string, { date: IsoDate; sets: LoggedSet[] }[]>();
  for (const session of loggedSessions(d)) {
    if (reduced.has(session.key)) continue;
    for (const [id, sets] of Object.entries(session.exercises)) {
      const done = sets.filter((s) => s.reps >= 1);
      if (done.length === 0) continue;
      const list = perExercise.get(id) ?? [];
      list.push({ date: session.date, sets: done });
      perExercise.set(id, list);
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
  const sorted = out.sort((x, y) => rank[x.trend] - rank[y.trend] || x.exerciseId.localeCompare(y.exerciseId));
  byLog.set(completed, sorted);
  return sorted;
}
