/**
 * Workout Coach sync (W-2, D-032) between devices, against an in-memory server that enforces the
 * same rules as the W-1 migration (immutable versions and prescriptions, one active version, one
 * version number per lineage, foreign keys). The same scenarios run on real Postgres + RLS in
 * `sync.db.test.ts`.
 */
import { SCENARIOS, scenario } from '@/domain/scenarios';
import { publishWeek } from '@/domain/scenarios/training';
import type { UserContextSnapshot } from '@/domain/profile/schemas';
import { sessionKey } from '@/domain/shared/ids';
import type { Row, SyncableState, SyncedHashes, SyncTable } from '@/domain/sync/projection';
import { activeProgram, prescriptionFor, rescheduleSession } from '@/domain/training/week';

import { classifySyncError, syncOnce, type SyncClient } from '../sync';

const USER = '11111111-1111-4111-8111-111111111111';
const WEEK = '2026-09-28';
const MONDAY = sessionKey('2026-09-28', 0);
const WEDNESDAY = sessionKey('2026-09-30', 1);
const FRIDAY = sessionKey('2026-10-02', 2);

const pgError = (code: string, message: string) => ({ code, message });

const PROGRAM_FROZEN = [
  'lineage_id',
  'version',
  'source',
  'reason_key',
  'adjustment_id',
  'engine_version',
  'goal',
  'split',
  'sessions_per_week',
  'session_minutes',
  'level',
  'equipment',
  'excluded_exercise_ids',
  'cycle_weeks',
  'effective_from',
  'published_at',
];
const SESSION_FROZEN = ['session_index', 'scheduled_for', 'focus', 'planned_minutes', 'purpose', 'prescribed_at'];
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null) ||
  (typeof a === 'string' && typeof b === 'string' && Date.parse(a) === Date.parse(b));

/** In-memory server with the W-1 rules. A batch is atomic, like one PostgREST request. */
function fakeServer() {
  let tables = new Map<SyncTable, Map<string, Row>>();
  let clock = 0;
  const tick = () => new Date(Date.UTC(2026, 8, 30, 12, 0, clock++)).toISOString();
  const table = (t: SyncTable, from = tables) => from.get(t) ?? from.set(t, new Map()).get(t)!;
  let offline = false;
  let calls = { attach: 0 };

  const check = (t: SyncTable, row: Row, old: Row | undefined, db: typeof tables) => {
    if (t === 'training_programs') {
      if (old) {
        if (PROGRAM_FROZEN.some((c) => !same(row[c], old[c])))
          return pgError('23514', 'training_programs: a published program version is immutable');
        if (row.status !== old.status && !(old.status === 'active' && row.status !== 'active'))
          return pgError('23514', 'training_programs: status cannot become');
        if (old.effective_to != null && !same(row.effective_to, old.effective_to))
          return pgError('23514', 'training_programs: effective_to is already set');
      }
      const others = [...table(t, db).values()].filter((r) => r.id !== row.id);
      if (row.status === 'active' && others.some((r) => r.status === 'active'))
        return pgError('23505', 'training_programs_one_active');
      if (others.some((r) => r.lineage_id === row.lineage_id && r.version === row.version))
        return pgError('23505', 'training_programs_user_id_lineage_id_version_key');
    }
    if (t === 'workout_sessions') {
      if (row.program_id != null && !table('training_programs', db).has(String(row.program_id)))
        return pgError('23503', 'workout_sessions_program_id_fkey');
      if (old?.program_id != null && row.program_id !== old.program_id)
        return pgError('23514', 'workout_sessions: a session cannot move to another program');
      if (old?.prescription_source != null && row.prescription_source !== old.prescription_source)
        return pgError('23514', 'workout_sessions: prescription_source is immutable');
      if (old?.prescribed_at != null && SESSION_FROZEN.some((c) => !same(row[c], old[c])))
        return pgError('23514', 'workout_sessions: a prescribed session is immutable');
    }
    if (t === 'planned_exercises') {
      if (!table('workout_sessions', db).has(String(row.session_id)))
        return pgError('23503', 'planned_exercises_session_id_fkey');
      if (old && Object.keys(row).some((c) => !same(row[c], old[c])))
        return pgError('23514', 'planned_exercises: a prescription is immutable');
    }
    if ((t === 'exercise_logs' || t === 'exercise_substitutions') && row.planned_exercise_id != null) {
      if (!table('planned_exercises', db).has(String(row.planned_exercise_id)))
        return pgError('23503', `${t}_planned_exercise_id_fkey`);
    }
    return null;
  };

  const client: SyncClient = {
    select: async (t, since) =>
      offline
        ? { data: null, error: pgError('', 'TypeError: Failed to fetch') }
        : { data: [...table(t).values()].filter((r) => !since || String(r.updated_at) > since), error: null },
    upsert: async (t, rows, onConflict) => {
      if (offline) return { error: pgError('', 'TypeError: Failed to fetch') };
      const draft = new Map([...tables].map(([k, v]) => [k, new Map(v)]));
      for (const r of rows) {
        const key = String(r[onConflict]);
        const old = table(t, draft).get(key);
        const error = check(t, r, old, draft);
        if (error) return { error };
        table(t, draft).set(key, { ...old, ...r, updated_at: tick() });
      }
      tables = draft;
      return { error: null };
    },
    softDelete: async (t, keys, at) => {
      for (const k of keys) {
        const r = table(t).get(k);
        if (r) table(t).set(k, { ...r, deleted_at: at, updated_at: tick() });
      }
      return { error: null };
    },
    // Same behaviour as `attach_reconstructed_training_history()`.
    attachHistory: async () => {
      if (offline) return { error: pgError('', 'TypeError: Failed to fetch') };
      calls.attach += 1;
      const legacy = [...table('workout_sessions').values()].filter(
        (s) => s.program_id == null && s.prescription_source == null,
      );
      if (legacy.length === 0) return { error: null };
      let program = [...table('training_programs').values()].find((p) => p.source === 'reconstructed');
      if (!program) {
        program = {
          id: 'eeeeeeee-0000-4000-8000-00000000000e',
          lineage_id: 'eeeeeeee-0000-4000-8000-00000000000f',
          version: 1,
          source: 'reconstructed',
          status: 'ended',
          reason_key: 'program.reason.reconstructed',
          adjustment_id: null,
          engine_version: null,
          goal: null,
          split: null,
          sessions_per_week: null,
          session_minutes: null,
          level: null,
          equipment: null,
          excluded_exercise_ids: null,
          cycle_weeks: null,
          effective_from: legacy.map((s) => String(s.scheduled_for)).sort()[0],
          effective_to: null,
          published_at: tick(),
          user_id: USER,
          updated_at: tick(),
        };
        table('training_programs').set(String(program.id), program);
      }
      for (const s of legacy) {
        table('workout_sessions').set(String(s.id), {
          ...s,
          program_id: program.id,
          prescription_source: 'unknown',
          updated_at: tick(),
        });
      }
      return { error: null };
    },
  };
  return {
    client,
    table,
    rows: (t: SyncTable) => [...table(t).values()],
    setOffline: (v: boolean) => (offline = v),
    attachCalls: () => calls.attach,
    reset: () => {
      tables = new Map();
      calls = { attach: 0 };
    },
  };
}

type DeviceState = SyncableState & { synced: SyncedHashes; lastPulledAt: string | null };

/** One device: its local store, plus what `usePlan` does when a screen renders. */
function device(snapshot: UserContextSnapshot, initial: Partial<SyncableState> = {}) {
  let state: DeviceState = {
    snapshot,
    inventory: [],
    weights: [],
    waist: [],
    expenses: [],
    mealPlan: null,
    completedSessions: [],
    setLogs: {},
    sessionIds: {},
    programs: [],
    prescriptions: {},
    superseded: {},
    synced: {},
    lastPulledAt: null,
    ...initial,
  };
  const store = {
    read: () => state,
    write: (patch: Partial<DeviceState>) => (state = { ...state, ...patch }),
  };
  return {
    store,
    state: () => state,
    set: (patch: Partial<DeviceState>) => store.write(patch),
    /** Opening the app: publish if needed and freeze the week (usePlan). */
    open: (today: string, at = `${today}T07:00:00.000Z`) => {
      const s = state;
      const week = publishWeek(s.snapshot!, {
        records: {
          programs: s.programs ?? [],
          prescriptions: s.prescriptions ?? {},
          superseded: s.superseded ?? {},
          sessionIds: s.sessionIds,
        },
        facts: s,
        rescheduled: s.rescheduled ?? {},
        today,
        weekStart: WEEK,
        seed: USER,
        at,
      });
      store.write(week);
    },
    /** Logging a set on the session of a day (store.logSet). */
    logSet: (key: string, exerciseId: string, reps: number, loadKg: number) => {
      const s = state;
      store.write({
        sessionIds: s.sessionIds[key]
          ? s.sessionIds
          : { ...s.sessionIds, [key]: `0000000${Object.keys(s.sessionIds).length}-0000-4000-8000-00000000000a` },
        sessionSources: s.sessionIds[key]
          ? s.sessionSources
          : { ...s.sessionSources, [key]: { source: 'off_plan', programId: null } },
        setLogs: {
          ...s.setLogs,
          [key]: { ...s.setLogs[key], [exerciseId]: [...(s.setLogs[key]?.[exerciseId] ?? []), { reps, loadKg }] },
        },
      });
    },
    sync: (claim = false) => syncOnce(fake.client, store, USER, { claim }),
  };
}

let fake = fakeServer();
beforeEach(() => {
  fake = fakeServer();
});

const firstExercise = (d: ReturnType<typeof device>, key: string) =>
  prescriptionFor({ prescriptions: d.state().prescriptions!, sessionIds: d.state().sessionIds }, key)!.exercises[0]
    .exerciseId;

describe('publication and reading on two devices', () => {
  it('A publishes v1, B syncs and sees exactly v1; A records a session, B sees it, linked to the prescription', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    expect((await a.sync(true)).errors).toEqual([]);
    expect(fake.rows('training_programs')).toHaveLength(1);
    expect(fake.rows('workout_sessions')).toHaveLength(3);
    expect(fake.rows('planned_exercises').length).toBeGreaterThan(10);

    const b = device(SCENARIOS.muscleGain);
    expect((await b.sync()).errors).toEqual([]);
    expect(b.state().programs).toEqual(a.state().programs!.map((p) => ({ ...p, publishedAt: expect.any(String) })));
    expect(b.state().sessionIds).toEqual(a.state().sessionIds);
    for (const id of Object.values(a.state().sessionIds)) {
      expect(b.state().prescriptions![id].exercises.map((e) => e.id)).toEqual(
        a.state().prescriptions![id].exercises.map((e) => e.id),
      );
    }
    // B opening the app publishes nothing: the version and the week are already there.
    const before = b.state();
    b.open('2026-09-28');
    expect(b.state().programs).toBe(before.programs);
    expect(b.state().prescriptions).toBe(before.prescriptions);

    // A records Monday's session.
    const exercise = firstExercise(a, MONDAY);
    a.logSet(MONDAY, exercise, 8, 40);
    a.set({
      completedSessions: [
        { date: '2026-09-28', sessionIndex: 0, variant: 'full', completedAt: '2026-09-28T19:00:00.000Z' },
      ],
    });
    expect((await a.sync()).errors).toEqual([]);
    const log = fake.rows('exercise_logs')[0];
    const planned = fake.table('planned_exercises').get(String(log.planned_exercise_id))!;
    expect(planned).toMatchObject({ exercise_id: exercise, session_id: a.state().sessionIds[MONDAY] });

    await b.sync();
    expect(b.state().setLogs[MONDAY]).toEqual({ [exercise]: [{ reps: 8, loadKg: 40, rpe: undefined }] });
    expect(b.state().completedSessions.map((c) => c.date)).toEqual(['2026-09-28']);
    // The prescription did not move.
    expect(b.state().prescriptions![b.state().sessionIds[MONDAY]]).toEqual(
      a.state().prescriptions![a.state().sessionIds[MONDAY]],
    );
  });

  it('offline then online: the synced program is read and the session recorded offline syncs without loss', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    await a.sync(true);
    fake.setOffline(true);
    // Reopening offline: the prescription is read from the device, nothing new is published.
    const before = a.state();
    a.open('2026-09-30');
    expect(a.state().programs).toBe(before.programs);
    const exercise = firstExercise(a, WEDNESDAY);
    a.logSet(WEDNESDAY, exercise, 10, 22.5);
    const offline = await a.sync();
    expect(offline.offline).toBe(true);
    expect(offline.errors).toEqual([{ kind: 'offline', phase: 'pull', table: 'profiles', count: 1 }]);
    fake.setOffline(false);
    expect((await a.sync()).errors).toEqual([]);
    const logs = fake.rows('exercise_logs');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reps: 10, load_kg: 22.5, session_id: a.state().sessionIds[WEDNESDAY] });
    expect(fake.table('workout_sessions').get(a.state().sessionIds[WEDNESDAY])).toMatchObject({
      status: 'in_progress',
    });
  });
});

describe('versions published offline on two devices (D-032)', () => {
  async function bothOnV1() {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    await a.sync(true);
    const b = device(SCENARIOS.muscleGain);
    await b.sync();
    return { a, b };
  }

  it('different changes: the first to reach the server wins, the other reconciles, then the profile decides', async () => {
    const { a, b } = await bothOnV1();
    const v1 = a.state().programs![0];
    const v1Rows = structuredClone(
      fake.rows('workout_sessions').filter((r) => r.program_id === v1.id && r.status === 'planned'),
    );
    // Offline, A goes down to 2 sessions, B removes the barbell. Both publish their own v2.
    fake.setOffline(true);
    a.set({ snapshot: scenario({ goal: { type: 'muscle_gain' }, training: { sessionsPerWeek: 2 } }) });
    a.open('2026-09-30');
    const bSnapshot = scenario({
      goal: { type: 'muscle_gain' },
      training: { equipment: ['bodyweight', 'dumbbells', 'bench'] },
    });
    b.set({ snapshot: bSnapshot });
    b.open('2026-09-30');
    expect(activeProgram(a.state().programs!)!.version).toBe(2);
    expect(activeProgram(b.state().programs!)!.version).toBe(2);
    expect(activeProgram(a.state().programs!)!.id).toBe(activeProgram(b.state().programs!)!.id);
    // B starts Wednesday offline with its own v2 prescription.
    const bExercise = firstExercise(b, WEDNESDAY);
    b.logSet(WEDNESDAY, bExercise, 12, 0);
    fake.setOffline(false);

    // A reaches the server first.
    expect((await a.sync()).errors).toEqual([]);
    // B: the pull brings A's v2 (same id, other parameters): B's v2 content loses.
    const result = await b.sync();
    expect(result.errors).toEqual([]);
    expect(b.state().programs!.filter((p) => p.status === 'active')).toHaveLength(1);
    expect(activeProgram(b.state().programs!)!.params!.sessionsPerWeek).toBe(2);
    // The session B started is kept with its facts.
    expect(b.state().setLogs[WEDNESDAY][bExercise]).toHaveLength(1);
    // Converge: B's profile (pushed, it was pending) differs from v2 → B publishes v3 for it.
    b.open('2026-09-30');
    await b.sync();
    await b.sync();
    await a.sync();
    a.set({ snapshot: a.state().snapshot });
    a.open('2026-09-30');
    await a.sync();
    await b.sync();

    const server = fake.rows('training_programs');
    expect(server.filter((p) => p.status === 'active')).toHaveLength(1);
    expect(server.map((p) => p.version).sort()).toEqual([1, 2, 3]);
    // v1 was never rewritten (only closed), and its sessions before the change are intact.
    const v1Server = fake.table('training_programs').get(v1.id)!;
    expect(v1Server).toMatchObject({ status: 'superseded', sessions_per_week: 3, effective_from: WEEK });
    const monday = fake.table('workout_sessions').get(a.state().sessionIds[MONDAY])!;
    expect(monday).toMatchObject({ program_id: v1.id, status: 'planned' });
    for (const r of v1Rows.filter((r) => r.scheduled_for === '2026-09-28')) {
      expect(fake.table('workout_sessions').get(String(r.id))).toMatchObject({ prescribed_at: r.prescribed_at });
    }
    // Both devices agree on the active version, on the sessions and on the facts.
    expect(activeProgram(a.state().programs!)!.id).toBe(activeProgram(b.state().programs!)!.id);
    expect(a.state().setLogs[WEDNESDAY]).toEqual(b.state().setLogs[WEDNESDAY]);
    const ids = new Set(fake.rows('workout_sessions').map((r) => r.id));
    expect(ids.size).toBe(fake.rows('workout_sessions').length);
  });

  it('the same change on both devices creates no duplicate', async () => {
    const { a, b } = await bothOnV1();
    fake.setOffline(true);
    const two = scenario({ goal: { type: 'muscle_gain' }, training: { sessionsPerWeek: 2 } });
    a.set({ snapshot: two });
    b.set({ snapshot: two });
    a.open('2026-09-30', '2026-09-30T08:00:00.000Z');
    b.open('2026-09-30', '2026-09-30T09:00:00.000Z');
    fake.setOffline(false);
    await a.sync();
    await b.sync();
    await b.sync();
    await a.sync();
    expect(fake.rows('training_programs')).toHaveLength(2);
    expect(fake.rows('training_programs').filter((p) => p.status === 'active')).toHaveLength(1);
    expect(b.state().sessionIds).toEqual(a.state().sessionIds);
    // B adopted the server's prescriptions (A's): nothing left to push, nothing refused.
    const again = await b.sync();
    expect([again.pushed, again.failed]).toEqual([0, 0]);
  });

  it('two changes beat one: the higher version stays active and closes the other', async () => {
    const { a, b } = await bothOnV1();
    fake.setOffline(true);
    a.set({ snapshot: scenario({ goal: { type: 'muscle_gain' }, training: { sessionsPerWeek: 2 } }) });
    a.open('2026-09-29');
    a.set({
      snapshot: scenario({ goal: { type: 'muscle_gain' }, training: { sessionsPerWeek: 2, sessionMinutes: 45 } }),
    });
    a.open('2026-09-30');
    b.set({ snapshot: scenario({ goal: { type: 'muscle_gain' }, training: { sessionsPerWeek: 4 } }) });
    b.open('2026-09-30');
    fake.setOffline(false);
    await b.sync(); // B's v2 reaches the server first.
    await a.sync(); // A: its v2 loses (same id), its v3 is newer and wins.
    expect((await a.sync()).errors).toEqual([]);
    const server = fake.rows('training_programs');
    expect(server.filter((p) => p.status === 'active').map((p) => p.version)).toEqual([3]);
    expect(server.map((p) => p.version).sort()).toEqual([1, 2, 3]);
    await b.sync();
    expect(activeProgram(b.state().programs!)!.version).toBe(3);
  });
});

describe('history, off plan and reschedules', () => {
  it('attaches history recorded before W-2 once, from device A then a partially synced device B', async () => {
    const legacyA = { [sessionKey('2026-09-14', 0)]: 'aaaaaaaa-0000-4000-8000-0000000000a1' };
    const a = device(SCENARIOS.muscleGain, {
      sessionIds: legacyA,
      setLogs: { [sessionKey('2026-09-14', 0)]: { squat: [{ reps: 5, loadKg: 60 }] } },
    });
    await a.sync(true);
    // The first round pushed A's history; the next one attaches it (no history on the server before).
    await a.sync();
    expect(fake.attachCalls()).toBeGreaterThanOrEqual(1);
    const reconstructed = fake.rows('training_programs').filter((p) => p.source === 'reconstructed');
    expect(reconstructed).toHaveLength(1);
    expect(a.state().sessionSources![sessionKey('2026-09-14', 0)]).toEqual({
      source: 'unknown',
      programId: reconstructed[0].id,
    });
    // Nothing invented: no planned exercise for the history.
    expect(fake.rows('planned_exercises')).toHaveLength(0);

    // Device B still holds older history of its own, never synced.
    const b = device(SCENARIOS.muscleGain, {
      sessionIds: { [sessionKey('2026-09-07', 1)]: 'bbbbbbbb-0000-4000-8000-0000000000b1' },
      setLogs: { [sessionKey('2026-09-07', 1)]: { squat: [{ reps: 5, loadKg: 55 }] } },
    });
    await b.sync();
    await b.sync();
    expect(fake.rows('training_programs').filter((p) => p.source === 'reconstructed')).toHaveLength(1);
    expect(fake.rows('workout_sessions').every((s) => s.prescription_source === 'unknown')).toBe(true);
    expect(b.state().sessionSources![sessionKey('2026-09-07', 1)]?.source).toBe('unknown');
    // Idempotent: nothing left to attach, no further call.
    const calls = fake.attachCalls();
    await a.sync();
    await b.sync();
    expect(fake.attachCalls()).toBe(calls);
  });

  it('records a session off plan as a fact, with no prescription', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    const sunday = sessionKey('2026-10-04', 0);
    a.logSet(sunday, 'push_up', 15, 0);
    await a.sync(true);
    const row = fake.table('workout_sessions').get(a.state().sessionIds[sunday])!;
    expect(row).toMatchObject({ prescription_source: 'off_plan', program_id: null, focus: null, prescribed_at: null });
    expect(fake.rows('planned_exercises').filter((p) => p.session_id === row.id)).toHaveLength(0);
    expect(fake.rows('exercise_logs')[0]).toMatchObject({ planned_exercise_id: null });
    const b = device(SCENARIOS.muscleGain);
    await b.sync();
    expect(b.state().sessionSources![sunday]).toEqual({ source: 'off_plan', programId: null });
  });

  it('syncs a reschedule: the original keeps its row, the new day has the same prescription, no duplicate', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    await a.sync(true);
    const moved = rescheduleSession(
      {
        programs: a.state().programs!,
        prescriptions: a.state().prescriptions!,
        superseded: a.state().superseded!,
        sessionIds: a.state().sessionIds,
      },
      a.state(),
      '2026-09-30',
      '2026-10-01',
    )!;
    a.set({ ...moved, rescheduled: { '2026-09-30': '2026-10-01' } });
    await a.sync();
    const original = fake.table('workout_sessions').get(a.state().sessionIds[WEDNESDAY])!;
    expect(original).toMatchObject({
      status: 'rescheduled',
      rescheduled_to: '2026-10-01',
      scheduled_for: '2026-09-30',
    });
    const copy = fake.table('workout_sessions').get(a.state().sessionIds[sessionKey('2026-10-01', 1)])!;
    expect(copy).toMatchObject({
      status: 'planned',
      program_id: original.program_id,
      prescribed_at: original.prescribed_at,
    });
    expect(fake.rows('workout_sessions')).toHaveLength(4);

    const b = device(SCENARIOS.muscleGain);
    await b.sync();
    expect(b.state().rescheduled).toEqual({ '2026-09-30': '2026-10-01' });
    expect(b.state().sessionIds[sessionKey('2026-10-01', 1)]).toBe(copy.id);
    expect(b.state().sessionIds[FRIDAY]).toBe(a.state().sessionIds[FRIDAY]);
  });
});

describe('structured errors', () => {
  it('classifies failures without exposing details', () => {
    expect(classifySyncError(new Error('network'))).toBe('offline');
    expect(classifySyncError({ code: '', message: 'Failed to fetch' })).toBe('offline');
    expect(classifySyncError({ code: '42501', message: 'new row violates row-level security policy' })).toBe('rls');
    expect(classifySyncError({ code: '23505', message: 'duplicate key' })).toBe('conflict');
    expect(classifySyncError({ code: '23514', message: 'a prescribed session is immutable' })).toBe('conflict');
    expect(classifySyncError({ code: '23514', message: 'violates check constraint' })).toBe('validation');
    expect(classifySyncError({ code: '22P02', message: 'invalid input syntax' })).toBe('validation');
    expect(classifySyncError({ code: '57014', message: 'canceling statement' })).toBe('server');
  });

  it('reports a conflict when another device publishes between the pull and the push, then resolves it', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    const b = device(SCENARIOS.muscleGain);
    b.open('2026-09-28', '2026-09-28T09:00:00.000Z');
    await a.sync(true);
    // B pulled before A pushed (simulated: B's cursor is after A's rows, so they are not pulled).
    b.set({ lastPulledAt: '2099-01-01T00:00:00.000Z' });
    const conflicted = await b.sync();
    expect(conflicted.errors.some((e) => e.kind === 'conflict' && e.table === 'workout_sessions')).toBe(true);
    // Next round (normal cursor): the server's copy comes back and nothing is refused any more.
    b.set({ lastPulledAt: null });
    const resolved = await b.sync();
    expect(resolved.errors).toEqual([]);
    expect(b.state().prescriptions![b.state().sessionIds[MONDAY]].prescribedAt).toBe('2026-09-28T07:00:00.000Z');
  });

  it('reports invalid rows pulled from the server and ignores them', async () => {
    fake
      .table('training_programs')
      .set('x', { id: 'x', source: 'engine', status: 'active', updated_at: '2026-09-30T00:00:00.000Z' });
    const b = device(SCENARIOS.muscleGain);
    const result = await b.sync();
    expect(result.errors).toContainEqual({ kind: 'invalid_data', phase: 'pull', count: 1 });
    expect(b.state().programs).toEqual([]);
  });
});
