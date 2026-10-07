/**
 * View model of the Progress screen (W-9 §7): the weight trend as the domain already measures it
 * (`weightAverageAt`: 7-day averages with at least two weigh-ins). Nothing is smoothed, projected
 * or estimated: a week without two weigh-ins is a gap.
 */
import { weightAverageAt, type ProgressData } from '@/domain/journey/progress-facts';
import { addDays, type IsoDate } from '@/domain/shared/dates';

/** Weeks drawn on the trend, and the weeks with a value needed before it is drawn at all. */
export const TREND_WEEKS = 8;
export const MIN_TREND_POINTS = 2;

export interface WeightTrend {
  /** Oldest first; the last one is the week ending today. */
  weeks: { end: IsoDate; kg: number | null }[];
  points: number;
}

export function weightTrend(weights: ProgressData['weights'], today: IsoDate): WeightTrend | null {
  const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const end = addDays(today, -7 * (TREND_WEEKS - 1 - i));
    return { end, kg: weightAverageAt(weights, end) };
  });
  const points = weeks.filter((w) => w.kg !== null).length;
  return points >= MIN_TREND_POINTS ? { weeks, points } : null;
}
