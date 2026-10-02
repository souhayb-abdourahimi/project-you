import { SCENARIOS, scenario } from '../../scenarios';
import { EMPTY_FACTS, emptyRecords, publishWeek, scheduledWeek } from '../../scenarios/training';
import { sessionKey } from '../../shared/ids';
import type { ProgramParams } from '../program';
import {
  activeProgram,
  adaptSession,
  archivedVersion,
  ensureProgram,
  ensureWeek,
  hasFacts,
  keptSession,
  prescriptionFor,
  proposedLoads,
  rescheduleSession,
  trainingIds,
  variantTemplate,
  versionInForce,
  versionReason,
  type TrainingRecords,
} from '../week';

const SNAP = SCENARIOS.muscleGain;
const WEEK = '2026-09-28';
const MONDAY = sessionKey('2026-09-28', 0);
const WEDNESDAY = sessionKey('2026-09-30', 1);
const FRIDAY = sessionKey('2026-10-02', 2);
const AT = '2026-09-28T07:00:00.000Z';
const SEED = '11111111-1111-4111-8111-111111111111';

const first = (records?: TrainingRecords, today = '2026-09-28') =>
  publishWeek(SNAP, { records, today, weekStart: WEEK, seed: SEED, at: AT });

describe('publication (W-2)', () => {
  it('publishes v1 once, covering the current week, and freezes every planned session', () => {
    const r = first();
    expect(r.programs).toHaveLength(1);
    const v1 = r.programs[0];
    expect(v1).toMatchObject({ version: 1, status: 'active', source: 'engine', effectiveFrom: WEEK });
    expect(v1.id).toBe(trainingIds.version(trainingIds.lineage(SEED), 1));
    expect(Object.keys(r.sessionIds).sort()).toEqual([MONDAY, WEDNESDAY, FRIDAY]);
    for (const id of Object.values(r.sessionIds)) {
      const p = r.prescriptions[id];
      expect(p.programId).toBe(v1.id);
      expect(p.exercises.length).toBeGreaterThan(0);
      expect(p.exercises.every((e) => e.variant === 'full' && e.sessionId === id)).toBe(true);
    }
  });

  it('is idempotent: a relaunch, a re-render or a second device publishes nothing new and the same ids', () => {
    const once = first();
    expect(
      ensureProgram({
        programs: once.programs,
        goal: SNAP.goal.type,
        training: SNAP.training,
        today: '2026-09-29',
        weekStart: WEEK,
        seed: SEED,
        publishedAt: '2026-09-29T07:00:00.000Z',
        adjustmentId: null,
      }),
    ).toBeNull();
    expect(
      ensureWeek({
        records: once,
        facts: EMPTY_FACTS,
        rescheduled: {},
        today: '2026-09-29',
        weekStart: WEEK,
        scheduled: scheduledWeek(SNAP, WEEK),
        prescribedAt: '2026-09-29T07:00:00.000Z',
      }),
    ).toBeNull();
    // Another device, same account, same profile: same rows (only the timestamps would differ).
    const other = publishWeek(SNAP, {
      today: '2026-09-28',
      weekStart: WEEK,
      seed: SEED,
      at: '2026-09-28T09:30:00.000Z',
    });
    expect(other.programs.map((p) => p.id)).toEqual(once.programs.map((p) => p.id));
    expect(other.sessionIds).toEqual(once.sessionIds);
    const ids = (r: TrainingRecords) => Object.values(r.prescriptions).flatMap((p) => p.exercises.map((e) => e.id));
    expect(ids(other)).toEqual(ids(once));
  });

  it('reads the persisted prescription instead of rebuilding it', () => {
    const r = first();
    const p = prescriptionFor(r, WEDNESDAY)!;
    const template = variantTemplate(p, 'full')!;
    expect(template.focus).toBe(p.focus);
    expect(template.estimatedMinutes).toBe(p.plannedMinutes);
    expect(template.exercises.map((e) => e.exerciseId)).toEqual(p.exercises.map((e) => e.exerciseId));
    // A profile change does not touch what is stored (the template comes from the rows).
    const changed = publishWeek(scenario({ training: { equipment: ['bodyweight'] } }), {
      records: r,
      today: '2026-09-30',
      weekStart: WEEK,
      seed: SEED,
      at: '2026-09-30T07:00:00.000Z',
    });
    expect(changed.prescriptions[r.sessionIds[MONDAY]]).toEqual(r.prescriptions[r.sessionIds[MONDAY]]);
  });
});

describe('new versions (D-032 triggers)', () => {
  const params = (over: Partial<ProgramParams> = {}): ProgramParams => ({
    engineVersion: 1,
    goal: 'muscle_gain',
    split: ['full_a', 'full_b', 'full_a'],
    sessionsPerWeek: 3,
    sessionMinutes: 60,
    level: 'intermediate',
    equipment: ['bodyweight', 'dumbbells'],
    excludedExerciseIds: [],
    ...over,
  });

  it('names the reason of each new version and publishes none for small interactions', () => {
    expect(versionReason(null, params(), null)).toBe('program.reason.first');
    expect(versionReason(params(), params(), null)).toBeNull();
    expect(versionReason(params(), params({ sessionsPerWeek: 2 }), null)).toBe('program.reason.frequency');
    expect(versionReason(params(), params({ sessionsPerWeek: 2 }), 'adj-1')).toBe('program.reason.adaptation');
    expect(versionReason(params(), params({ equipment: ['bodyweight'] }), null)).toBe('program.reason.equipment');
    expect(versionReason(params(), params({ goal: 'fat_loss' }), null)).toBe('program.reason.goal');
    expect(versionReason(params(), params({ level: 'advanced' }), null)).toBe('program.reason.level');
    expect(versionReason(params(), params({ sessionMinutes: 45 }), null)).toBe('program.reason.duration');
    expect(versionReason(params(), params({ excludedExerciseIds: ['burpee'] }), null)).toBe('program.reason.exercises');
  });

  it('profile change: v2 from today, v1 kept and readable, past sessions exactly as in v1', () => {
    const v1Week = first();
    const v1 = v1Week.programs[0];
    const monday = structuredClone(v1Week.prescriptions[v1Week.sessionIds[MONDAY]]);
    const facts = {
      setLogs: { [MONDAY]: { [monday.exercises[0].exerciseId]: [{ reps: 8, loadKg: 20 }] } },
      completedSessions: [],
    };
    const later = scenario({ goal: { type: 'muscle_gain' }, training: { sessionsPerWeek: 2 } });
    const r = publishWeek(later, {
      records: v1Week,
      facts,
      today: '2026-09-30',
      weekStart: WEEK,
      seed: SEED,
      at: '2026-09-30T07:00:00.000Z',
    });
    expect(r.programs).toHaveLength(2);
    const [closed, v2] = [r.programs.find((p) => p.id === v1.id)!, activeProgram(r.programs)!];
    expect(closed).toMatchObject({ status: 'superseded', effectiveTo: '2026-09-29', params: v1.params });
    expect(v2).toMatchObject({
      version: 2,
      lineageId: v1.lineageId,
      effectiveFrom: '2026-09-30',
      reasonKey: 'program.reason.frequency',
    });
    // The past session (started) is exactly the v1 prescription.
    expect(r.sessionIds[MONDAY]).toBe(monday.id);
    expect(r.prescriptions[monday.id]).toEqual(monday);
    expect(versionInForce(r.programs, '2026-09-28')?.id).toBe(v1.id);
    // Wednesday and Friday were not started: v1's sessions are superseded, kept, not deleted.
    const oldWednesday = v1Week.sessionIds[WEDNESDAY];
    expect(r.superseded[oldWednesday]).toBe(true);
    expect(r.prescriptions[oldWednesday]).toEqual(v1Week.prescriptions[oldWednesday]);
    expect(r.prescriptions[r.sessionIds[WEDNESDAY]].programId).toBe(v2.id);
    expect(r.prescriptions[r.sessionIds[WEDNESDAY]].id).toBe(trainingIds.session(v2.id, WEDNESDAY));
    // Two sessions a week now: Friday is no longer planned, v1's Friday is kept as superseded.
    expect(r.sessionIds[FRIDAY]).toBeUndefined();
    expect(r.superseded[v1Week.sessionIds[FRIDAY]]).toBe(true);
  });

  it('a closed version never prescribes a new session in the past', () => {
    const r = first();
    const v1 = r.programs[0];
    const closed = { ...v1, status: 'superseded' as const, effectiveTo: '2026-10-04' };
    const out = ensureWeek({
      records: { ...emptyRecords(), programs: [closed] },
      facts: EMPTY_FACTS,
      rescheduled: {},
      today: '2026-09-30',
      weekStart: WEEK,
      scheduled: scheduledWeek(SNAP, WEEK),
      prescribedAt: AT,
    });
    expect(out).toBeNull();
  });

  it('a schedule change moves only not-started future sessions, and moving back revives the same prescription', () => {
    const r = first();
    const friday = r.sessionIds[FRIDAY];
    const withoutFriday = ensureWeek({
      records: r,
      facts: EMPTY_FACTS,
      rescheduled: {},
      today: '2026-09-30',
      weekStart: WEEK,
      scheduled: scheduledWeek(SNAP, WEEK).filter((s) => s.date !== '2026-10-02'),
      prescribedAt: '2026-09-30T07:00:00.000Z',
    })!;
    expect(withoutFriday.superseded[friday]).toBe(true);
    expect(withoutFriday.sessionIds[FRIDAY]).toBeUndefined();
    expect(withoutFriday.programs).toBe(r.programs);
    const back = ensureWeek({
      records: withoutFriday,
      facts: EMPTY_FACTS,
      rescheduled: {},
      today: '2026-09-30',
      weekStart: WEEK,
      scheduled: scheduledWeek(SNAP, WEEK),
      prescribedAt: '2026-09-30T09:00:00.000Z',
    })!;
    expect(back.sessionIds[FRIDAY]).toBe(friday);
    expect(back.superseded[friday]).toBeUndefined();
    expect(back.prescriptions[friday]).toBe(r.prescriptions[friday]);
  });
});

describe('variants of the day', () => {
  it('short and light add their own rows; the full prescription never changes', () => {
    const r = first();
    const p = r.prescriptions[r.sessionIds[MONDAY]];
    const full = structuredClone(p.exercises);
    const short = adaptSession({
      session: p,
      program: r.programs[0],
      variant: 'short',
      training: SNAP.training,
      done: false,
      prescribedAt: '2026-09-28T18:00:00.000Z',
    })!;
    expect(short.exercises.filter((e) => e.variant === 'full')).toEqual(full);
    expect(short.exercises.some((e) => e.variant === 'short')).toBe(true);
    expect(short.adaptationReason).toBe('workout.variant.short');
    expect(variantTemplate(short, 'short')!.estimatedMinutes).toBeLessThanOrEqual(15);
    // Already there: nothing to add, the stored rows are read.
    expect(
      adaptSession({
        session: short,
        program: r.programs[0],
        variant: 'short',
        training: SNAP.training,
        done: false,
        prescribedAt: AT,
      }),
    ).toBeNull();
    const light = adaptSession({
      session: short,
      program: r.programs[0],
      variant: 'light',
      training: SNAP.training,
      done: false,
      prescribedAt: AT,
    })!;
    expect(light.exercises.filter((e) => e.variant !== 'light')).toEqual(short.exercises);
    expect(light.adaptedMinutes).toBe(short.adaptedMinutes);
    // A finished session is never adapted afterwards.
    expect(
      adaptSession({
        session: p,
        program: r.programs[0],
        variant: 'light',
        training: SNAP.training,
        done: true,
        prescribedAt: AT,
      }),
    ).toBeNull();
  });
});

describe('proposed loads', () => {
  it('persists a load proposed from real sets, and null when there is no history (never invented)', () => {
    const none = first();
    for (const p of Object.values(none.prescriptions)) {
      for (const e of p.exercises) expect([e.targetLoadKg, e.progressionAction]).toEqual([null, null]);
    }
    const template = {
      exercises: [
        {
          exerciseId: 'bench_press',
          sets: 3,
          repsMin: 6,
          repsMax: 10,
          unit: 'reps' as const,
          restSeconds: 120,
          targetRpe: 8,
          alternatives: [],
        },
      ],
    };
    const setLogs = {
      [sessionKey('2026-09-21', 0)]: {
        bench_press: [
          { reps: 10, loadKg: 50 },
          { reps: 10, loadKg: 50 },
        ],
      },
    };
    const loads = proposedLoads(template, setLogs, '2026-09-28');
    expect(loads.bench_press).toMatchObject({ action: 'increase_load', reasonKey: 'progression.reason.top_of_range' });
    expect(loads.bench_press.loadKg).toBeGreaterThan(50);
    // Sets of the same day or later are not history.
    expect(proposedLoads(template, setLogs, '2026-09-21')).toEqual({});
  });
});

describe('reschedule', () => {
  it('keeps the original session and gives the new day the same prescription, once', () => {
    const r = first();
    const original = r.prescriptions[r.sessionIds[WEDNESDAY]];
    const moved = rescheduleSession(r, EMPTY_FACTS, '2026-09-30', '2026-10-01')!;
    expect(moved.sessionIds[WEDNESDAY]).toBe(original.id);
    const copy = prescriptionFor(moved, sessionKey('2026-10-01', 1))!;
    expect(copy.id).toBe(trainingIds.moved(original.id, '2026-10-01'));
    expect(copy).toMatchObject({
      date: '2026-10-01',
      programId: original.programId,
      prescribedAt: original.prescribedAt,
    });
    expect(copy.exercises.map((e) => [e.exerciseId, e.sets, e.repsMin])).toEqual(
      original.exercises.map((e) => [e.exerciseId, e.sets, e.repsMin]),
    );
    expect(copy.exercises.every((e) => e.sessionId === copy.id)).toBe(true);
    // Moving twice or onto a busy day does nothing.
    expect(rescheduleSession(moved, EMPTY_FACTS, '2026-09-30', '2026-10-01')).toBeNull();
    // ensureWeek keeps both (the schedule now shows the session on Thursday).
    const scheduled = scheduledWeek(SNAP, WEEK).map((s) =>
      s.date === '2026-09-30' ? { ...s, date: '2026-10-01' } : s,
    );
    expect(
      ensureWeek({
        records: moved,
        facts: EMPTY_FACTS,
        rescheduled: { '2026-09-30': '2026-10-01' },
        today: '2026-09-30',
        weekStart: WEEK,
        scheduled,
        prescribedAt: AT,
      }),
    ).toBeNull();
  });

  it('never moves a session already started', () => {
    const r = first();
    const facts = { setLogs: { [WEDNESDAY]: { squat: [{ reps: 5, loadKg: 60 }] } }, completedSessions: [] };
    expect(hasFacts(facts, WEDNESDAY)).toBe(true);
    expect(rescheduleSession(r, facts, '2026-09-30', '2026-10-01')).toBeNull();
  });
});

describe('historical truth (D-033)', () => {
  it('opening a prescribed session makes its prescription the one the user saw', () => {
    const r = first();
    const opened = { ...EMPTY_FACTS, sessionOpened: { [WEDNESDAY]: '2026-09-30T10:00:00.000Z' } };
    expect(hasFacts(EMPTY_FACTS, WEDNESDAY)).toBe(false);
    expect(hasFacts(opened, WEDNESDAY)).toBe(true);
    // A profile change the same day does not replace it; the not-opened Friday follows v2.
    const v2 = publishWeek(scenario({ goal: { type: 'muscle_gain' }, training: { sessionMinutes: 45 } }), {
      records: r,
      facts: opened,
      today: '2026-09-30',
      weekStart: WEEK,
      seed: SEED,
      at: '2026-09-30T11:00:00.000Z',
    });
    expect(v2.sessionIds[WEDNESDAY]).toBe(r.sessionIds[WEDNESDAY]);
    expect(v2.sessionIds[FRIDAY]).not.toBe(r.sessionIds[FRIDAY]);
    // Opening does not prevent moving it: the copy keeps the same prescription.
    expect(rescheduleSession(r, opened, '2026-09-30', '2026-10-01')).not.toBeNull();
  });

  it('a used session of a version that lost is kept with its content under new ids, its version archived', () => {
    const r = first();
    const local = activeProgram(r.programs)!;
    const winner = { ...local, publishedAt: '2026-09-28T09:00:00.000Z', effectiveFrom: '2026-09-30' };
    const archived = archivedVersion(local, winner);
    expect(archived).toMatchObject({
      version: 1,
      status: 'superseded',
      params: local.params,
      effectiveTo: '2026-09-29',
    });
    expect(archived.lineageId).not.toBe(local.lineageId);
    expect(archivedVersion(local, winner)).toEqual(archived); // same id on a retry or another device
    const p = r.prescriptions[r.sessionIds[WEDNESDAY]];
    const kept = keptSession(p, archived.id, WEDNESDAY);
    expect(kept.id).toBe(trainingIds.session(archived.id, WEDNESDAY));
    expect(kept.exercises.map(({ id: _i, sessionId: _s, ...e }) => e)).toEqual(
      p.exercises.map(({ id: _i, sessionId: _s, ...e }) => e),
    );
    expect(kept.exercises.every((e) => e.sessionId === kept.id && !p.exercises.some((x) => x.id === e.id))).toBe(true);
    expect(kept.prescribedAt).toBe(p.prescribedAt);
    // Same version, other prescription on the server: new session id, same program.
    const same = keptSession(p, p.programId, WEDNESDAY);
    expect(same).toMatchObject({ programId: p.programId, id: trainingIds.kept(p.id, p.prescribedAt) });
  });
});
