import { SCENARIOS } from '../../scenarios';
import { publishWeek } from '../../scenarios/training';
import { sessionKey } from '../../shared/ids';
import { compareSession, compareWeek, isDone, sessionKeysBetween, type CompareFacts } from '../compare';
import type { LoggedSet } from '../progression';
import { prescriptionFor, rescheduleSession, type TrainingRecords } from '../week';

/** W-6 (D-038): planned vs done, derived from the stored prescription and the records only. */

const SNAP = SCENARIOS.muscleGain;
const WEEK = '2026-09-28';
const MONDAY = sessionKey('2026-09-28', 0);
const WEDNESDAY = sessionKey('2026-09-30', 1);
const FRIDAY = sessionKey('2026-10-02', 2);
const THURSDAY = '2026-10-01';
const SEED = '11111111-1111-4111-8111-111111111111';
const AT = '2026-09-28T07:00:00.000Z';

const records = (): TrainingRecords => publishWeek(SNAP, { today: WEEK, weekStart: WEEK, seed: SEED, at: AT });
const R = records();
const full = (key: string) =>
  prescriptionFor(R, key)!
    .exercises.filter((e) => e.variant === 'full')
    .sort((a, b) => a.position - b.position);
const sets = (n: number, reps = 10, loadKg = 40): LoggedSet[] => Array.from({ length: n }, () => ({ reps, loadKg }));
/** Every planned set of a session, as recorded. */
const allSets = (key: string) => Object.fromEntries(full(key).map((e) => [e.exerciseId, sets(e.sets)]));
const facts = (patch: Partial<CompareFacts> = {}): CompareFacts => ({ setLogs: {}, completedSessions: [], ...patch });
const doneOn = (key: string, patch: Record<string, unknown> = {}) => {
  const [date, index] = key.split('#');
  return { date, sessionIndex: Number(index), variant: 'full' as const, completedAt: `${date}T18:00:00Z`, ...patch };
};

describe('compareSession', () => {
  it('a session done in full: every planned set, every exercise done', () => {
    const f = facts({ setLogs: { [MONDAY]: allSets(MONDAY) }, completedSessions: [doneOn(MONDAY)] });
    const c = compareSession({ records: R, facts: f, key: MONDAY, today: '2026-10-01' });
    expect(c.status).toBe('completed');
    expect(c.source).toBe('engine');
    expect(c.setsDone).toBe(c.setsPlanned);
    expect(c.exercises.every((e) => e.outcome === 'done' && e.setsDone === e.setsPlanned)).toBe(true);
    expect(c.minutes).toBe(prescriptionFor(R, MONDAY)!.plannedMinutes);
  });

  it('done in part: the missing sets are a fact, the session is "partial", never a failure', () => {
    const [a, b] = full(MONDAY);
    const f = facts({
      setLogs: { [MONDAY]: { [a.exerciseId]: sets(a.sets - 1), [b.exerciseId]: sets(b.sets) } },
      completedSessions: [doneOn(MONDAY)],
    });
    const c = compareSession({ records: R, facts: f, key: MONDAY, today: '2026-10-01' });
    expect(c.status).toBe('partial');
    expect(c.exercises[0]).toMatchObject({ outcome: 'partial', setsDone: a.sets - 1, setsPlanned: a.sets });
    expect(c.exercises[1].outcome).toBe('done');
    // Not touched and session over: "not recorded", not "missed".
    expect(c.exercises.slice(2).every((e) => e.outcome === 'not_recorded')).toBe(true);
    expect(c.setsDone).toBe(a.sets - 1 + b.sets);
  });

  it('a replacement keeps its reason, its sets belong to the exercise done', () => {
    const [a] = full(MONDAY);
    const f = facts({
      setLogs: { [MONDAY]: { push_up: sets(a.sets, 12, 0) } },
      exerciseSwaps: { [MONDAY]: { [a.exerciseId]: 'push_up' } },
      swapReasons: { [MONDAY]: { [a.exerciseId]: 'busy_equipment' } },
      completedSessions: [doneOn(MONDAY)],
    });
    const e = compareSession({ records: R, facts: f, key: MONDAY, today: '2026-10-01' }).exercises[0];
    expect(e).toMatchObject({
      prescribedId: a.exerciseId,
      exerciseId: 'push_up',
      replaced: true,
      replacedReason: 'busy_equipment',
      outcome: 'done',
      setsDone: a.sets,
    });
  });

  it('an exercise declared not performed keeps its reason', () => {
    const [a] = full(MONDAY);
    const f = facts({
      exerciseReports: { [MONDAY]: { [a.exerciseId]: { notPerformed: true, notPerformedReason: 'no_time' } } },
      completedSessions: [doneOn(MONDAY, { stopped: 'no_time' })],
    });
    const c = compareSession({ records: R, facts: f, key: MONDAY, today: '2026-10-01' });
    expect(c.status).toBe('stopped');
    expect(c.reason).toBe('no_time');
    expect(c.exercises[0]).toMatchObject({ outcome: 'not_performed', notPerformedReason: 'no_time', setsDone: 0 });
  });

  it('past without any record: "not_recorded"; today and ahead: "planned"; started: "in_progress"', () => {
    const f = facts({ setLogs: { [WEDNESDAY]: { [full(WEDNESDAY)[0].exerciseId]: sets(1) } } });
    expect(compareSession({ records: R, facts: f, key: MONDAY, today: '2026-09-30' }).status).toBe('not_recorded');
    expect(compareSession({ records: R, facts: f, key: FRIDAY, today: '2026-09-30' }).status).toBe('planned');
    const started = compareSession({ records: R, facts: f, key: WEDNESDAY, today: '2026-09-30' });
    expect(started.status).toBe('in_progress');
    expect(started.exercises.slice(1).every((e) => e.outcome === 'pending')).toBe(true);
  });

  it('skipped or replaced by a light activity: the declared outcome and reason', () => {
    const f = facts({
      sessionOutcomes: {
        [MONDAY]: { status: 'skipped', reason: 'tired', at: AT },
        [WEDNESDAY]: { status: 'replaced', replacedBy: 'walk', at: AT },
      },
    });
    expect(compareSession({ records: R, facts: f, key: MONDAY, today: '2026-10-01' })).toMatchObject({
      status: 'skipped',
      reason: 'tired',
    });
    expect(compareSession({ records: R, facts: f, key: WEDNESDAY, today: '2026-10-01' })).toMatchObject({
      status: 'replaced',
      replacedBy: 'walk',
    });
  });

  it('a moved session: the original says where it went, the copy is planned on its new day', () => {
    const moved = rescheduleSession(R, facts(), '2026-09-30', THURSDAY)!;
    const f = facts({ rescheduled: { '2026-09-30': THURSDAY } });
    expect(compareSession({ records: moved, facts: f, key: WEDNESDAY, today: WEEK })).toMatchObject({
      status: 'moved',
      movedTo: THURSDAY,
    });
    const copy = compareSession({ records: moved, facts: f, key: sessionKey(THURSDAY, 1), today: WEEK });
    expect(copy).toMatchObject({ status: 'planned', movedTo: null, source: 'engine' });
  });

  it('a light session compares with the light rows it was built from', () => {
    const p = prescriptionFor(R, MONDAY)!;
    const light = {
      ...p,
      exercises: [
        ...p.exercises,
        ...full(MONDAY)
          .slice(0, 2)
          .map((e) => ({ ...e, id: `${e.id}-l`, variant: 'light' as const, sets: 2 })),
      ],
    };
    const r = { ...R, prescriptions: { ...R.prescriptions, [p.id]: light } };
    const f = facts({
      setLogs: {
        [MONDAY]: Object.fromEntries(
          full(MONDAY)
            .slice(0, 2)
            .map((e) => [e.exerciseId, sets(2)]),
        ),
      },
      completedSessions: [doneOn(MONDAY, { variant: 'light' })],
    });
    const c = compareSession({ records: r, facts: f, key: MONDAY, today: '2026-10-01' });
    expect(c).toMatchObject({ variant: 'light', status: 'completed', setsPlanned: 4, setsDone: 4 });
  });

  it('without a prescription (off plan, or before W-1): only what was recorded, nothing to compare', () => {
    const key = sessionKey('2026-09-29', 0);
    const f = facts({
      setLogs: { [key]: { squat: sets(3) } },
      completedSessions: [doneOn(key)],
      sessionSources: { [key]: { source: 'off_plan', programId: null } },
    });
    const c = compareSession({ records: R, facts: f, key, today: '2026-10-01' });
    expect(c).toMatchObject({ source: 'off_plan', setsPlanned: null, setsDone: 3, status: 'completed', focus: null });
    expect(c.exercises).toEqual([expect.objectContaining({ exerciseId: 'squat', setsPlanned: null, setsDone: 3 })]);
    const legacy = compareSession({ records: R, facts: { ...f, sessionSources: {} }, key, today: '2026-10-01' });
    expect(legacy.source).toBe('unknown');
  });

  it('a second real session of a day (D-033 slot) is an extra session', () => {
    const slot = sessionKey('2026-09-28', 6);
    const f = facts({
      setLogs: { [slot]: { squat: sets(2) } },
      completedSessions: [doneOn(slot)],
      sessionSlots: { [slot]: MONDAY },
    });
    expect(compareSession({ records: R, facts: f, key: slot, today: '2026-10-01' }).extra).toBe(true);
  });

  it('reads, never writes: the records and the facts are unchanged', () => {
    const f = facts({ setLogs: { [MONDAY]: allSets(MONDAY) }, completedSessions: [doneOn(MONDAY)] });
    const before = JSON.stringify([R, f]);
    compareWeek({ records: R, facts: f, weekStart: WEEK, today: '2026-10-01' });
    expect(JSON.stringify([R, f])).toBe(before);
  });
});

describe('compareWeek', () => {
  it('counts planned, done, adapted, extra, ahead and the sets of the sessions done', () => {
    const extraKey = sessionKey('2026-09-29', 0);
    const f = facts({
      setLogs: { [MONDAY]: allSets(MONDAY), [extraKey]: { squat: sets(3) } },
      completedSessions: [doneOn(MONDAY), doneOn(extraKey)],
      sessionOutcomes: { [WEDNESDAY]: { status: 'replaced', replacedBy: 'walk', at: AT } },
      sessionSources: { [extraKey]: { source: 'off_plan', programId: null } },
    });
    const w = compareWeek({ records: R, facts: f, weekStart: WEEK, today: '2026-10-01' });
    const monday = full(MONDAY).reduce((n, e) => n + e.sets, 0);
    expect(w).toMatchObject({ planned: 3, done: 1, adapted: 1, extra: 1, ahead: 1 });
    // Only sessions done with a prescription: the off-plan sets have nothing to compare with.
    expect([w.setsDone, w.setsPlanned]).toEqual([monday, monday]);
  });

  it('a moved session counts once, on its new day', () => {
    const moved = rescheduleSession(R, facts(), '2026-09-30', THURSDAY)!;
    const w = compareWeek({
      records: moved,
      facts: facts({ rescheduled: { '2026-09-30': THURSDAY } }),
      weekStart: WEEK,
      today: WEEK,
    });
    expect(w.planned).toBe(3);
    expect(w.sessions.map((s) => [s.date, s.status])).toContainEqual(['2026-09-30', 'moved']);
  });

  it('sessionKeysBetween: prescribed, done, declared, or with sets', () => {
    const f = facts({ sessionOutcomes: { [sessionKey('2026-10-03', 0)]: { status: 'skipped', at: AT } } });
    expect(sessionKeysBetween(R, f, WEEK, '2026-10-04')).toEqual([MONDAY, WEDNESDAY, FRIDAY, '2026-10-03#0']);
    expect(isDone('stopped') && isDone('partial') && !isDone('moved')).toBe(true);
  });
});
