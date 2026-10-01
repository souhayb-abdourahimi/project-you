import { normalizeHealth, toKcal, toKg, workoutKind } from '../normalize';

const NOW = new Date(2026, 8, 30, 12, 0);
const local = (day: number, h: number, min = 0) => new Date(2026, 8, day, h, min).toISOString();

describe('unit conversion', () => {
  it('converts masses to kg', () => {
    expect(toKg(70, 'kg')).toBe(70);
    expect(toKg(70000, 'grams')).toBeCloseTo(70);
    expect(toKg(154.32, 'lb')).toBeCloseTo(70, 1);
    expect(toKg(154.32, 'pounds')).toBeCloseTo(70, 1);
    expect(toKg(11, 'st')).toBeCloseTo(69.85, 1);
  });

  it('converts energies to kcal, telling kilocalories from small calories', () => {
    expect(toKcal(300, 'kcal')).toBe(300);
    expect(toKcal(300, 'Cal')).toBe(300); // HealthKit "large calorie"
    expect(toKcal(300, 'kilocalories')).toBe(300);
    expect(toKcal(300000, 'calories')).toBeCloseTo(300); // Health Connect small calories
    expect(toKcal(300000, 'cal')).toBeCloseTo(300);
    expect(toKcal(1255.2, 'kJ')).toBeCloseTo(300);
    expect(toKcal(1255200, 'joules')).toBeCloseTo(300);
  });

  it('refuses an unknown unit instead of guessing', () => {
    expect(toKg(70, 'bananas')).toBeNull();
    expect(toKcal(300, 'watts')).toBeNull();
  });
});

describe('normalizeHealth', () => {
  it('normalises a weight in pounds with its local date and source', () => {
    const { data, rejected } = normalizeHealth(
      { weights: [{ id: 'a', at: local(29, 7, 30), value: 165, unit: 'lb' }] },
      'healthkit',
      NOW,
    );
    expect(rejected).toBe(0);
    expect(data.weights).toEqual([
      { id: 'healthkit:a', date: '2026-09-29', at: local(29, 7, 30), weightKg: 74.84, source: 'healthkit' },
    ]);
  });

  it('rejects malformed, implausible, unknown-unit and future samples', () => {
    const { data, rejected } = normalizeHealth(
      {
        weights: [
          { id: 'ok', at: local(29, 8), value: 70, unit: 'kg' },
          { id: 'tiny', at: local(29, 8), value: 5, unit: 'kg' },
          { id: 'unit', at: local(29, 8), value: 70, unit: 'stones-ish' },
          { id: 'future', at: local(31, 8), value: 70, unit: 'kg' },
          { id: 'nan', at: local(29, 8), value: Number.NaN, unit: 'kg' },
          { id: '', at: 'not a date', value: 70, unit: 'kg' } as never,
        ],
        steps: [
          { date: '2026-09-29', value: 8000, unit: 'count' },
          { date: '2026-09-28', value: -3, unit: 'count' },
          { date: '2026-10-02', value: 100, unit: 'count' },
          { date: '2026-09-27', value: 900000, unit: 'count' },
          { date: '2026-09-26', value: 1000, unit: 'kg' },
        ],
      },
      'health_connect',
      NOW,
    );
    expect(data.weights?.map((w) => w.id)).toEqual(['health_connect:ok']);
    expect(data.steps).toEqual([{ date: '2026-09-29', value: 8000 }]);
    expect(rejected).toBe(9);
  });

  it('normalises active calories per day', () => {
    const { data } = normalizeHealth(
      { activeCalories: [{ date: '2026-09-30', value: 1673.6, unit: 'kJ' }] },
      'healthkit',
      NOW,
    );
    expect(data.activeKcal).toEqual([{ date: '2026-09-30', value: 400 }]);
  });

  it('normalises workouts and keeps them without an implausible energy value', () => {
    const { data, rejected } = normalizeHealth(
      {
        workouts: [
          {
            id: 'w1',
            start: local(29, 18),
            end: local(29, 18, 45),
            activityCode: 56,
            activeEnergy: { value: 350000, unit: 'calories' },
          },
          {
            id: 'w2',
            start: local(28, 7),
            end: local(28, 8),
            activityCode: 70,
            activeEnergy: { value: 99999, unit: 'kcal' },
          },
          { id: 'w3', start: local(28, 7), end: local(28, 7), activityCode: 70 },
          { id: 'w4', start: local(28, 9), end: local(28, 8), activityCode: 70 },
        ],
      },
      'health_connect',
      NOW,
    );
    expect(rejected).toBe(2);
    expect(data.workouts).toEqual([
      {
        id: 'health_connect:w1',
        date: '2026-09-29',
        start: local(29, 18),
        end: local(29, 18, 45),
        durationMin: 45,
        kind: 'running',
        activeKcal: 350,
        source: 'health_connect',
      },
      expect.objectContaining({ id: 'health_connect:w2', kind: 'strength', activeKcal: null, durationMin: 60 }),
    ]);
  });

  it('leaves a type absent when the provider did not return it', () => {
    expect(normalizeHealth({ steps: [] }, 'healthkit', NOW).data).toEqual({ steps: [] });
  });
});

describe('workoutKind', () => {
  it('maps platform codes to the same kinds', () => {
    expect(workoutKind('healthkit', 50)).toBe('strength');
    expect(workoutKind('health_connect', 70)).toBe('strength');
    expect(workoutKind('healthkit', 37)).toBe('running');
    expect(workoutKind('health_connect', 56)).toBe('running');
    expect(workoutKind('healthkit', 63)).toBe('hiit');
    expect(workoutKind('health_connect', 36)).toBe('hiit');
    expect(workoutKind('healthkit', 9999)).toBe('other');
    expect(workoutKind('health_connect', 0)).toBe('other');
  });
});
