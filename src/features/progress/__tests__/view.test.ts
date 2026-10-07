import { weightTrend } from '../view';

const weigh = (date: string, weightKg: number) => ({ date, weightKg });

describe('weightTrend', () => {
  it('weekly 7-day averages, oldest first, ending today', () => {
    const weights = [
      weigh('2026-09-18', 80.2),
      weigh('2026-09-22', 80),
      weigh('2026-09-24', 80.4),
      weigh('2026-09-28', 79.6),
      weigh('2026-09-30', 79.8),
    ];
    const trend = weightTrend(weights, '2026-09-30');
    expect(trend?.weeks).toHaveLength(8);
    expect(trend?.weeks.at(-1)).toEqual({ end: '2026-09-30', kg: 79.9 });
    expect(trend?.weeks.at(-2)).toEqual({ end: '2026-09-23', kg: 80.1 });
    expect(trend?.weeks.at(-3)).toEqual({ end: '2026-09-16', kg: null });
    expect(trend?.points).toBe(2);
  });

  it('a week with a single weigh-in is a gap, never a guess', () => {
    const trend = weightTrend([weigh('2026-09-30', 79), weigh('2026-09-29', 79.2), weigh('2026-09-22', 80)], '2026-09-30');
    expect(trend).toBeNull();
  });

  it('nothing measured: no trend', () => {
    expect(weightTrend([], '2026-09-30')).toBeNull();
  });
});
