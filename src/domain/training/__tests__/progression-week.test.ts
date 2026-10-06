import { gateProgression } from '../../journey/adaptation';
import { SCENARIOS } from '../../scenarios';
import { EMPTY_FACTS, publishWeek } from '../../scenarios/training';
import { sessionKey } from '../../shared/ids';
import { exerciseHistory } from '../history';
import type { LoggedSet } from '../progression';
import {
  adaptSession,
  prescriptionFor,
  progressionSignals,
  refreshWeek,
  type TrainingFacts,
  type TrainingRecords,
} from '../week';

/** W-4 (D-035): history per exercise, and the progression reaching the future, never the past. */

const SNAP = SCENARIOS.muscleGain;
const WEEK = '2026-09-28';
const MONDAY = sessionKey('2026-09-28', 0);
const WEDNESDAY = sessionKey('2026-09-30', 1);
const LAST_WEDNESDAY = sessionKey('2026-09-23', 1);
const SEED = '11111111-1111-4111-8111-111111111111';
const AT = '2026-09-28T07:00:00.000Z';
const top = (load: number): LoggedSet[] => [10, 10, 10].map((reps) => ({ reps, loadKg: load }));

const bench = (r: TrainingRecords, key: string) =>
  prescriptionFor(r, key)!.exercises.find((e) => e.variant === 'full' && e.exerciseId === 'bench_press')!;

/** Last Wednesday (off plan) 70 × 10 × 3 on the bench; the week published on Monday. */
function setup() {
  const before: TrainingFacts = { ...EMPTY_FACTS, setLogs: { [LAST_WEDNESDAY]: { bench_press: top(70) } } };
  const week = publishWeek(SNAP, { facts: before, today: WEEK, weekStart: WEEK, seed: SEED, at: AT });
  return { before, week };
}

/** Monday done: 70 × 10 × 3 again. */
const mondayDone = (before: TrainingFacts): TrainingFacts => ({
  ...before,
  setLogs: { ...before.setLogs, [MONDAY]: { bench_press: top(70) } },
  completedSessions: [{ date: '2026-09-28', sessionIndex: 0, variant: 'full' }],
});

const refresh = (
  records: TrainingRecords,
  facts: TrainingFacts,
  today: string,
  extra: Partial<Parameters<typeof refreshWeek>[0]> = {},
) =>
  refreshWeek({
    records,
    facts,
    rescheduled: {},
    today,
    weekStart: WEEK,
    prescribedAt: `${today}T08:00:00.000Z`,
    ...extra,
  });

describe('exerciseHistory: real facts only', () => {
  it('reads the prescription of the day, the variant, the difficulty and the declared fatigue', () => {
    const { week } = setup();
    const facts: TrainingFacts = {
      ...EMPTY_FACTS,
      setLogs: { [MONDAY]: { bench_press: top(70) } },
      completedSessions: [{ date: '2026-09-28', sessionIndex: 0, variant: 'short', stopped: 'no_time' }],
      sessionDifficulty: { [MONDAY]: 4 },
      exerciseReports: { [MONDAY]: { bench_press: { difficulty: 5 } } },
      dayLogs: [{ date: '2026-09-28', energy: 2, motivation: 3, fatigue: 3 }],
    };
    const h = exerciseHistory({
      exerciseId: 'bench_press',
      records: week,
      facts,
      before: '2026-09-30',
      today: '2026-09-30',
    });
    expect(h.exposures).toEqual([
      expect.objectContaining({
        key: MONDAY,
        variant: 'short',
        // No short row for the bench that day: the prescription of the variant done is unknown.
        prescribed: null,
        exerciseDifficulty: 5,
        sessionDifficulty: 4,
        fatigueHigh: true,
        stopped: 'no_time',
      }),
    ]);
  });

  it('a light or short day off plan stays light or short (never read as a full session)', () => {
    const { week } = setup();
    const facts: TrainingFacts = {
      ...EMPTY_FACTS,
      setLogs: {
        [sessionKey('2026-09-22', 0)]: { bench_press: top(40) },
        [sessionKey('2026-09-24', 0)]: { bench_press: top(70) },
      },
      completedSessions: [{ date: '2026-09-22', sessionIndex: 0, variant: 'light' }],
    };
    const h = exerciseHistory({
      exerciseId: 'bench_press',
      records: week,
      facts,
      before: '2026-09-28',
      today: '2026-09-28',
    });
    expect(h.exposures.map((e) => e.variant)).toEqual(['light', 'off_plan']);
  });

  it('a replacement keeps its own history; the replaced exercise gets "replaced" and its reason', () => {
    const { week } = setup();
    const facts: TrainingFacts = {
      ...EMPTY_FACTS,
      setLogs: { [MONDAY]: { db_bench_press: top(24) } },
      completedSessions: [{ date: '2026-09-28', sessionIndex: 0, variant: 'full' }],
      exerciseSwaps: { [MONDAY]: { bench_press: 'db_bench_press' } },
      swapReasons: { [MONDAY]: { bench_press: 'busy_equipment' } },
    };
    const args = { records: week, facts, before: '2026-09-30', today: '2026-09-30' };
    const original = exerciseHistory({ ...args, exerciseId: 'bench_press' });
    expect(original.exposures).toEqual([]);
    expect(original.notDone).toEqual([{ key: MONDAY, date: '2026-09-28', kind: 'replaced', reason: 'busy_equipment' }]);
    const replacement = exerciseHistory({ ...args, exerciseId: 'db_bench_press' });
    // Done as a replacement: its sets, never the bench's prescription.
    expect(replacement.exposures).toEqual([expect.objectContaining({ prescribed: null, sets: top(24) })]);
  });

  it('"not performed" with its reason; adherence counts only what was planned and is past', () => {
    const { week } = setup();
    const facts: TrainingFacts = {
      ...EMPTY_FACTS,
      exerciseReports: { [MONDAY]: { bench_press: { notPerformed: true, notPerformedReason: 'too_hard_today' } } },
    };
    const h = exerciseHistory({
      exerciseId: 'bench_press',
      records: week,
      facts,
      before: '2026-10-02',
      today: '2026-10-01',
    });
    expect(h.notDone).toEqual([{ key: MONDAY, date: '2026-09-28', kind: 'not_performed', reason: 'too_hard_today' }]);
    // Monday and Wednesday planned with the bench, both past, none done.
    expect(h.adherence).toBe(0);
    expect(
      exerciseHistory({ exerciseId: 'bench_press', records: week, facts, before: '2026-09-28', today: '2026-09-28' })
        .adherence,
    ).toBeNull();
  });
});

describe('the future follows, the past stays (§24, §25)', () => {
  it('Monday 70 × 10 confirmed → Wednesday is prescribed 72.5; Monday stays 70; no new version', () => {
    const { before, week } = setup();
    expect(bench(week, MONDAY)).toMatchObject({ targetLoadKg: 70, progressionAction: 'maintain' });
    expect(bench(week, WEDNESDAY)).toMatchObject({ targetLoadKg: 70, progressionAction: 'maintain' });
    // Nothing done yet: nothing to refresh.
    expect(refresh(week, before, '2026-09-28')).toBeNull();

    const facts = mondayDone(before);
    const next = refresh(week, facts, '2026-09-28')!;
    expect(bench(next, WEDNESDAY)).toMatchObject({
      targetLoadKg: 72.5,
      progressionAction: 'increase_load',
      progressionReason: 'progression.reason.top_confirmed',
      targetReps: 6,
      progressionConfidence: 'medium',
      progressionParams: { sessions: 2, max: 10, increment: 2.5 },
    });
    // Monday: the same prescription object, untouched (it holds facts).
    expect(next.sessionIds[MONDAY]).toBe(week.sessionIds[MONDAY]);
    expect(next.prescriptions[week.sessionIds[MONDAY]]).toBe(week.prescriptions[week.sessionIds[MONDAY]]);
    // Wednesday: a new prescription; the previous one kept, superseded, unchanged.
    const old = week.sessionIds[WEDNESDAY];
    expect(next.sessionIds[WEDNESDAY]).not.toBe(old);
    expect(next.superseded[old]).toBe(true);
    expect(next.prescriptions[old]).toBe(week.prescriptions[old]);
    expect(next.prescriptions[next.sessionIds[WEDNESDAY]].programId).toBe(week.programs[0].id);
    expect(next.programs).toBe(week.programs);
    // Idempotent: a second call writes nothing.
    expect(refresh(next, facts, '2026-09-28')).toBeNull();
  });

  it('every device computes the same new prescription id (multi-device, §32)', () => {
    const { before, week } = setup();
    const facts = mondayDone(before);
    const a = refresh(week, facts, '2026-09-28')!;
    const b = refreshWeek({
      records: week,
      facts,
      rescheduled: {},
      today: '2026-09-28',
      weekStart: WEEK,
      prescribedAt: '2026-09-28T21:00:00.000Z',
    })!;
    expect(b.sessionIds[WEDNESDAY]).toBe(a.sessionIds[WEDNESDAY]);
    expect(bench(b, WEDNESDAY).id).toBe(bench(a, WEDNESDAY).id);
  });

  it('a prescription equal to an earlier one revives it instead of copying it', () => {
    const { before, week } = setup();
    const facts = mondayDone(before);
    const raised = refresh(week, facts, '2026-09-28')!;
    // Monday's sets are corrected away: the proposals are the original ones again.
    const back = refresh(raised, before, '2026-09-28')!;
    expect(back.sessionIds[WEDNESDAY]).toBe(week.sessionIds[WEDNESDAY]);
    expect(back.superseded[week.sessionIds[WEDNESDAY]]).toBeUndefined();
    expect(back.superseded[raised.sessionIds[WEDNESDAY]]).toBe(true);
  });

  it('never touches an opened, adapted, moved or past session', () => {
    const { before, week } = setup();
    const facts = mondayDone(before);
    expect(
      refresh(week, { ...facts, sessionOpened: { [WEDNESDAY]: AT } }, '2026-09-28')?.sessionIds[WEDNESDAY] ??
        week.sessionIds[WEDNESDAY],
    ).toBe(week.sessionIds[WEDNESDAY]);
    const wednesday = prescriptionFor(week, WEDNESDAY)!;
    const light = adaptSession({
      session: wednesday,
      program: week.programs[0],
      variant: 'light',
      training: SNAP.training,
      done: false,
      prescribedAt: AT,
    })!;
    const adapted = { ...week, prescriptions: { ...week.prescriptions, [wednesday.id]: light } };
    expect(refresh(adapted, facts, '2026-09-28')?.sessionIds[WEDNESDAY] ?? wednesday.id).toBe(wednesday.id);
    expect(
      refresh(week, facts, '2026-09-28', { rescheduled: { '2026-09-29': '2026-09-30' } })?.sessionIds[WEDNESDAY] ??
        wednesday.id,
    ).toBe(wednesday.id);
    // Thursday: Wednesday is in the past, nothing is rewritten.
    expect(refresh(week, facts, '2026-10-01')?.sessionIds[WEDNESDAY] ?? wednesday.id).toBe(wednesday.id);
  });

  it("today's fatigue holds today's session only; safety holds every session", () => {
    const { before, week } = setup();
    const facts = mondayDone(before);
    const ctx = { safetyActive: false, fatigueHigh: true, noPush: false };
    const tired = refresh(week, facts, '2026-09-30', {
      gate: (rec, date) => gateProgression(rec, { ...ctx, fatigueHigh: date === '2026-09-30' }),
    })!;
    expect(bench(tired, WEDNESDAY)).toMatchObject({
      targetLoadKg: 70,
      progressionAction: 'maintain',
      progressionReason: 'progression.reason.held_fatigue',
    });
    const safety = refresh(week, facts, '2026-09-28', {
      gate: (rec) => gateProgression(rec, { safetyActive: true, fatigueHigh: false, noPush: false }),
    });
    // Same as frozen (keep 70): nothing to write.
    expect(safety === null || bench(safety, WEDNESDAY).targetLoadKg === 70).toBe(true);
  });

  it('a profile change publishes v2 for the future; the session done keeps v1 and its loads (§31, D-033)', () => {
    const { before, week } = setup();
    const facts = mondayDone(before);
    const next = refresh(week, facts, '2026-09-29')!;
    const monday = next.prescriptions[next.sessionIds[MONDAY]];
    const v2 = publishWeek(
      { ...SNAP, training: { ...SNAP.training, equipment: ['bodyweight', 'dumbbells'], hasGym: false } },
      { records: next, facts, today: '2026-09-29', weekStart: WEEK, seed: SEED, at: '2026-09-29T07:00:00.000Z' },
    );
    expect(v2.programs.filter((p) => p.status === 'active')).toHaveLength(1);
    expect(v2.prescriptions[v2.sessionIds[MONDAY]]).toBe(monday);
    expect(monday.programId).toBe(week.programs[0].id);
    expect(bench(v2, MONDAY).targetLoadKg).toBe(70);
    expect(prescriptionFor(v2, WEDNESDAY)!.programId).not.toBe(week.programs[0].id);
  });
});

describe('plan-level signals', () => {
  it('a plateau or a downward trend is read per exercise, on its own history', () => {
    const { week } = setup();
    expect(progressionSignals({ records: week, facts: EMPTY_FACTS, today: '2026-09-30' })).toEqual({
      stagnating: [],
      down: [],
    });
    const drop = (reps: number): LoggedSet[] => [reps, reps, reps].map((r) => ({ reps: r, loadKg: 70 }));
    const facts: TrainingFacts = {
      ...EMPTY_FACTS,
      setLogs: {
        [sessionKey('2026-09-21', 0)]: { bench_press: drop(10), overhead_press: drop(9) },
        [sessionKey('2026-09-23', 1)]: { bench_press: drop(9), overhead_press: drop(8) },
        [MONDAY]: { bench_press: drop(8), overhead_press: drop(7) },
      },
    };
    expect(progressionSignals({ records: week, facts, today: '2026-09-29' }).down).toEqual([
      'bench_press',
      'overhead_press',
    ]);
  });
});
