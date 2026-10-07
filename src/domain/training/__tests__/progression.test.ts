import { gateProgression } from '../../journey/adaptation';
import {
  PROGRESSION,
  downwardTrend,
  readExposure,
  recommendProgression,
  stagnation,
  type Exposure,
  type LoggedSet,
  type NotDone,
  type ProgressionRecommendation,
} from '../progression';

/** Progression Engine v2 (W-4, D-035): the test matrix of docs/TRAINING_PROGRESSION.md §9. */

const RANGE = { sets: 3, repsMin: 8, repsMax: 10, unit: 'reps' as const };
const sets = (load: number, ...reps: number[]): LoggedSet[] => reps.map((r) => ({ reps: r, loadKg: load }));
let day = 0;
const exposure = (patch: Partial<Exposure> & { sets: LoggedSet[] }): Exposure => {
  day += 3;
  const date = `2026-09-${String(day).padStart(2, '0')}`;
  return {
    key: `${date}#0`,
    date,
    variant: 'full',
    prescribed: { sets: 3, repsMin: 8, repsMax: 10, loadKg: null },
    exerciseDifficulty: null,
    sessionDifficulty: null,
    fatigueHigh: false,
    stopped: null,
    ...patch,
  };
};
const recommend = (
  exposures: Exposure[],
  extra: { notDone?: NotDone[]; exerciseId?: string; adherence?: number } = {},
) =>
  recommendProgression({
    exerciseId: extra.exerciseId ?? 'bench_press',
    range: RANGE,
    exposures,
    notDone: extra.notDone,
    adherence: extra.adherence ?? 1,
  });
const shape = (r: ProgressionRecommendation) => ({
  action: r.action,
  load: r.proposedPrescription.loadKg,
  target: r.proposedPrescription.target,
  reason: r.reason.key.replace('progression.reason.', ''),
});

beforeEach(() => {
  day = 0;
});

describe('no blind progression (§2): 70×8, 70×7, 70×6 very hard, high fatigue', () => {
  it('never proposes 72.5', () => {
    const good = [exposure({ sets: sets(70, 10, 10, 10) }), exposure({ sets: sets(70, 10, 10, 10) })];
    const hard = exposure({ sets: sets(70, 8, 7, 6), exerciseDifficulty: 5, fatigueHigh: true });
    const r = recommend([...good, hard]);
    // Explained by the fatigue (not counted against), but nothing goes up on top of it.
    expect(shape(r)).toEqual({ action: 'maintain', load: 70, target: 8, reason: 'context_fatigue' });
  });
  it('without fatigue, one session under the range is retried, not reduced', () => {
    const r = recommend([
      exposure({ sets: sets(70, 10, 9, 9) }),
      exposure({ sets: sets(70, 8, 7, 6), exerciseDifficulty: 5 }),
    ]);
    expect(shape(r)).toEqual({ action: 'retry', load: 70, target: 8, reason: 'single_miss' });
  });
});

describe('double progression (§5)', () => {
  it('in the range with a reasonable effort: one more rep, same load', () => {
    const r = recommend([exposure({ sets: sets(60, 9, 8, 8) }), exposure({ sets: sets(60, 9, 9, 8) })]);
    expect(shape(r)).toEqual({ action: 'increase_reps', load: 60, target: 9, reason: 'add_rep' });
    expect(r.reason.params).toEqual({ target: 9 });
  });
  it('top of the range once: keep the load to confirm it', () => {
    const r = recommend([exposure({ sets: sets(60, 9, 9, 9) }), exposure({ sets: sets(60, 10, 10, 10) })]);
    expect(shape(r)).toEqual({ action: 'maintain', load: 60, target: 10, reason: 'confirm_top' });
  });
  it('10/10/10 twice in a row at the same load: small increase, back to the bottom of the range', () => {
    const r = recommend([exposure({ sets: sets(70, 10, 10, 10) }), exposure({ sets: sets(70, 10, 10, 10) })]);
    expect(shape(r)).toEqual({ action: 'increase_load', load: 72.5, target: 8, reason: 'top_confirmed' });
    expect(r.reason.params).toEqual({ sessions: 2, max: 10, increment: 2.5 });
    expect(r.confidence).toBe('medium');
  });
  it('the increase is one step of the equipment, never a micro-load', () => {
    const r = recommend([exposure({ sets: sets(16, 10, 10, 10) }), exposure({ sets: sets(16, 10, 10, 10) })], {
      exerciseId: 'goblet_squat',
    });
    expect(r.proposedPrescription.loadKg).toBe(18);
  });
  it('the top reached in fewer sets than prescribed is not the top', () => {
    const r = recommend([exposure({ sets: sets(70, 10, 10) }), exposure({ sets: sets(70, 10, 10) })]);
    expect(r.action).not.toBe('increase_load');
  });
  it('10/8/6 very hard: no increase', () => {
    const r = recommend([
      exposure({ sets: sets(70, 10, 9, 9) }),
      exposure({ sets: sets(70, 10, 8, 6), exerciseDifficulty: 5 }),
    ]);
    expect(['retry', 'maintain']).toContain(r.action);
    expect(r.proposedPrescription.loadKg).toBe(70);
  });
  it('the top with a very hard effort: keep the load', () => {
    const top = sets(70, 10, 10, 10);
    top[2] = { ...top[2], rpe: 10 };
    const r = recommend([exposure({ sets: sets(70, 10, 10, 10) }), exposure({ sets: top })]);
    expect(shape(r)).toEqual({ action: 'maintain', load: 70, target: 10, reason: 'hard_effort' });
  });
  it('a single very hard session in the range is not a reason to reduce', () => {
    const r = recommend([
      exposure({ sets: sets(70, 9, 9, 8) }),
      exposure({ sets: sets(70, 9, 9, 9), sessionDifficulty: 5 }),
    ]);
    expect(r.action).toBe('maintain');
    expect(r.proposedPrescription.loadKg).toBe(70);
  });
});

describe('one session never decides (§6, §21)', () => {
  it('a first session at the top is a first reading: same goal, low confidence', () => {
    const r = recommend([exposure({ sets: sets(70, 10, 10, 10) })]);
    expect(shape(r)).toEqual({ action: 'maintain', load: 70, target: 10, reason: 'first_reading' });
    expect(r.confidence).toBe('low');
  });
  it('a first session in the range: same goal again', () => {
    expect(shape(recommend([exposure({ sets: sets(40, 9, 8, 8) })]))).toEqual({
      action: 'maintain',
      load: 40,
      target: 8,
      reason: 'first_reading',
    });
  });
  it('no history: no recommendation, no load (never invented)', () => {
    const r = recommend([]);
    expect(shape(r)).toEqual({ action: 'no_recommendation', load: null, target: 8, reason: 'no_history' });
    expect(r.confidence).toBe('insufficient');
  });
  it('one isolated bad session after good ones: retry, then back on track', () => {
    const good = () => exposure({ sets: sets(70, 9, 9, 9) });
    const r = recommend([good(), good(), exposure({ sets: sets(70, 8, 7, 7) })]);
    expect(r.action).toBe('retry');
    const after = recommend([
      good(),
      good(),
      exposure({ sets: sets(70, 8, 7, 7) }),
      exposure({ sets: sets(70, 9, 9, 9) }),
    ]);
    expect(after.action).toBe('increase_reps');
  });
  it('several sessions under the range: one step lighter, never more', () => {
    const r = recommend([exposure({ sets: sets(72.5, 8, 7, 7) }), exposure({ sets: sets(72.5, 7, 7, 6) })]);
    expect(shape(r)).toEqual({ action: 'reduce_load', load: 70, target: 8, reason: 'repeated_misses' });
    expect(r.reason.params).toEqual({ sessions: 2, min: 8 });
  });
});

describe('short and light (§7, §8)', () => {
  it('a short session not completed is never a miss and never a regression', () => {
    const r = recommend([
      exposure({ sets: sets(70, 9, 9, 9) }),
      exposure({ sets: sets(70, 9, 9, 9) }),
      exposure({ variant: 'short', sets: sets(70, 7) }),
    ]);
    // Not a miss (the load stays), but a lower short session is not built upon either.
    expect(shape(r)).toEqual({ action: 'maintain', load: 70, target: 8, reason: 'context_short' });
    expect(r.evidence.misses).toBe(0);
    expect(r.evidence.excluded).toEqual([expect.objectContaining({ why: 'short' })]);
    // A short session in the range simply does not count.
    const fine = recommend([
      exposure({ sets: sets(70, 9, 9, 9) }),
      exposure({ sets: sets(70, 9, 9, 9) }),
      exposure({ variant: 'short', sets: sets(70, 9) }),
    ]);
    expect(fine.action).toBe('increase_reps');
  });
  it('a short session fully at the top still counts (less time is not less ability)', () => {
    const r = recommend([
      exposure({ sets: sets(70, 10, 10, 10) }),
      exposure({
        variant: 'short',
        prescribed: { sets: 2, repsMin: 8, repsMax: 10, loadKg: 70 },
        sets: sets(70, 10, 10),
      }),
    ]);
    expect(r.action).toBe('increase_load');
  });
  it('light sessions never produce a decrease, a miss or a plateau', () => {
    const light = () => exposure({ variant: 'light', sets: sets(50, 6, 6) });
    const r = recommend([
      exposure({ sets: sets(70, 9, 9, 9) }),
      exposure({ sets: sets(70, 9, 9, 9) }),
      light(),
      light(),
      light(),
    ]);
    expect(shape(r)).toEqual({ action: 'increase_reps', load: 70, target: 10, reason: 'add_rep' });
    expect(r.signals.stagnation.active).toBe(false);
    expect(r.signals.trend).toBeNull();
  });
  it('only light sessions: keep, never the lighter load as a new level', () => {
    const r = recommend([
      exposure({
        variant: 'light',
        prescribed: { sets: 2, repsMin: 8, repsMax: 10, loadKg: 70 },
        sets: sets(50, 8, 8),
      }),
    ]);
    expect(shape(r)).toEqual({ action: 'maintain', load: 70, target: 8, reason: 'context_light' });
  });
});

describe('fatigue, stop, safety and protected profiles (§9, §10, §29)', () => {
  it('a session under declared fatigue is explained, not counted against', () => {
    const r = recommend([
      exposure({ sets: sets(70, 9, 9, 9) }),
      exposure({ sets: sets(70, 9, 9, 9) }),
      exposure({ sets: sets(70, 6, 6, 5), fatigueHigh: true }),
    ]);
    expect(shape(r)).toEqual({ action: 'maintain', load: 70, target: 8, reason: 'context_fatigue' });
    expect(r.evidence.misses).toBe(0);
    expect(r.evidence.excluded).toEqual([expect.objectContaining({ why: 'fatigue' })]);
  });
  it('stopped for pain: never read as a success, no increase after it', () => {
    const r = recommend([
      exposure({ sets: sets(70, 10, 10, 10) }),
      exposure({ sets: sets(70, 10, 10, 10) }),
      exposure({ sets: sets(70, 10, 10, 10), stopped: 'pain' }),
    ]);
    expect(shape(r)).toEqual({ action: 'maintain', load: 70, target: 10, reason: 'recent_discomfort' });
  });
  const increase = () =>
    recommend([exposure({ sets: sets(70, 10, 10, 10) }), exposure({ sets: sets(70, 10, 10, 10) })]);
  const reps = () => recommend([exposure({ sets: sets(70, 9, 8, 8) }), exposure({ sets: sets(70, 9, 9, 8) })]);
  const ctx = { safetyActive: false, fatigueHigh: false, noPush: false };
  it('safety active: an increase becomes keep, at the last real load', () => {
    const g = gateProgression(increase(), { ...ctx, safetyActive: true });
    expect(shape(g)).toEqual({ action: 'maintain', load: 70, target: 10, reason: 'held_safety' });
    expect(g.blockedBy).toBe('safety');
    expect(gateProgression(reps(), { ...ctx, safetyActive: true }).proposedPrescription.target).toBe(8);
  });
  it('high fatigue today: the increase waits', () => {
    expect(shape(gateProgression(increase(), { ...ctx, fatigueHigh: true }))).toMatchObject({
      action: 'maintain',
      load: 70,
      reason: 'held_fatigue',
    });
  });
  it('protected profile: never more load, one more rep in the range stays possible', () => {
    expect(gateProgression(increase(), { ...ctx, noPush: true })).toMatchObject({
      action: 'maintain',
      blockedBy: 'protected',
    });
    expect(gateProgression(reps(), { ...ctx, noPush: true }).action).toBe('increase_reps');
  });
  it('keep, retry and decrease always pass', () => {
    const down = recommend([exposure({ sets: sets(72.5, 8, 7, 7) }), exposure({ sets: sets(72.5, 7, 7, 6) })]);
    expect(gateProgression(down, { safetyActive: true, fatigueHigh: true, noPush: true })).toBe(down);
  });
});

describe('not performed, replaced (§16, §17)', () => {
  const good = () => [exposure({ sets: sets(70, 10, 10, 10) }), exposure({ sets: sets(70, 10, 10, 10) })];
  const notDone = (reason: NotDone['reason'], kind: NotDone['kind'] = 'not_performed'): NotDone => ({
    key: '2026-09-30#0',
    date: '2026-09-30',
    kind,
    reason,
  });
  it('machine busy or no time: not a signal', () => {
    expect(recommend(good(), { notDone: [notDone('busy_equipment', 'replaced')] }).action).toBe('increase_load');
    expect(recommend(good(), { notDone: [notDone('no_time')] }).action).toBe('increase_load');
  });
  it('too hard today or a movement that bothered: no increase', () => {
    expect(shape(recommend(good(), { notDone: [notDone('too_hard_today')] }))).toMatchObject({
      action: 'maintain',
      reason: 'recent_too_hard',
    });
    expect(shape(recommend(good(), { notDone: [notDone('discomfort', 'replaced')] }))).toMatchObject({
      action: 'maintain',
      reason: 'recent_discomfort',
    });
  });
  it('planned but never done: insufficient data, said as such', () => {
    const r = recommend([], { notDone: [notDone('no_time')] });
    expect(shape(r)).toMatchObject({ action: 'no_recommendation', reason: 'not_done', load: null });
    expect(r.evidence.excluded).toEqual([{ date: '2026-09-30', why: 'not_performed:no_time' }]);
  });
});

describe('bodyweight and holds (§14, §15)', () => {
  it('bodyweight: progresses by reps, no load is ever invented', () => {
    const r = recommend([exposure({ sets: sets(0, 9, 8, 8) }), exposure({ sets: sets(0, 9, 9, 8) })], {
      exerciseId: 'push_up',
    });
    expect(shape(r)).toEqual({ action: 'increase_reps', load: null, target: 9, reason: 'add_rep' });
  });
  it('bodyweight at the top, confirmed: keep the goal (no load to add)', () => {
    const r = recommend([exposure({ sets: sets(0, 10, 10, 10) }), exposure({ sets: sets(0, 10, 10, 10) })], {
      exerciseId: 'push_up',
    });
    expect(shape(r)).toEqual({ action: 'maintain', load: null, target: 10, reason: 'bodyweight_top' });
  });
  it('bodyweight under the range twice: keep and consolidate, never a negative load', () => {
    const r = recommend([exposure({ sets: sets(0, 6, 6, 5) }), exposure({ sets: sets(0, 6, 5, 5) })], {
      exerciseId: 'push_up',
    });
    expect(shape(r)).toMatchObject({ action: 'maintain', load: null, reason: 'consolidate' });
  });
  it('a hold progresses in seconds, up to the top of its range', () => {
    const hold = (...s: number[]) => s.map((seconds) => ({ reps: 0, seconds, loadKg: 0 }));
    const range = { sets: 3, repsMin: 30, repsMax: 45, unit: 'seconds' as const };
    const prescribed = { sets: 3, repsMin: 30, repsMax: 45, loadKg: null };
    const r = recommendProgression({
      exerciseId: 'plank',
      range,
      exposures: [exposure({ prescribed, sets: hold(32, 31, 30) }), exposure({ prescribed, sets: hold(35, 33, 32) })],
    });
    expect(shape(r)).toEqual({ action: 'increase_reps', load: null, target: 37, reason: 'hold_longer' });
    const top = recommendProgression({
      exerciseId: 'plank',
      range,
      exposures: [exposure({ prescribed, sets: hold(45, 45, 45) }), exposure({ prescribed, sets: hold(46, 45, 45) })],
    });
    expect(shape(top)).toEqual({ action: 'maintain', load: null, target: 45, reason: 'hold_top' });
  });
  it('an exercise the catalogue does not know: no load step invented', () => {
    const r = recommend([exposure({ sets: sets(30, 10, 10, 10) }), exposure({ sets: sets(30, 10, 10, 10) })], {
      exerciseId: 'unknown_machine',
    });
    expect(shape(r)).toEqual({ action: 'maintain', load: 30, target: 10, reason: 'no_increment' });
  });
});

describe('stagnation and trends (§18, §19)', () => {
  const at = (date: string, load: number, ...reps: number[]) =>
    readExposure(
      { ...exposure({ sets: sets(load, ...reps) }), date, key: `${date}#0` },
      { sets: 3, repsMin: 8, repsMax: 10 },
    );
  it('needs enough comparable sessions over three weeks with regular attendance', () => {
    const flat = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'].map((d) => at(d, 70, 9, 9, 8));
    expect(stagnation(flat, 0.9)).toEqual({ active: true, sessions: 4, days: 21 });
    expect(stagnation(flat.slice(1), 0.9)).toMatchObject({ active: false, notBecause: 'not_enough_data' });
    expect(stagnation(flat, 0.5)).toMatchObject({ active: false, notBecause: 'low_adherence' });
    expect(stagnation(flat, null)).toMatchObject({ active: false, notBecause: 'low_adherence' });
    const moving = [...flat.slice(0, 3), at('2026-09-22', 70, 10, 9, 9)];
    expect(stagnation(moving, 0.9)).toMatchObject({ active: false, notBecause: 'moving' });
  });
  it('light weeks do not make a plateau', () => {
    const light = ['2026-09-08', '2026-09-15'].map((d) => ({ ...at(d, 50, 8, 8), neutral: 'light' as const }));
    const r = [at('2026-09-01', 70, 9, 9, 8), ...light, at('2026-09-22', 70, 9, 9, 8)];
    expect(stagnation(r, 0.9)).toMatchObject({ active: false, notBecause: 'not_enough_data' });
  });
  it('a downward trend needs three sessions each below the previous one', () => {
    const three = [at('2026-09-01', 70, 10, 10, 9), at('2026-09-05', 70, 9, 9, 8), at('2026-09-09', 70, 8, 8, 7)];
    expect(downwardTrend(three)).toBe(true);
    expect(downwardTrend(three.slice(1))).toBe(false);
    expect(downwardTrend([three[0], at('2026-09-05', 70, 10, 10, 9), three[2]])).toBe(false);
  });
  it('a planned decrease is a choice, not a drop', () => {
    const planned = { ...at('2026-09-09', 67.5, 9, 9, 9), prescribedLoadKg: 67.5 };
    expect(downwardTrend([at('2026-09-01', 72.5, 9, 8, 8), at('2026-09-05', 72.5, 8, 7, 7), planned])).toBe(false);
  });
  it('signals are carried on the recommendation, never a score', () => {
    const r = recommend(
      [
        exposure({ date: '2026-09-01', sets: sets(70, 9, 9, 8) }),
        exposure({ date: '2026-09-08', sets: sets(70, 9, 9, 8) }),
        exposure({ date: '2026-09-15', sets: sets(70, 9, 8, 8) }),
        exposure({ date: '2026-09-22', sets: sets(70, 9, 9, 8) }),
      ],
      { adherence: 1 },
    );
    expect(r.signals.stagnation.active).toBe(true);
    expect(r.confidence).toBe('high');
    expect(Object.keys(r)).not.toContain('score');
  });
});

describe('explanation (§22) and thresholds (§36)', () => {
  it('the reason is a key with facts taken from the evidence', () => {
    const r = recommend([exposure({ sets: sets(70, 10, 10, 10) }), exposure({ sets: sets(70, 10, 10, 10) })]);
    expect(r.reason).toEqual({
      key: 'progression.reason.top_confirmed',
      params: { sessions: r.evidence.confirmations, max: 10, increment: 2.5 },
    });
    expect(r.evidence.used.map((u) => u.values)).toEqual([
      [10, 10, 10],
      [10, 10, 10],
    ]);
    expect(r.evidence.last).toEqual({ loadKg: 70, value: 10 });
    expect(r.previousPrescription).toMatchObject({ sets: 3, repsMin: 8, repsMax: 10 });
  });
  it('thresholds live in one constant', () => {
    expect(PROGRESSION).toMatchObject({ confirmations: 2, missesForReduce: 2, minSessionsToIncrease: 2 });
  });
});
