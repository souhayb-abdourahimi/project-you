import {
  activitySummary,
  dedupeWeights,
  dedupeWorkouts,
  matchWorkouts,
  mergeWeights,
  stepsSummary,
  type AppSessionWindow,
} from '../merge';
import type { DailyValue, HealthWeight, HealthWorkout } from '../types';

const local = (day: number, h: number, min = 0) => new Date(2026, 8, day, h, min).toISOString();
const date = (day: number) => `2026-09-${String(day).padStart(2, '0')}`;

const weight = (
  id: string,
  day: number,
  h: number,
  kg: number,
  source: HealthWeight['source'] = 'healthkit',
): HealthWeight => ({
  id,
  date: date(day),
  at: local(day, h),
  weightKg: kg,
  source,
});

const workout = (
  id: string,
  day: number,
  from: number,
  minutes: number,
  extra: Partial<HealthWorkout> = {},
): HealthWorkout => {
  const start = new Date(2026, 8, day, from);
  return {
    id,
    date: date(day),
    start: start.toISOString(),
    end: new Date(start.getTime() + minutes * 60_000).toISOString(),
    durationMin: minutes,
    kind: 'strength',
    activeKcal: null,
    source: 'healthkit',
    ...extra,
  };
};

describe('weights', () => {
  it('keeps one copy of the same weigh-in seen twice', () => {
    const a = weight('a', 29, 7, 70);
    const b = { ...weight('b', 29, 7, 70.02), source: 'health_connect' as const };
    expect(dedupeWeights([a, b, a])).toEqual([a]);
  });

  it('keeps two different weigh-ins the same day', () => {
    expect(dedupeWeights([weight('a', 29, 7, 70), weight('b', 29, 20, 71)])).toHaveLength(2);
  });

  it('prefers the weight typed in Project You and never drops it', () => {
    const merged = mergeWeights(
      [{ date: date(29), weightKg: 72 }],
      [weight('a', 29, 7, 70), weight('b', 28, 7, 70.5), weight('c', 28, 21, 70.8)],
    );
    expect(merged).toEqual([
      { date: date(28), weightKg: 70.8, source: 'healthkit' },
      { date: date(29), weightKg: 72, source: 'manual' },
    ]);
  });

  it('works with manual data only (nothing connected)', () => {
    expect(mergeWeights([{ date: date(29), weightKg: 72 }], [])).toEqual([
      { date: date(29), weightKg: 72, source: 'manual' },
    ]);
  });
});

describe('workouts', () => {
  it('keeps one of two overlapping imported workouts, preferring the one with energy', () => {
    const watch = workout('watch', 29, 18, 45, { activeKcal: 300 });
    const phone = workout('phone', 29, 18, 50);
    expect(dedupeWorkouts([phone, watch]).map((w) => w.id)).toEqual(['watch']);
  });

  it('keeps workouts that only touch', () => {
    expect(dedupeWorkouts([workout('a', 29, 7, 60), workout('b', 29, 8, 60)])).toHaveLength(2);
  });

  const session: AppSessionWindow = {
    key: `${date(29)}#0`,
    date: date(29),
    completedAt: local(29, 19, 10),
    durationMin: 60,
  };

  it('recognises an imported workout as a session already logged in Project You', () => {
    const [m] = matchWorkouts([workout('w', 29, 18, 55)], [session]);
    expect(m.sameAs).toBe(session.key);
  });

  it('does not match a workout on another day or far from the session', () => {
    const result = matchWorkouts([workout('other-day', 28, 18, 55), workout('morning', 29, 6, 30)], [session]);
    expect(result.map((m) => m.sameAs)).toEqual([null, null]);
  });

  it('lets one app session absorb only one imported workout (the closest)', () => {
    const result = matchWorkouts([workout('warmup', 29, 17, 20), workout('main', 29, 18, 55)], [session]);
    expect(result.find((m) => m.workout.id === 'main')?.sameAs).toBe(session.key);
    expect(result.find((m) => m.workout.id === 'warmup')?.sameAs).toBeNull();
  });
});

describe('stepsSummary', () => {
  const days = (values: [number, number][]): DailyValue[] => values.map(([d, v]) => ({ date: date(d), value: v }));
  const TODAY = date(30); // Wednesday

  it('returns nulls without data', () => {
    expect(stepsSummary([], TODAY)).toEqual({ today: null, week: null, trend: null });
  });

  it('sums today and the week from Monday', () => {
    const s = stepsSummary(
      days([
        [28, 5000],
        [29, 7000],
        [30, 1200],
        [27, 9999],
      ]),
      TODAY,
    );
    expect(s.today).toBe(1200);
    expect(s.week).toBe(13200);
    expect(s.trend).toBeNull();
  });

  it('compares the last 7 full days with the 7 before', () => {
    const flat = (from: number, to: number, v: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => [from + i, v] as [number, number]);
    expect(stepsSummary(days([...flat(16, 22, 5000), ...flat(23, 29, 7000)]), TODAY).trend).toBe('up');
    expect(stepsSummary(days([...flat(16, 22, 7000), ...flat(23, 29, 5000)]), TODAY).trend).toBe('down');
    expect(stepsSummary(days([...flat(16, 22, 6000), ...flat(23, 29, 6200)]), TODAY).trend).toBe('stable');
    expect(stepsSummary(days([...flat(16, 18, 6000), ...flat(23, 29, 6200)]), TODAY).trend).toBeNull();
  });
});

describe('activitySummary', () => {
  it('lists only imported workouts that are not Project You sessions', () => {
    const session: AppSessionWindow = {
      key: `${date(29)}#0`,
      date: date(29),
      completedAt: local(29, 19),
      durationMin: 60,
    };
    const summary = activitySummary(
      {
        weights: [weight('a', 28, 7, 70), weight('b', 29, 7, 69.8)],
        steps: [{ date: date(30), value: 3000 }],
        activeKcal: [{ date: date(30), value: 210 }],
        workouts: [
          workout('same', 29, 18, 50),
          workout('run', 27, 8, 30, { kind: 'running' }),
          workout('old', 10, 8, 30),
        ],
      },
      [session],
      date(30),
    );
    expect(summary.extraWorkouts.map((w) => w.id)).toEqual(['run']);
    expect(summary.activeKcalToday).toBe(210);
    expect(summary.stepsToday.today).toBe(3000);
    expect(summary.latestWeight?.id).toBe('b');
  });
});
