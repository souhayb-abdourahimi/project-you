/**
 * View model of the Progress screen (W-9 §7): weight trends use the domain's real weekly
 * averages. Nothing is smoothed, projected or filled: a week without enough weigh-ins is a gap.
 */
import { weightAverageAt, type ProgressData } from '@/domain/journey/progress-facts';
import { addDays, type IsoDate } from '@/domain/shared/dates';

export const MIN_TREND_POINTS = 2;

export type ProgressRange = '4w' | '12w' | '6m' | '1y';

export const RANGE_WEEKS: Record<ProgressRange, number> = {
  '4w': 4,
  '12w': 12,
  '6m': 26,
  '1y': 52,
};

export interface WeightTrend {
  /** Oldest first; the last one is the week ending today. */
  weeks: { end: IsoDate; kg: number | null }[];
  points: number;
}

export function weightTrend(
  weights: ProgressData['weights'],
  today: IsoDate,
  weeksCount = RANGE_WEEKS['12w'],
): WeightTrend | null {
  const weeks = Array.from({ length: weeksCount }, (_, i) => {
    const end = addDays(today, -7 * (weeksCount - 1 - i));
    return { end, kg: weightAverageAt(weights, end) };
  });
  const points = weeks.filter((week) => week.kg !== null).length;
  return points >= MIN_TREND_POINTS ? { weeks, points } : null;
}
