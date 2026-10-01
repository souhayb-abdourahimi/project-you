import type { WeightEntry } from '../progress/weight';
import { addDays, startOfWeek, type IsoDate } from '../shared/dates';
import type { DailyValue, HealthData, HealthWeight, HealthWorkout, WeightSource } from './types';

/* ---------- Deduplication inside imported data ---------- */

const byId = <T extends { id: string }>(items: T[]) => [...new Map(items.map((i) => [i.id, i])).values()];

/**
 * Same weigh-in seen twice (a scale app writing to Health and the platform re-sharing it):
 * same minute and less than 50 g apart → kept once.
 */
export function dedupeWeights(weights: HealthWeight[]): HealthWeight[] {
  const sorted = byId(weights).sort((a, b) => a.at.localeCompare(b.at));
  const kept: HealthWeight[] = [];
  for (const w of sorted) {
    const minute = w.at.slice(0, 16);
    if (kept.some((k) => k.at.slice(0, 16) === minute && Math.abs(k.weightKg - w.weightKg) < 0.05)) continue;
    kept.push(w);
  }
  return kept;
}

/** Daily totals come pre-aggregated by the platform: one value per day, the latest read wins. */
export function dedupeDaily(values: DailyValue[]): DailyValue[] {
  const map = new Map(values.map((v) => [v.date, v]));
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const ms = (iso: string) => new Date(iso).getTime();

function overlapMs(a: { start: number; end: number }, b: { start: number; end: number }): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/**
 * The same workout recorded by two apps (watch + phone app) overlaps itself: when two imported
 * workouts share at least half of the shorter one, only one is kept (the one with an energy value,
 * then the longer one).
 */
export function dedupeWorkouts(workouts: HealthWorkout[]): HealthWorkout[] {
  const ranked = byId(workouts).sort(
    (a, b) => Number(b.activeKcal !== null) - Number(a.activeKcal !== null) || b.durationMin - a.durationMin,
  );
  const kept: HealthWorkout[] = [];
  for (const w of ranked) {
    const span = { start: ms(w.start), end: ms(w.end) };
    const duplicate = kept.some((k) => {
      const other = { start: ms(k.start), end: ms(k.end) };
      const shorter = Math.min(span.end - span.start, other.end - other.start);
      return overlapMs(span, other) >= shorter / 2;
    });
    if (!duplicate) kept.push(w);
  }
  return kept.sort((a, b) => a.start.localeCompare(b.start));
}

/** Merges a fresh read into what is already kept, then trims to the retention window. */
export function mergeHealthData(previous: HealthData, fresh: Partial<HealthData>, keepFrom: IsoDate): HealthData {
  const recent = <T extends { date: IsoDate }>(items: T[]) => items.filter((i) => i.date >= keepFrom);
  return {
    weights: recent(dedupeWeights([...previous.weights, ...(fresh.weights ?? [])])),
    steps: recent(dedupeDaily([...previous.steps, ...(fresh.steps ?? [])])),
    activeKcal: recent(dedupeDaily([...previous.activeKcal, ...(fresh.activeKcal ?? [])])),
    workouts: recent(dedupeWorkouts([...previous.workouts, ...(fresh.workouts ?? [])])),
  };
}

/* ---------- Merge with what the user logged in Project You ---------- */

export interface WeightPoint extends WeightEntry {
  source: WeightSource;
}

/**
 * One weight per day for trends. Rule (D-018): a weigh-in typed in Project You always wins over
 * an imported one on the same day; otherwise the last imported weigh-in of the day is used.
 * Imported data never overwrites or deletes manual entries.
 */
export function mergeWeights(manual: WeightEntry[], imported: HealthWeight[]): WeightPoint[] {
  const byDate = new Map<IsoDate, WeightPoint>();
  for (const w of [...imported].sort((a, b) => a.at.localeCompare(b.at)))
    byDate.set(w.date, { date: w.date, weightKg: w.weightKg, source: w.source });
  for (const m of manual) byDate.set(m.date, { date: m.date, weightKg: m.weightKg, source: 'manual' });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** A session completed in Project You, as a time window. */
export interface AppSessionWindow {
  key: string;
  date: IsoDate;
  /** ISO timestamp when the user marked it done. */
  completedAt: string;
  /** Planned duration of the session. */
  durationMin: number;
}

export interface MatchedWorkout {
  workout: HealthWorkout;
  /** Project You session this workout is the same as: it is then not counted a second time. */
  sameAs: string | null;
}

/** Margin around an app session: people mark a session done a bit after finishing, or start late. */
const MATCH_MARGIN_MS = 45 * 60_000;

/**
 * Deduplicates imported workouts against sessions logged in Project You. An imported workout is
 * "the same" as an app session when both are on the same day and their time windows overlap
 * (the app window being [done − planned duration − 45 min, done + 45 min]). Each app session
 * absorbs at most one imported workout, the one overlapping the most. The app session stays the
 * reference: the import never replaces it.
 */
export function matchWorkouts(imported: HealthWorkout[], sessions: AppSessionWindow[]): MatchedWorkout[] {
  const candidates: { workout: HealthWorkout; session: AppSessionWindow; overlap: number }[] = [];
  for (const workout of imported) {
    const span = { start: ms(workout.start), end: ms(workout.end) };
    for (const session of sessions) {
      if (session.date !== workout.date) continue;
      const done = ms(session.completedAt);
      const window = { start: done - session.durationMin * 60_000 - MATCH_MARGIN_MS, end: done + MATCH_MARGIN_MS };
      const overlap = overlapMs(span, window);
      if (overlap > 0) candidates.push({ workout, session, overlap });
    }
  }
  const sameAs = new Map<string, string>();
  const usedSessions = new Set<string>();
  for (const c of candidates.sort((a, b) => b.overlap - a.overlap)) {
    if (sameAs.has(c.workout.id) || usedSessions.has(c.session.key)) continue;
    sameAs.set(c.workout.id, c.session.key);
    usedSessions.add(c.session.key);
  }
  return imported.map((workout) => ({ workout, sameAs: sameAs.get(workout.id) ?? null }));
}

/* ---------- Summaries shown on the dashboard ---------- */

export type StepsTrend = 'up' | 'down' | 'stable';

export interface StepsSummary {
  today: number | null;
  /** Monday → today. Null when no day of the week has data. */
  week: number | null;
  /** Average of the last 7 full days vs the 7 before; null without at least 4 days in each. */
  trend: StepsTrend | null;
}

const MIN_DAYS_FOR_TREND = 4;
const TREND_THRESHOLD = 0.1;

export function stepsSummary(steps: DailyValue[], today: IsoDate): StepsSummary {
  const byDate = new Map(dedupeDaily(steps).map((s) => [s.date, s.value]));
  const range = (from: IsoDate, to: IsoDate) =>
    [...byDate.entries()].filter(([d]) => d >= from && d <= to).map(([, v]) => v);
  const sum = (v: number[]) => v.reduce((s, x) => s + x, 0);
  const week = range(startOfWeek(today), today);
  const last = range(addDays(today, -7), addDays(today, -1));
  const previous = range(addDays(today, -14), addDays(today, -8));
  let trend: StepsTrend | null = null;
  if (last.length >= MIN_DAYS_FOR_TREND && previous.length >= MIN_DAYS_FOR_TREND) {
    const a = sum(last) / last.length;
    const b = sum(previous) / previous.length;
    const change = b === 0 ? (a === 0 ? 0 : 1) : (a - b) / b;
    trend = change > TREND_THRESHOLD ? 'up' : change < -TREND_THRESHOLD ? 'down' : 'stable';
  }
  return { today: byDate.get(today) ?? null, week: week.length ? sum(week) : null, trend };
}

export interface ActivitySummary {
  stepsToday: StepsSummary;
  /** Active energy today, an estimate from the device; null when unknown. */
  activeKcalToday: number | null;
  /** Imported workouts of the last 7 days that are not already sessions of Project You. */
  extraWorkouts: HealthWorkout[];
  /** Latest imported weigh-in, if any. */
  latestWeight: HealthWeight | null;
}

export function activitySummary(data: HealthData, sessions: AppSessionWindow[], today: IsoDate): ActivitySummary {
  const since = addDays(today, -6);
  const recent = data.workouts.filter((w) => w.date >= since && w.date <= today);
  return {
    stepsToday: stepsSummary(data.steps, today),
    activeKcalToday: data.activeKcal.find((d) => d.date === today)?.value ?? null,
    extraWorkouts: matchWorkouts(recent, sessions)
      .filter((m) => m.sameAs === null)
      .map((m) => m.workout)
      .sort((a, b) => b.start.localeCompare(a.start)),
    latestWeight: [...data.weights].sort((a, b) => a.at.localeCompare(b.at)).at(-1) ?? null,
  };
}
