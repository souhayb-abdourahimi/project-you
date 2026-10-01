import { consistency, highlightedIndicators, weightTrend } from '../weight';

describe('weight trend', () => {
  it('averages the last 7 days and compares with the previous 7', () => {
    const entries = [
      ...['2026-09-10', '2026-09-12', '2026-09-14'].map((date) => ({ date, weightKg: 80 })),
      ...['2026-09-17', '2026-09-19', '2026-09-21'].map((date) => ({ date, weightKg: 79.4 })),
    ];
    expect(weightTrend(entries)).toEqual({ currentAverageKg: 79.4, weeklyChangeKg: -0.6, entriesUsed: 3 });
  });

  it('handles no data', () => {
    expect(weightTrend([]).currentAverageKg).toBeNull();
  });

  it('never relies on weight alone for recomposition', () => {
    expect(highlightedIndicators('recomposition')).not.toContain('weight_average');
    expect(highlightedIndicators('recomposition')[0]).toBe('waist');
  });

  it('computes consistency', () => {
    expect(consistency(['2026-09-28', '2026-09-30'], ['2026-09-28'], '2026-09-30')).toBe(0.5);
    expect(consistency([], [], '2026-09-30')).toBeNull();
  });
});
