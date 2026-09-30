import type { GoalType } from '../profile/schemas';
import { addDays, daysBetween, type IsoDate } from '../shared/dates';

export interface WeightEntry {
  date: IsoDate;
  weightKg: number;
}

export interface WeightTrend {
  /** 7-day average ending on the latest entry, null without data. */
  currentAverageKg: number | null;
  /** Change of the 7-day average versus the previous 7 days, null without enough data. */
  weeklyChangeKg: number | null;
  entriesUsed: number;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Daily weight fluctuates; the 7-day average is what we show and compare. */
export function weightTrend(entries: WeightEntry[]): WeightTrend {
  if (entries.length === 0) return { currentAverageKg: null, weeklyChangeKg: null, entriesUsed: 0 };
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1].date;
  const inWindow = (from: IsoDate, to: IsoDate) =>
    sorted.filter((e) => e.date >= from && e.date <= to).map((e) => e.weightKg);
  const current = inWindow(addDays(last, -6), last);
  const previous = inWindow(addDays(last, -13), addDays(last, -7));
  const currentAvg = average(current);
  const previousAvg = average(previous);
  return {
    currentAverageKg: currentAvg === null ? null : round1(currentAvg),
    weeklyChangeKg: currentAvg !== null && previousAvg !== null ? round1(currentAvg - previousAvg) : null,
    entriesUsed: current.length,
  };
}

export type ProgressIndicator = 'waist' | 'weight_average' | 'performance' | 'photos' | 'consistency';

/** Which indicators to put forward per goal. Weight is never the only one. */
export function highlightedIndicators(goal: GoalType): ProgressIndicator[] {
  switch (goal) {
    case 'recomposition':
      return ['waist', 'performance', 'photos', 'consistency'];
    case 'fat_loss':
      return ['waist', 'weight_average', 'performance', 'consistency'];
    case 'weight_loss':
      return ['weight_average', 'waist', 'consistency'];
    case 'muscle_gain':
      return ['performance', 'weight_average', 'consistency'];
    case 'performance':
      return ['performance', 'consistency'];
    default:
      return ['consistency', 'performance', 'weight_average'];
  }
}

/** Consistency over the last `windowDays`: completed / planned sessions, short sessions count fully. */
export function consistency(planned: IsoDate[], completed: IsoDate[], today: IsoDate, windowDays = 28): number | null {
  const from = addDays(today, -windowDays + 1);
  const inWindow = (d: IsoDate) => daysBetween(from, d) >= 0 && d <= today;
  const p = planned.filter(inWindow).length;
  if (p === 0) return null;
  return Math.min(1, completed.filter(inWindow).length / p);
}
