import { SCENARIOS } from '../../scenarios';
import { publishWeek } from '../../scenarios/training';
import { sessionKey } from '../../shared/ids';
import {
  coachHint,
  exerciseStatus,
  extendRest,
  lastPerformance,
  makeSet,
  pauseRest,
  prefill,
  replacementAdvice,
  restRemaining,
  resumeRest,
  sessionExercises,
  sessionGoal,
  sessionProgress,
  sessionResult,
  sessionSummary,
  setFeel,
  SET_FEELS,
  SHOWN_REPLACEMENT_REASONS,
  startRest,
  whyKey,
  type SessionExercise,
} from '../session';
import { REPLACEMENT_REASONS } from '../replacement';
import { variantTemplate } from '../week';

const MONDAY = sessionKey('2026-09-28', 0);
const LAST_WEEK = sessionKey('2026-09-21', 0);
const TWO_WEEKS = sessionKey('2026-09-14', 0);

/** One exercise as the screen reads it from a stored row (engine input). */
const ex = (patch: Partial<SessionExercise> = {}): SessionExercise => ({
  plannedId: 'p1',
  prescribedId: 'bench_press',
  exerciseId: 'bench_press',
  replaced: false,
  sets: 3,
  repsMin: 8,
  repsMax: 10,
  unit: 'reps',
  restSeconds: 120,
  targetRpe: 8,
  proposedLoadKg: 70,
  progressionAction: 'keep',
  progressionReason: 'progression.reason.in_range',
  targetReps: null,
  progressionParams: null,
  progressionConfidence: null,
  purpose: 'strength',
  purposeTarget: null,
  ...patch,
});

describe('sessionExercises: the stored prescription, never rebuilt', () => {
  const week = publishWeek(SCENARIOS.muscleGain, {
    today: '2026-09-28',
    weekStart: '2026-09-28',
    seed: '11111111-1111-4111-8111-111111111111',
    at: '2026-09-28T07:00:00.000Z',
  });
  const p = week.prescriptions[week.sessionIds[MONDAY]];
  const full = p.exercises.filter((e) => e.variant === 'full');

  it('reads the planned rows in order with their ids and targets', () => {
    const list = sessionExercises({ planned: [...full].reverse() });
    expect(list.map((e) => e.plannedId)).toEqual(full.map((e) => e.id));
    expect(list[0]).toMatchObject({
      prescribedId: full[0].exerciseId,
      exerciseId: full[0].exerciseId,
      replaced: false,
      sets: full[0].sets,
      repsMin: full[0].repsMin,
      proposedLoadKg: full[0].targetLoadKg,
    });
  });

  it('a replacement keeps the prescription row but never inherits its proposed load', () => {
    const planned = [{ ...full[0], targetLoadKg: 70, progressionAction: 'increase_load' as const }];
    const [e] = sessionExercises({ planned }, { [full[0].exerciseId]: 'push_up' });
    expect(e).toMatchObject({
      plannedId: full[0].id,
      prescribedId: full[0].exerciseId,
      exerciseId: 'push_up',
      replaced: true,
      proposedLoadKg: null,
      progressionAction: null,
    });
  });

  it('off plan: the proposal has no planned id and no proposed load', () => {
    const template = variantTemplate(p, 'full')!;
    const list = sessionExercises({ template });
    expect(list.every((e) => e.plannedId === null && e.proposedLoadKg === null)).toBe(true);
  });
});

describe('lastPerformance: real sets of an earlier session only', () => {
  it('returns the best set of the last earlier session', () => {
    const logs = {
      [TWO_WEEKS]: { bench_press: [{ reps: 12, loadKg: 60 }] },
      [LAST_WEEK]: {
        bench_press: [
          { reps: 10, loadKg: 65 },
          { reps: 10, loadKg: 67.5 },
          { reps: 8, loadKg: 67.5 },
        ],
      },
      [MONDAY]: { bench_press: [{ reps: 8, loadKg: 70 }] },
    };
    expect(lastPerformance(logs, 'bench_press', MONDAY)).toEqual({
      date: '2026-09-21',
      loadKg: 67.5,
      reps: 10,
      seconds: null,
    });
  });

  it('is null without history (never estimated), and reads holds in seconds', () => {
    expect(lastPerformance({}, 'bench_press', MONDAY)).toBeNull();
    const logs = { [LAST_WEEK]: { plank: [{ reps: 0, seconds: 40, loadKg: 0 }] } };
    expect(lastPerformance(logs, 'plank', MONDAY)).toEqual({ date: '2026-09-21', loadKg: 0, reps: null, seconds: 40 });
  });

  it('ignores today and later sessions', () => {
    const logs = { [MONDAY]: { bench_press: [{ reps: 8, loadKg: 70 }] } };
    expect(lastPerformance(logs, 'bench_press', LAST_WEEK)).toBeNull();
    expect(lastPerformance(logs, 'bench_press', MONDAY)).toBeNull();
  });
});

describe('prefill: reliable data only', () => {
  const last = { date: '2026-09-21', loadKg: 67.5, reps: 10, seconds: null };

  it('uses the previous set of today first', () => {
    expect(prefill(ex(), [{ reps: 9, loadKg: 72.5 }], last, { holdIncrease: false })).toEqual({
      loadKg: 72.5,
      value: 9,
      source: 'previous_set',
      keepLoad: false,
    });
  });

  it('then the load proposed by the stored prescription, with the bottom of the range', () => {
    expect(prefill(ex(), [], last, { holdIncrease: false })).toEqual({
      loadKg: 70,
      value: 8,
      source: 'proposed',
      keepLoad: false,
    });
  });

  it('keeps last time load when a planned increase meets high fatigue or the safety rule', () => {
    const increase = ex({ progressionAction: 'increase_load', proposedLoadKg: 72.5 });
    expect(prefill(increase, [], last, { holdIncrease: true })).toMatchObject({
      loadKg: 67.5,
      source: 'last_time',
      keepLoad: true,
    });
    // Without a real last time, nothing to hold to: the stored proposal stays.
    expect(prefill(increase, [], null, { holdIncrease: true })).toMatchObject({ loadKg: 72.5, keepLoad: false });
    // A kept load is not touched by fatigue.
    expect(prefill(ex(), [], last, { holdIncrease: true })).toMatchObject({ loadKg: 70, keepLoad: false });
  });

  it('then last time, then bodyweight, else an empty field: a load is never invented', () => {
    const noProposal = ex({ proposedLoadKg: null });
    expect(prefill(noProposal, [], last, { holdIncrease: false })).toMatchObject({ loadKg: 67.5, source: 'last_time' });
    expect(
      prefill(ex({ exerciseId: 'push_up', proposedLoadKg: null }), [], null, { holdIncrease: false }),
    ).toMatchObject({ loadKg: 0, source: 'bodyweight' });
    expect(prefill(noProposal, [], null, { holdIncrease: false })).toEqual({
      loadKg: null,
      value: 8,
      source: null,
      keepLoad: false,
    });
  });

  it('a hold prefills the seconds of the previous hold', () => {
    const plank = ex({
      exerciseId: 'plank',
      prescribedId: 'plank',
      unit: 'seconds',
      repsMin: 30,
      proposedLoadKg: null,
    });
    expect(prefill(plank, [{ reps: 0, seconds: 45, loadKg: 0 }], null, { holdIncrease: false }).value).toBe(45);
    expect(prefill(plank, [], null, { holdIncrease: false }).value).toBe(30);
  });

  it('opens on the goal of the prescription (W-4); a held increase of reps keeps last time', () => {
    expect(
      prefill(ex({ targetReps: 9, progressionAction: 'increase_reps' }), [], last, { holdIncrease: false }),
    ).toEqual({
      loadKg: 70,
      value: 9,
      source: 'proposed',
      keepLoad: false,
    });
    const reps = ex({ targetReps: 10, progressionAction: 'increase_reps', proposedLoadKg: 67.5 });
    expect(prefill(reps, [], last, { holdIncrease: true })).toMatchObject({ loadKg: 67.5, value: 10, keepLoad: true });
  });
});

describe('sessionGoal: the line of the Daily Coach, from stored decisions only (W-4)', () => {
  const row = (progressionAction: SessionExercise['progressionAction'], variant: 'full' | 'light' = 'full') => ({
    variant,
    progressionAction,
  });
  it('an increase first, then a rep, then keep only when every decision keeps', () => {
    expect(sessionGoal([row('maintain'), row('increase_load')])).toBe('increase_load');
    expect(sessionGoal([row('maintain'), row('increase_reps')])).toBe('increase_reps');
    expect(sessionGoal([row('maintain'), row('retry'), row(null)])).toBe('maintain');
  });
  it('nothing to say before W-4, without history, or when a decrease is planned', () => {
    expect(sessionGoal([row('keep'), row('add_reps')])).toBeNull();
    expect(sessionGoal([row(null)])).toBeNull();
    expect(sessionGoal([row('maintain'), row('reduce_load')])).toBeNull();
    expect(sessionGoal([row('increase_load', 'light')])).toBeNull();
  });
});

describe('makeSet: load + reps, or load + seconds', () => {
  it('stores reps, rounding the load to 0.25 kg, with an optional feel', () => {
    expect(makeSet('reps', { loadKg: 67.4, value: 10 })).toEqual({ reps: 10, loadKg: 67.5 });
    expect(makeSet('reps', { loadKg: 70, value: 8, rpe: SET_FEELS.very_hard })).toEqual({
      reps: 8,
      loadKg: 70,
      rpe: 10,
    });
  });

  it('stores a hold as seconds with reps 0', () => {
    expect(makeSet('seconds', { loadKg: null, value: 40 })).toEqual({ reps: 0, seconds: 40, loadKg: 0 });
  });

  it('refuses invalid input instead of patching it', () => {
    for (const value of [0, -1, 2.5, NaN, null, undefined, 301])
      expect(makeSet('reps', { loadKg: 50, value })).toBeNull();
    expect(makeSet('seconds', { loadKg: 0, value: 3601 })).toBeNull();
    expect(makeSet('reps', { loadKg: -5, value: 8 })).toBeNull();
    expect(makeSet('reps', { loadKg: 1001, value: 8 })).toBeNull();
    expect(makeSet('reps', { loadKg: 50, value: 8, rpe: 42 })).toEqual({ reps: 8, loadKg: 50 });
  });

  it('maps a stored RPE back to its word', () => {
    expect(setFeel(undefined)).toBeNull();
    expect(setFeel(SET_FEELS.easy)).toBe('easy');
    expect(setFeel(SET_FEELS.ok)).toBe('ok');
    expect(setFeel(SET_FEELS.very_hard)).toBe('very_hard');
  });
});

describe('exercise status, progress and session result (derived, never "échec")', () => {
  const a = ex();
  const b = ex({ prescribedId: 'row', exerciseId: 'row', plannedId: 'p2' });
  const three = [
    { reps: 8, loadKg: 70 },
    { reps: 8, loadKg: 70 },
    { reps: 8, loadKg: 70 },
  ];

  it('status: pending, in progress, done, not performed', () => {
    expect(exerciseStatus(a, [])).toBe('pending');
    expect(exerciseStatus(a, three.slice(0, 1))).toBe('in_progress');
    expect(exerciseStatus(a, three)).toBe('done');
    expect(exerciseStatus(a, [], { notPerformed: true, notPerformedReason: 'no_time' })).toBe('not_performed');
    // A set logged after all counts: the fact wins.
    expect(exerciseStatus(a, three.slice(0, 1), { notPerformed: true })).toBe('in_progress');
  });

  it('progress counts settled exercises and points to the next one to do', () => {
    const p = sessionProgress([a, b], { bench_press: three }, {});
    expect(p).toEqual({ setsDone: 3, setsPlanned: 6, exercisesDone: 1, exercisesSettled: 1, total: 2, current: 1 });
    const settled = sessionProgress([a, b], { bench_press: three }, { row: { notPerformed: true } });
    expect(settled).toMatchObject({ exercisesDone: 1, exercisesSettled: 2, current: null });
  });

  it('result: planned, in progress, completed, partial, stopped, skipped', () => {
    const base = { completed: null, outcome: null, exercises: [a, b], sets: {}, reports: {} };
    expect(sessionResult(base)).toBe('planned');
    expect(sessionResult({ ...base, sets: { bench_press: three.slice(0, 1) } })).toBe('in_progress');
    expect(sessionResult({ ...base, reports: { row: { difficulty: 3 } } })).toBe('in_progress');
    expect(sessionResult({ ...base, completed: {}, sets: { bench_press: three, row: three } })).toBe('completed');
    expect(sessionResult({ ...base, completed: {}, sets: { bench_press: three } })).toBe('partial');
    expect(sessionResult({ ...base, completed: { stopped: 'pain' }, sets: { bench_press: three } })).toBe('stopped');
    expect(sessionResult({ ...base, outcome: { status: 'skipped' } })).toBe('skipped');
  });
});

describe('sessionSummary: real facts only', () => {
  const a = ex();
  const b = ex({ prescribedId: 'row', exerciseId: 'push_up', replaced: true, plannedId: 'p2' });
  const c = ex({ prescribedId: 'squat', exerciseId: 'squat', plannedId: 'p3' });

  it('duration from opening to end, sets, replacements with reason, not performed, records', () => {
    const s = sessionSummary({
      key: MONDAY,
      exercises: [a, b, c],
      setLogs: {
        [LAST_WEEK]: { bench_press: [{ reps: 10, loadKg: 67.5 }] },
        [MONDAY]: {
          bench_press: [
            { reps: 8, loadKg: 70 },
            { reps: 8, loadKg: 70 },
          ],
          push_up: [{ reps: 12, loadKg: 0 }],
        },
      },
      reports: { squat: { notPerformed: true, notPerformedReason: 'no_time' } },
      swapReasons: { row: 'busy_equipment' },
      openedAt: '2026-09-28T18:00:00.000Z',
      endedAt: '2026-09-28T18:41:20.000Z',
    });
    expect(s).toEqual({
      minutes: 41,
      exercisesDone: 0,
      exercisesTotal: 3,
      sets: 3,
      replacements: [{ fromId: 'row', toId: 'push_up', reason: 'busy_equipment' }],
      notPerformed: ['squat'],
      // push_up has no earlier set: a first time is not a record.
      records: [{ exerciseId: 'bench_press', loadKg: 70, reps: 8, kind: 'load' }],
    });
  });

  it('more reps at the same load is a record; no opening means no duration', () => {
    const s = sessionSummary({
      key: MONDAY,
      exercises: [a],
      setLogs: {
        [LAST_WEEK]: { bench_press: [{ reps: 8, loadKg: 70 }] },
        [MONDAY]: { bench_press: [{ reps: 10, loadKg: 70 }] },
      },
      reports: {},
      swapReasons: {},
      openedAt: null,
      endedAt: '2026-09-28T19:00:00.000Z',
    });
    expect(s.minutes).toBeNull();
    expect(s.records).toEqual([{ exerciseId: 'bench_press', loadKg: 70, reps: 10, kind: 'reps' }]);
  });
});

describe('replacement reasons', () => {
  it('the shown reasons are a subset of the stored list (old reasons stay readable)', () => {
    for (const r of SHOWN_REPLACEMENT_REASONS) expect(REPLACEMENT_REASONS).toContain(r);
    for (const old of ['dislike', 'easier']) expect(REPLACEMENT_REASONS).toContain(old);
  });

  it('discomfort: no "continue", offers to skip or to end; technique shows cues; busy is one-off', () => {
    expect(replacementAdvice('discomfort')).toEqual({ note: 'discomfort', showCues: false, offerStop: true });
    expect(replacementAdvice('cant_do')).toEqual({ note: 'technique', showCues: true, offerStop: false });
    expect(replacementAdvice('busy_equipment').note).toBe('one_off');
    expect(replacementAdvice('no_equipment').note).toBe('one_off');
    expect(replacementAdvice('preference').note).toBe('preference');
    expect(replacementAdvice('dislike').note).toBe('preference');
    expect(replacementAdvice('no_time').note).toBeNull();
  });
});

describe('why and coach hints (no progression decision)', () => {
  it('why reads the structured purpose of the row', () => {
    expect(whyKey(ex({ purpose: 'strength', purposeTarget: 'chest' }))).toEqual({
      key: 'workout.why.strength',
      target: 'chest',
    });
    expect(whyKey(ex({ purpose: null }))).toBeNull();
  });

  it('target, last time, keep load, very hard set', () => {
    const last = { date: '2026-09-21', loadKg: 67.5, reps: 10, seconds: null };
    const pre = prefill(ex(), [], last, { holdIncrease: false });
    expect(coachHint(ex(), [], null, pre)).toEqual({ key: 'target', params: { min: 8, max: 10 } });
    expect(coachHint(ex(), [], last, pre)).toEqual({ key: 'last_time', params: { reps: 10 } });
    expect(coachHint(ex(), [], { ...last, reps: null, seconds: 40 }, pre)).toEqual({
      key: 'last_time_seconds',
      params: { seconds: 40 },
    });
    expect(coachHint(ex(), [], last, { ...pre, keepLoad: true }).key).toBe('keep_load');
    expect(coachHint(ex(), [{ reps: 8, loadKg: 70, rpe: 10 }], last, pre).key).toBe('very_hard');
    expect(coachHint(ex(), [{ reps: 8, loadKg: 70, rpe: 8 }], last, pre).key).toBe('target');
  });
});

describe('rest timer (timestamps, so it survives a screen change)', () => {
  const T0 = 1_000_000;

  it('counts down from the prescribed rest and never below zero', () => {
    const t = startRest(T0, 90);
    expect(restRemaining(t, T0)).toBe(90);
    expect(restRemaining(t, T0 + 30_500)).toBe(60);
    expect(restRemaining(t, T0 + 200_000)).toBe(0);
  });

  it('+30 s extends, also after the end (from now)', () => {
    const t = startRest(T0, 60);
    expect(restRemaining(extendRest(t, T0), T0)).toBe(90);
    const late = extendRest(t, T0 + 100_000);
    expect(restRemaining(late, T0 + 100_000)).toBe(30);
  });

  it('pause freezes the remaining time, resume continues it', () => {
    const paused = pauseRest(startRest(T0, 60), T0 + 20_000);
    expect(restRemaining(paused, T0 + 50_000)).toBe(40);
    expect(restRemaining(extendRest(paused, T0 + 50_000), T0 + 50_000)).toBe(70);
    const resumed = resumeRest(paused, T0 + 50_000);
    expect(restRemaining(resumed, T0 + 60_000)).toBe(30);
    expect(resumeRest(resumed, T0)).toBe(resumed);
    expect(pauseRest(paused, T0)).toBe(paused);
  });
});
