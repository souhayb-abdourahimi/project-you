import { addDays } from '../../shared/dates';
import { decidedRecommendation } from '../adjustments';
import { adapt, ADAPTATION, APPLICABLE_CHANGES, plateau, type AdaptationInput } from '../adaptation';
import type { Adherence } from '../adherence';
import type { Adjustment } from '../adjustments';
import { weightBasis, withCalorieOffset } from '../weight-basis';
import { computeNutritionTargets } from '../../nutrition/engine';
import { SCENARIOS } from '../../scenarios';

const TODAY = '2026-09-30';
const START = '2026-08-01';

const full = (ratio: number | null, meals: number | null = 1): Adherence => ({
  windowDays: 14,
  sessions: { planned: 6, done: 6, adapted: 0, skipped: 0, notLogged: 0, ratio },
  mealLogging: meals === null ? null : { planned: 28, logged: 28, ratio: meals },
});

/** Daily weigh-ins from `from` to TODAY, `perWeekKg` change each week. */
function daily(startKg: number, perWeekKg: number, from = addDays(TODAY, -35)) {
  const out: { date: string; weightKg: number }[] = [];
  for (let d = from, i = 0; d <= TODAY; d = addDays(d, 1), i++) {
    out.push({ date: d, weightKg: Math.round((startKg + (perWeekKg * i) / 7) * 100) / 100 });
  }
  return out;
}

function input(patch: Partial<AdaptationInput> = {}): AdaptationInput {
  return {
    today: TODAY,
    startedOn: START,
    goal: 'fat_loss',
    safety: { active: false, flags: [] },
    adherence14: full(1),
    adherence28: full(1),
    missedPerWeek: [0, 0],
    weights: daily(80, -0.5),
    waist: [],
    trends: [],
    setLogs: {},
    dayLogs: [],
    rescheduled: {},
    spending: null,
    targets: { calories: 2000, floorKcal: 1600, maintenance: 2400 },
    calorieOffset: 0,
    sessionsPerWeek: { profile: 3, current: 3 },
    adjustments: [],
    ...patch,
  };
}

const kinds = (r: ReturnType<typeof adapt>) => r.map((x) => `${x.kind}:${x.change.key}`);

describe('Adaptation Engine', () => {
  it('a plan that works changes nothing, and says so', () => {
    const r = adapt(input());
    expect(r).toEqual([
      expect.objectContaining({ kind: 'none', reason: { key: 'adaptation.none.working', params: {} } }),
    ]);
  });

  it('loss too slow for 3 weeks with good adherence: −120 kcal proposed, with its evidence', () => {
    const [rec] = adapt(input({ weights: daily(80, -0.05) }));
    expect(rec).toMatchObject({
      kind: 'nutrition',
      mode: 'proposed',
      change: { key: 'calories_per_day', from: 0, to: -120 },
      reason: { key: 'adaptation.reason.too_slow_loss', params: { kcal: -120 } },
    });
    expect(rec.evidence).toMatchObject({ adherencePct: 100, weeks: 3 });
  });

  it('never below the floor', () => {
    const [rec] = adapt(
      input({ weights: daily(80, -0.05), targets: { calories: 1650, floorKcal: 1600, maintenance: 2400 } }),
    );
    expect(rec.change).toEqual({ key: 'calories_per_day', from: 0, to: -50 });
    const atFloor = adapt(
      input({ weights: daily(80, -0.05), targets: { calories: 1600, floorKcal: 1600, maintenance: 2400 } }),
    );
    expect(atFloor.some((r) => r.change.key === 'calories_per_day')).toBe(false);
  });

  it('safety active: only recovery, lighter load or more food; never more deficit', () => {
    const r = adapt(
      input({ weights: daily(80, -0.05), safety: { active: true, flags: ['fast_weight_loss', 'training_load'] } }),
    );
    expect(kinds(r)).toEqual(['add_recovery:rest_days', 'reduce_load:light_week', 'nutrition:calories_per_day']);
    expect(r[2].change.to).toBe(120);
    // Only what the app can apply in one gesture is proposed; the extra rest day is advice.
    expect(r.map((x) => x.mode)).toEqual(['advice', 'proposed', 'proposed']);
    for (const x of r.filter((y) => y.mode === 'proposed')) {
      expect(APPLICABLE_CHANGES).toContain(x.change.key);
    }
  });

  it('calibration: no calorie change in the first 14 days', () => {
    const r = adapt(input({ startedOn: addDays(TODAY, -10), weights: daily(80, -0.05) }));
    expect(r).toEqual([expect.objectContaining({ kind: 'none', blockedBy: 'calibration' })]);
  });

  it('low adherence simplifies the plan, never the calories', () => {
    const r = adapt(input({ adherence14: full(0.5, 0.5), missedPerWeek: [2, 3], weights: daily(80, -0.05) }));
    expect(kinds(r)).toEqual(['training:sessions_per_week', 'simplify_tracking:tracking_routine', 'none:none']);
    expect(r[0].change).toEqual({ key: 'sessions_per_week', from: 3, to: 2 });
    expect(r.at(-1)?.blockedBy).toBe('low_adherence');
  });

  it('not enough weigh-ins: calories stay, and the reason is said', () => {
    const sparse = daily(80, -0.05).filter((_, i) => i % 4 === 0);
    expect(adapt(input({ weights: sparse }))).toEqual([expect.objectContaining({ blockedBy: 'not_enough_data' })]);
  });

  it('cooldown: no new calorie change within 14 days of the last decision (declined included)', () => {
    const declined: Adjustment = {
      id: 'a',
      kind: 'nutrition',
      changeKey: 'calories_per_day',
      from: 0,
      to: -120,
      reasonKey: 'adaptation.reason.too_slow_loss',
      evidence: {},
      status: 'declined',
      effectiveFrom: addDays(TODAY, -5),
      decidedAt: `${addDays(TODAY, -5)}T10:00:00.000Z`,
    };
    expect(adapt(input({ weights: daily(80, -0.05), adjustments: [declined] }))).toEqual([
      expect.objectContaining({ blockedBy: 'cooldown' }),
    ]);
  });

  it('muscle gain: never above maintenance + 20 %', () => {
    const [rec] = adapt(
      input({
        goal: 'muscle_gain',
        weights: daily(70, 0),
        targets: { calories: 2850, floorKcal: 1600, maintenance: 2400 },
      }),
    );
    expect(rec.change).toEqual({ key: 'calories_per_day', from: 0, to: 30 });
  });

  it('heavy effort or declared fatigue: a lighter week is proposed', () => {
    const dayLogs = [1, 2, 3].map((d) => ({ date: addDays(TODAY, -d), fatigue: 4 }));
    expect(kinds(adapt(input({ dayLogs })))).toContain('reduce_load:light_week');
  });

  it('a decision has its own id and points back to the recommendation of its week', () => {
    const r = adapt(input({ safety: { active: true, flags: ['training_load'] } }));
    expect(new Set(r.map((x) => x.id)).size).toBe(r.length);
    const light = r.find((x) => x.change.key === 'light_week')!;
    const decision: Adjustment = {
      id: '0b1c2d3e-0000-4000-8000-000000000001',
      kind: 'reduce_load',
      changeKey: 'light_week',
      from: null,
      to: 'light',
      reasonKey: light.reason.key,
      evidence: light.evidence,
      status: 'applied',
      effectiveFrom: '2026-10-01',
      decidedAt: '2026-10-01T09:00:00.000Z',
    };
    expect(decidedRecommendation(decision)).toBe(light.id);
  });

  it('sessions moved twice to the same weekday: planning proposes that day', () => {
    const r = adapt(input({ rescheduled: { '2026-09-21': '2026-09-23', '2026-09-28': '2026-09-30' } }));
    expect(r[0]).toMatchObject({ kind: 'planning', change: { key: 'session_day', to: 3 }, mode: 'advice' });
  });

  it('minor or underweight: never a calorie decrease below their target, even when the loss is slow', () => {
    const targets = { calories: 2400, floorKcal: 1600, maintenance: 2400 };
    const r = adapt(input({ weights: daily(80, -0.05), targets, noDeficit: true }));
    expect(r.some((x) => x.change.key === 'calories_per_day')).toBe(false);
    const gaining = { goal: 'maintenance' as const, weights: daily(80, 0.6), targets };
    expect(adapt(input(gaining)).some((x) => x.change.key === 'calories_per_day' && Number(x.change.to) < 0)).toBe(
      true,
    );
    const drift = adapt(input({ ...gaining, noDeficit: true }));
    expect(drift.some((x) => x.change.key === 'calories_per_day' && Number(x.change.to) < 0)).toBe(false);
    // An offset accepted earlier is clamped too.
    const base = computeNutritionTargets(SCENARIOS.fatLoss, 2026);
    expect(withCalorieOffset(base, -150, true).calories).toBeGreaterThanOrEqual(
      Math.min(base.calories, Math.round(base.maintenance)),
    );
  });

  it('every amount stays within ±150 kcal', () => {
    for (const goal of ['fat_loss', 'weight_loss', 'muscle_gain', 'recomposition', 'maintenance'] as const) {
      for (const perWeek of [-1.5, -0.05, 0, 0.05, 1]) {
        for (const r of adapt(input({ goal, weights: daily(80, perWeek) }))) {
          if (r.change.key !== 'calories_per_day') continue;
          expect(Math.abs(Number(r.change.to) - Number(r.change.from))).toBeLessThanOrEqual(ADAPTATION.maxKcalStep);
        }
      }
    }
  });
});

describe('plateau', () => {
  it('never before 28 days', () => {
    expect(plateau(input({ startedOn: addDays(TODAY, -20), weights: daily(80, 0) }))).toMatchObject({
      active: false,
      notBecause: 'too_early',
    });
  });
  it('low adherence is a plan to simplify, not a plateau', () => {
    expect(plateau(input({ adherence28: full(0.5), weights: daily(80, 0) }))).toMatchObject({
      active: false,
      notBecause: 'low_adherence',
    });
  });
  it('flat 7-day average for 3 weeks with enough weigh-ins', () => {
    expect(plateau(input({ weights: daily(80, 0) })).active).toBe(true);
    expect(plateau(input({ weights: daily(80, -0.5) })).active).toBe(false);
  });
});

describe('weight basis', () => {
  const base = { startedOn: '2026-08-01', today: TODAY, profileWeightKg: 80, frozen: false };

  it('a single weigh-in changes nothing', () => {
    expect(weightBasis({ ...base, weights: [{ date: '2026-08-14', weightKg: 75 }] })).toEqual({
      weightKg: 80,
      since: null,
    });
  });

  it('changes at a 14-day checkpoint with ≥ 4 weigh-ins and ≥ 1 kg, rounded to 0.5 kg', () => {
    const weights = ['2026-08-05', '2026-08-08', '2026-08-11', '2026-08-14'].map((date) => ({ date, weightKg: 78.6 }));
    expect(weightBasis({ ...base, weights })).toEqual({ weightKg: 78.5, since: '2026-08-15' });
  });

  it('frozen under safety: never goes down, may go up', () => {
    const down = ['2026-08-05', '2026-08-08', '2026-08-11', '2026-08-14'].map((date) => ({ date, weightKg: 77 }));
    expect(weightBasis({ ...base, weights: down, frozen: true }).weightKg).toBe(80);
    const up = down.map((w) => ({ ...w, weightKg: 82 }));
    expect(weightBasis({ ...base, weights: up, frozen: true }).weightKg).toBe(82);
  });

  it('replay is deterministic', () => {
    const weights = daily(80, -0.5, '2026-08-01');
    expect(weightBasis({ ...base, weights })).toEqual(weightBasis({ ...base, weights: [...weights].reverse() }));
  });

  it('an accepted offset never goes below the floor', () => {
    const targets = computeNutritionTargets(SCENARIOS.fatLoss, 2026);
    const lowered = withCalorieOffset(targets, -10_000);
    expect(lowered.calories).toBe(targets.floorKcal);
    expect(withCalorieOffset(targets, 120).calories).toBe(targets.calories + 120);
    expect(withCalorieOffset(targets, 0)).toBe(targets);
  });
});
