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
import { adherence } from '@/domain/journey/adherence';
import type { PrescribedSession } from '@/domain/training/program';
import { appliedDecisions, decisionFor, effectiveDecisions, revertDecision } from '@/domain/journey/adjustments';
import { STRUCTURE, structureFor } from '@/domain/training/structure';
import { activeProgram, adaptSession, prescriptionFor, refreshWeek, rescheduleSession } from '@/domain/training/week';

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
  'rotated_exercise_ids',
  'cycle_weeks',
  'effective_from',
  'published_at',
];
const SESSION_FROZEN = [
  'session_index',
  'scheduled_for',
  'focus',
  'planned_minutes',
  'purpose',
  'prescribed_at',
  'adjustment_id',
];
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
    // W-5: a decision is history (append-only); an identical upsert from a second device passes.
    if (t === 'adjustments' && old) {
      const keys = new Set(
        [...Object.keys(row), ...Object.keys(old)].filter((c) => !['updated_at', 'deleted_at'].includes(c)),
      );
      if ([...keys].some((c) => !same(row[c], old[c])))
        return pgError('23514', 'adjustments: a decision is immutable (record a new decision instead)');
    }
    if (t === 'exercise_reports' && !table('workout_sessions', db).has(String(row.session_id)))
      return pgError('23503', 'exercise_reports_session_id_fkey');
    if (
      (t === 'exercise_logs' || t === 'exercise_substitutions' || t === 'exercise_reports') &&
      row.planned_exercise_id != null
    ) {
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
    /** The workout screen showed the prescription of a day (store.openSession). */
    openSession: (key: string, at = '2026-09-30T10:00:00.000Z') =>
      store.write({ sessionOpened: { ...state.sessionOpened, [key]: at } }),
    /** Replacing an exercise (store.swapExercise). */
    swap: (key: string, from: string, to: string) =>
      store.write({
        exerciseSwaps: { ...state.exerciseSwaps, [key]: { ...state.exerciseSwaps?.[key], [from]: to } },
        swapReasons: { ...state.swapReasons, [key]: { ...state.swapReasons?.[key], [from]: 'busy_equipment' } },
      }),
    /** The journey refreshing the week not started yet with the progression (useJourney, W-4). */
    refresh: (today: string, at = `${today}T08:00:00.000Z`) => {
      const s = state;
      const next = refreshWeek({
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
        prescribedAt: at,
        // Structural changes accepted on this device or synced from another one (W-5).
        structure: structureFor(
          s.adjustments ?? [],
          { prescriptions: s.prescriptions ?? {}, sessionIds: s.sessionIds },
          s.completedSessions,
        ),
      });
      if (next) store.write(next);
      return next !== null;
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
    // The session B started is kept with its facts and with the prescription B showed (D-033).
    expect(b.state().setLogs[WEDNESDAY][bExercise]).toHaveLength(1);
    expect(firstExercise(b, WEDNESDAY)).toBe(bExercise);
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
    // B's v2 lost for the future but was used: archived (closed) under its own lineage.
    expect(server.map((p) => p.version).sort()).toEqual([1, 2, 2, 3]);
    const archived = server.find((p) => p.version === 2 && p.status === 'superseded' && p.sessions_per_week === 3)!;
    expect([...(archived.equipment as string[])].sort()).toEqual(['bench', 'bodyweight', 'dumbbells']);
    expect(fake.table('workout_sessions').get(b.state().sessionIds[WEDNESDAY])).toMatchObject({
      program_id: archived.id,
      status: 'in_progress',
    });
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

describe('historical truth: the server decides the future, the prescription used decides the past (D-033)', () => {
  /** What was prescribed, without the ids (they change when a used session is kept aside). */
  const content = (p: PrescribedSession) => ({
    date: p.date,
    sessionIndex: p.sessionIndex,
    focus: p.focus,
    plannedMinutes: p.plannedMinutes,
    prescribedAt: p.prescribedAt,
    exercises: p.exercises.map(({ id: _id, sessionId: _s, ...e }) => e),
  });
  const live = (d: ReturnType<typeof device>, key: string) =>
    prescriptionFor({ prescriptions: d.state().prescriptions!, sessionIds: d.state().sessionIds }, key)!;
  /** One row per slot that is not superseded: nothing counted twice. */
  const slots = () =>
    fake
      .rows('workout_sessions')
      .filter((r) => r.status !== 'superseded')
      .map((r) => `${r.scheduled_for}#${r.session_index}`);

  /**
   * A and B on v1. Offline, A publishes v2-A (no barbell) and uses Wednesday; B publishes v2-B
   * (45 min) and reaches the server first. Then A comes back.
   */
  async function conflict(
    actA: (a: ReturnType<typeof device>) => void,
    actB: (b: ReturnType<typeof device>) => void = () => {},
  ) {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    await a.sync(true);
    const b = device(SCENARIOS.muscleGain);
    await b.sync();
    fake.setOffline(true);
    a.set({
      snapshot: scenario({
        goal: { type: 'muscle_gain' },
        training: { equipment: ['bodyweight', 'dumbbells', 'bench'] },
      }),
    });
    a.open('2026-09-30', '2026-09-30T08:00:00.000Z');
    const seenByA = content(live(a, WEDNESDAY));
    actA(a);
    b.set({ snapshot: scenario({ goal: { type: 'muscle_gain' }, training: { sessionMinutes: 45 } }) });
    b.open('2026-09-30', '2026-09-30T09:00:00.000Z');
    actB(b);
    const v2B = activeProgram(b.state().programs!)!;
    expect(activeProgram(a.state().programs!)!.id).toBe(v2B.id); // same id, other content
    expect(content(live(b, WEDNESDAY))).not.toEqual(seenByA);
    fake.setOffline(false);
    expect((await b.sync()).errors).toEqual([]);
    const fridayB = structuredClone(fake.table('workout_sessions').get(b.state().sessionIds[FRIDAY])!);
    expect((await a.sync()).errors).toEqual([]);
    expect((await a.sync()).errors).toEqual([]);
    expect((await b.sync()).errors).toEqual([]);
    return { a, b, v2B, seenByA, fridayB };
  }

  /** The assertions shared by every way of using the session. */
  function expectHistoryKept({ a, b, v2B, seenByA, fridayB }: Awaited<ReturnType<typeof conflict>>) {
    // One active version, B's, for the future, on the server and on both devices.
    const programs = fake.rows('training_programs');
    expect(programs.filter((p) => p.status === 'active').map((p) => p.id)).toEqual([v2B.id]);
    expect(fake.table('training_programs').get(v2B.id)).toMatchObject({ session_minutes: 45 });
    expect(activeProgram(a.state().programs!)!.id).toBe(v2B.id);
    expect(activeProgram(b.state().programs!)!.id).toBe(v2B.id);
    // A's Wednesday keeps exactly the prescription A showed, never B's, on both devices.
    const kept = live(a, WEDNESDAY);
    expect(content(kept)).toEqual(seenByA);
    expect(content(live(b, WEDNESDAY))).toEqual(seenByA);
    expect(b.state().sessionIds[WEDNESDAY]).toBe(kept.id);
    // Still prescribed (not off plan), by v2-A archived: closed, never active again.
    const row = fake.table('workout_sessions').get(kept.id)!;
    expect(row.prescription_source).toBe('engine');
    expect(['in_progress', 'completed']).toContain(row.status);
    expect(a.state().sessionSources?.[WEDNESDAY]).toBeUndefined();
    const archived = fake.table('training_programs').get(String(row.program_id))!;
    expect(archived).toMatchObject({ version: 2, status: 'superseded', session_minutes: 60 });
    expect(archived.equipment).not.toContain('barbell');
    // The server holds A's prescription for it, row by row.
    const planned = fake.rows('planned_exercises').filter((e) => e.session_id === kept.id);
    expect(planned.map((e) => e.exercise_id)).toEqual(kept.exercises.map((e) => e.exerciseId));
    // B's prescription for that slot is abandoned, kept as superseded, unchanged.
    const abandoned = fake
      .rows('workout_sessions')
      .filter((r) => r.program_id === v2B.id && r.scheduled_for === '2026-09-30');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]).toMatchObject({ status: 'superseded', prescribed_at: '2026-09-30T09:00:00.000Z' });
    // Nothing counted twice; the future (Friday) is B's prescription, untouched.
    expect(new Set(slots()).size).toBe(slots().length);
    expect(fake.table('workout_sessions').get(String(fridayB.id))).toEqual({
      ...fridayB,
      updated_at: expect.any(String),
    });
    expect(a.state().sessionIds[FRIDAY]).toBe(fridayB.id);
    // Converged: another round on each device pushes and refuses nothing.
    return { kept, planned };
  }

  it('a session only opened keeps the prescription it showed', async () => {
    const r = await conflict((a) => a.openSession(WEDNESDAY));
    const { kept } = expectHistoryKept(r);
    expect(fake.table('workout_sessions').get(kept.id)).toMatchObject({ started_at: '2026-09-30T10:00:00.000Z' });
    for (const d of [r.a, r.b]) expect(await d.sync()).toMatchObject({ pushed: 0, failed: 0 });
  });

  it('a session with sets keeps its prescription; the sets stay linked to it', async () => {
    let exercise = '';
    const r = await conflict((a) => {
      exercise = firstExercise(a, WEDNESDAY);
      a.logSet(WEDNESDAY, exercise, 8, 70);
      a.logSet(WEDNESDAY, exercise, 8, 70);
      a.set({
        completedSessions: [
          { date: '2026-09-30', sessionIndex: 1, variant: 'full', completedAt: '2026-09-30T19:00:00.000Z' },
        ],
      });
    });
    const { planned } = expectHistoryKept(r);
    const logs = fake.rows('exercise_logs');
    expect(logs).toHaveLength(2);
    const plannedIds = new Set(planned.map((e) => e.id));
    expect(logs.every((l) => plannedIds.has(String(l.planned_exercise_id)))).toBe(true);
    // Counted once everywhere: one live session for the day, one done session for adherence.
    for (const d of [r.a, r.b]) {
      expect(Object.keys(d.state().sessionIds).filter((k) => k.startsWith('2026-09-30'))).toEqual([WEDNESDAY]);
      const counted = adherence({
        today: '2026-09-30',
        plannedSessionDates: ['2026-09-28', '2026-09-30'],
        completedSessions: d.state().completedSessions,
        sessionOutcomes: {},
        meals: [],
      }).sessions;
      expect([counted.planned, counted.done]).toEqual([2, 1]);
    }
    expect(fake.table('workout_sessions').get(live(r.a, WEDNESDAY).id)).toMatchObject({ status: 'completed' });
    expect(r.b.state().setLogs[WEDNESDAY][exercise]).toEqual([
      { reps: 8, loadKg: 70, rpe: undefined },
      { reps: 8, loadKg: 70, rpe: undefined },
    ]);
    for (const d of [r.a, r.b]) expect(await d.sync()).toMatchObject({ pushed: 0, failed: 0 });
  });

  it('a replaced exercise keeps its prescription; the replacement stays linked to it', async () => {
    let exercise = '';
    const r = await conflict((a) => {
      exercise = firstExercise(a, WEDNESDAY);
      a.swap(WEDNESDAY, exercise, 'push_up');
    });
    const { planned } = expectHistoryKept(r);
    const swap = fake.rows('exercise_substitutions')[0];
    expect(swap).toMatchObject({ from_exercise_id: exercise, to_exercise_id: 'push_up' });
    expect(planned.map((e) => e.id)).toContain(swap.planned_exercise_id);
    expect(r.b.state().exerciseSwaps![WEDNESDAY]).toEqual({ [exercise]: 'push_up' });
    for (const d of [r.a, r.b]) expect(await d.sync()).toMatchObject({ pushed: 0, failed: 0 });
  });

  it('an exercise declared not performed (W-3) uses the session: it keeps its prescription, the report linked to it', async () => {
    let exercise = '';
    const r = await conflict((a) => {
      exercise = firstExercise(a, WEDNESDAY);
      a.set({
        exerciseReports: { [WEDNESDAY]: { [exercise]: { notPerformed: true, notPerformedReason: 'no_time' } } },
      });
    });
    const { planned } = expectHistoryKept(r);
    const report = fake.rows('exercise_reports')[0];
    expect(report).toMatchObject({ exercise_id: exercise, not_performed: true, not_performed_reason: 'no_time' });
    expect(planned.map((e) => e.id)).toContain(report.planned_exercise_id);
    expect(r.b.state().exerciseReports![WEDNESDAY]).toEqual({
      [exercise]: { notPerformed: true, notPerformedReason: 'no_time' },
    });
    for (const d of [r.a, r.b]) expect(await d.sync()).toMatchObject({ pushed: 0, failed: 0 });
  });

  it('same session, a different short version on each device: A’s facts stay on the short version A used (W-7.1)', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    await a.sync(true);
    const b = device(SCENARIOS.muscleGain);
    await b.sync();
    /** "J'ai N minutes" on a device (useWorkoutSession: the short rows are added, then read). */
    const short = (d: ReturnType<typeof device>, minutes: number, at: string) => {
      const session = live(d, WEDNESDAY);
      const next = adaptSession({
        session,
        program: activeProgram(d.state().programs!),
        variant: 'short',
        minutes,
        training: SCENARIOS.muscleGain.training,
        done: false,
        prescribedAt: at,
      })!;
      d.set({
        prescriptions: { ...d.state().prescriptions, [next.id]: next },
        sessionVariants: { ...d.state().sessionVariants, [WEDNESDAY]: 'short' },
      });
      return next.exercises.filter((e) => e.variant === 'short');
    };
    fake.setOffline(true);
    const usedByA = short(a, 15, '2026-09-30T10:00:00.000Z');
    const exercise = usedByA[0].exerciseId;
    a.logSet(WEDNESDAY, exercise, 12, 0);
    const byB = short(b, 30, '2026-09-30T09:00:00.000Z');
    const shortContent = (rows: PrescribedSession['exercises']) =>
      rows.map(({ exerciseId, sets, position }) => ({ exerciseId, sets, position }));
    expect(shortContent(byB)).not.toEqual(shortContent(usedByA));
    fake.setOffline(false);
    expect((await b.sync()).errors).toEqual([]);
    expect((await a.sync()).errors).toEqual([]);
    expect((await a.sync()).errors).toEqual([]);
    expect((await b.sync()).errors).toEqual([]);

    // On A, the session still shows exactly the short version A used.
    const keptOnA = live(a, WEDNESDAY);
    expect(shortContent(keptOnA.exercises.filter((e) => e.variant === 'short'))).toEqual(shortContent(usedByA));
    // On the server, A's set points to a planned row of that same short version, same content.
    const log = fake.rows('exercise_logs').find((l) => l.exercise_id === exercise)!;
    const plannedRow = fake.table('planned_exercises').get(String(log.planned_exercise_id))!;
    expect(plannedRow).toMatchObject({ session_id: keptOnA.id, variant: 'short', exercise_id: exercise });
    const serverShort = fake
      .rows('planned_exercises')
      .filter((e) => e.session_id === keptOnA.id && e.variant === 'short')
      .sort((x, y) => Number(x.position) - Number(y.position))
      .map((e) => ({ exerciseId: e.exercise_id, sets: e.sets, position: e.position }));
    expect(serverShort).toEqual(shortContent(usedByA));
    // B reads the same: its own session, the day of A's facts, both converged.
    expect(shortContent(live(b, WEDNESDAY).exercises.filter((e) => e.variant === 'short'))).toEqual(
      shortContent(usedByA),
    );
    for (const d of [a, b]) expect(await d.sync()).toMatchObject({ pushed: 0, failed: 0 });
  });

  it('a session not used adopts the server prescription (the future converges)', async () => {
    const r = await conflict(() => {});
    expect(r.a.state().sessionIds[WEDNESDAY]).toBe(r.b.state().sessionIds[WEDNESDAY]);
    expect(content(live(r.a, WEDNESDAY))).toEqual(content(live(r.b, WEDNESDAY)));
    expect(live(r.a, WEDNESDAY).programId).toBe(r.v2B.id);
    expect(fake.rows('training_programs')).toHaveLength(2);
  });

  it('same slot used on both devices: both sessions are kept, each counted once, the same way everywhere', async () => {
    let exercise = '';
    const r = await conflict(
      (a) => {
        exercise = firstExercise(a, WEDNESDAY);
        a.logSet(WEDNESDAY, exercise, 8, 70);
      },
      (b) => b.logSet(WEDNESDAY, firstExercise(b, WEDNESDAY), 6, 75),
    );
    // Two real sessions on the server for Wednesday's slot, both kept as they were done.
    const wednesday = fake
      .rows('workout_sessions')
      .filter((x) => x.scheduled_for === '2026-09-30' && x.status !== 'superseded');
    expect(wednesday.map((x) => x.status)).toEqual(['in_progress', 'in_progress']);
    expect(wednesday.every((x) => x.session_index === 1)).toBe(true);
    const [first, second] = wednesday.map((x) => String(x.id)).sort();
    const aside = sessionKey('2026-09-30', 6);
    for (const d of [r.a, r.b]) {
      // Same answer on both devices: the smaller id keeps the slot, the other is shown beside it.
      expect(d.state().sessionIds[WEDNESDAY]).toBe(first);
      expect(d.state().sessionIds[aside]).toBe(second);
      expect(d.state().sessionSlots).toEqual({ [aside]: WEDNESDAY });
      // Each session once, with its own sets and its own prescription.
      const loads = [WEDNESDAY, aside].map((k) => Object.values(d.state().setLogs[k]).flat()[0].loadKg).sort();
      expect(loads).toEqual([70, 75]);
      expect(Object.keys(d.state().setLogs).filter((k) => k.startsWith('2026-09-30'))).toHaveLength(2);
    }
    const kept = [WEDNESDAY, aside].map((k) => live(r.a, k)).find((p) => p.programId !== r.v2B.id)!;
    expect(content(kept)).toEqual(r.seenByA);
    expect(
      fake
        .rows('training_programs')
        .filter((p) => p.status === 'active')
        .map((p) => p.id),
    ).toEqual([r.v2B.id]);
    for (const d of [r.a, r.b]) expect(await d.sync()).toMatchObject({ pushed: 0, failed: 0 });
  });
});

describe('workout session (W-3)', () => {
  const exercises = (d: ReturnType<typeof device>, key: string) =>
    prescriptionFor({ prescriptions: d.state().prescriptions!, sessionIds: d.state().sessionIds }, key)!
      .exercises.filter((e) => e.variant === 'full')
      .map((e) => e.exerciseId);

  it('offline session: opened, 3 sets, a correction, a skipped and a replaced exercise, finished; then synced as done', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    await a.sync(true);
    fake.setOffline(true);
    a.open('2026-09-30');
    const [first, second, third] = exercises(a, WEDNESDAY);
    a.openSession(WEDNESDAY, '2026-09-30T18:00:00.000Z');
    a.logSet(WEDNESDAY, first, 10, 60);
    a.logSet(WEDNESDAY, first, 10, 60);
    a.logSet(WEDNESDAY, first, 8, 60);
    // Correction of set 2: 9 reps at 62.5 kg (store.editSet).
    const sets = a.state().setLogs[WEDNESDAY][first];
    a.set({
      setLogs: { [WEDNESDAY]: { [first]: sets.map((x, i) => (i === 1 ? { reps: 9, loadKg: 62.5 } : x)) } },
      exerciseReports: {
        [WEDNESDAY]: {
          [first]: { difficulty: 4 },
          [second]: { notPerformed: true, notPerformedReason: 'no_time' },
        },
      },
    });
    a.swap(WEDNESDAY, third, 'push_up');
    a.set({
      completedSessions: [
        { date: '2026-09-30', sessionIndex: 1, variant: 'full', completedAt: '2026-09-30T18:40:00.000Z' },
      ],
      sessionDifficulty: { [WEDNESDAY]: 3 },
    });
    const offline = await a.sync();
    expect(offline.offline).toBe(true);
    expect(fake.rows('exercise_logs')).toHaveLength(0);

    fake.setOffline(false);
    expect((await a.sync()).errors).toEqual([]);
    const id = a.state().sessionIds[WEDNESDAY];
    expect(fake.table('workout_sessions').get(id)).toMatchObject({
      status: 'completed',
      started_at: '2026-09-30T18:00:00.000Z',
      difficulty: 3,
      outcome_reason: null,
      prescription_source: 'engine',
    });
    const logs = fake.rows('exercise_logs').sort((x, y) => Number(x.set_index) - Number(y.set_index));
    expect(logs.map((l) => [l.reps, l.load_kg])).toEqual([
      [10, 60],
      [9, 62.5],
      [8, 60],
    ]);
    const planned = new Map(fake.rows('planned_exercises').map((e) => [String(e.id), e]));
    expect(logs.every((l) => planned.get(String(l.planned_exercise_id))?.exercise_id === first)).toBe(true);
    expect(
      fake
        .rows('exercise_reports')
        .map((x) => [x.exercise_id, x.not_performed, x.difficulty])
        .sort(),
    ).toEqual(
      [
        [first, false, 4],
        [second, true, null],
      ].sort(),
    );
    expect(fake.rows('exercise_substitutions')[0]).toMatchObject({
      from_exercise_id: third,
      to_exercise_id: 'push_up',
    });
    // The prescription was not touched: planned stays planned, the facts sit beside it.
    expect(
      fake
        .rows('planned_exercises')
        .filter((e) => e.session_id === id)
        .map((e) => e.exercise_id),
    ).toContain(third);

    const b = device(SCENARIOS.muscleGain);
    expect((await b.sync()).errors).toEqual([]);
    expect(b.state().setLogs[WEDNESDAY][first].map((x) => [x.reps, x.loadKg])).toEqual([
      [10, 60],
      [9, 62.5],
      [8, 60],
    ]);
    expect(b.state().exerciseReports![WEDNESDAY]).toEqual(a.state().exerciseReports![WEDNESDAY]);
    expect(b.state().sessionOpened![WEDNESDAY]).toBe('2026-09-30T18:00:00.000Z');
    for (const d of [a, b]) expect(await d.sync()).toMatchObject({ pushed: 0, failed: 0 });
  });

  it('a set deleted on one device is deleted on the other; the list stays in order', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    await a.sync(true);
    const [first] = exercises(a, MONDAY);
    a.logSet(MONDAY, first, 10, 40);
    a.logSet(MONDAY, first, 9, 40);
    a.logSet(MONDAY, first, 8, 42.5);
    await a.sync();
    const b = device(SCENARIOS.muscleGain);
    await b.sync();
    expect(b.state().setLogs[MONDAY][first]).toHaveLength(3);
    // B removes the second set (store.deleteSet): the third takes its place.
    b.set({ setLogs: { [MONDAY]: { [first]: b.state().setLogs[MONDAY][first].filter((_, i) => i !== 1) } } });
    expect((await b.sync()).errors).toEqual([]);
    expect(fake.rows('exercise_logs').filter((l) => l.deleted_at == null)).toHaveLength(2);
    await a.sync();
    expect(a.state().setLogs[MONDAY][first].map((x) => [x.reps, x.loadKg])).toEqual([
      [10, 40],
      [8, 42.5],
    ]);
    for (const d of [a, b]) expect(await d.sync()).toMatchObject({ pushed: 0, failed: 0 });
  });

  it('a replacement undone offline does not come back, here or on the other device (W-7.1)', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    await a.sync(true);
    const [first] = exercises(a, MONDAY);
    a.swap(MONDAY, first, 'dumbbell_press');
    await a.sync();
    const b = device(SCENARIOS.muscleGain);
    await b.sync();
    expect(b.state().exerciseSwaps?.[MONDAY]).toEqual({ [first]: 'dumbbell_press' });
    // A undoes the replacement (store.swapExercise back to the planned exercise), offline.
    const { [first]: _undone, ...rest } = a.state().exerciseSwaps![MONDAY];
    const { [first]: _reason, ...restReasons } = a.state().swapReasons![MONDAY];
    a.set({
      exerciseSwaps: { ...a.state().exerciseSwaps, [MONDAY]: rest },
      swapReasons: { ...a.state().swapReasons, [MONDAY]: restReasons },
    });
    // Back online: push, then pull (the server row was updated after the last pull).
    expect((await a.sync()).errors).toEqual([]);
    expect((await a.sync()).errors).toEqual([]);
    expect(a.state().exerciseSwaps?.[MONDAY]?.[first]).toBeUndefined();
    expect(fake.rows('exercise_substitutions').filter((r) => r.deleted_at == null)).toHaveLength(0);
    await b.sync();
    expect(b.state().exerciseSwaps?.[MONDAY]?.[first]).toBeUndefined();
    for (const d of [a, b]) expect(await d.sync()).toMatchObject({ pushed: 0, failed: 0 });
  });

  it('a session stopped early syncs with its reason, never as a failure', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open('2026-09-28');
    await a.sync(true);
    a.logSet(MONDAY, exercises(a, MONDAY)[0], 10, 40);
    a.set({
      completedSessions: [
        {
          date: '2026-09-28',
          sessionIndex: 0,
          variant: 'full',
          completedAt: '2026-09-28T19:00:00.000Z',
          stopped: 'pain',
        },
      ],
    });
    await a.sync();
    expect(fake.table('workout_sessions').get(a.state().sessionIds[MONDAY])).toMatchObject({
      status: 'completed',
      outcome_reason: 'pain',
    });
    const b = device(SCENARIOS.muscleGain);
    await b.sync();
    expect(b.state().completedSessions).toEqual([expect.objectContaining({ date: '2026-09-28', stopped: 'pain' })]);
  });
});

describe('progression (W-4, D-035)', () => {
  const bench = (d: ReturnType<typeof device>, key: string) =>
    prescriptionFor({ prescriptions: d.state().prescriptions!, sessionIds: d.state().sessionIds }, key)!.exercises.find(
      (e) => e.variant === 'full' && e.exerciseId === 'bench_press',
    )!;
  const top = (d: ReturnType<typeof device>, key: string) => {
    for (let i = 0; i < 3; i++) d.logSet(key, 'bench_press', 10, 70);
  };

  it('Monday confirmed on A: Wednesday re-prescribed once; B reads it and recomputes the same, no conflict', async () => {
    const a = device(SCENARIOS.muscleGain);
    top(a, sessionKey('2026-09-23', 1));
    a.open('2026-09-28');
    expect((await a.sync(true)).errors).toEqual([]);
    const b = device(SCENARIOS.muscleGain);
    await b.sync();
    const frozen = a.state().sessionIds[WEDNESDAY];

    top(a, MONDAY);
    a.set({
      completedSessions: [
        { date: '2026-09-28', sessionIndex: 0, variant: 'full', completedAt: '2026-09-28T19:00:00.000Z' },
      ],
    });
    expect(a.refresh('2026-09-28')).toBe(true);
    expect(bench(a, WEDNESDAY)).toMatchObject({
      targetLoadKg: 72.5,
      progressionAction: 'increase_load',
      targetReps: 6,
    });
    expect((await a.sync()).errors).toEqual([]);
    // The server keeps the frozen one (superseded) and the new one, with the W-4 columns.
    expect(fake.table('workout_sessions').get(frozen)).toMatchObject({ status: 'superseded' });
    expect(fake.table('planned_exercises').get(bench(a, WEDNESDAY).id)).toMatchObject({
      target_load_kg: 72.5,
      progression_action: 'increase_load',
      target_reps: 6,
      progression_confidence: 'medium',
      progression_params: { sessions: 2, max: 10, increment: 2.5 },
    });
    // Monday, done, is exactly what was prescribed.
    expect(bench(a, MONDAY)).toMatchObject({ targetLoadKg: 70 });

    expect((await b.sync()).errors).toEqual([]);
    expect(b.state().sessionIds[WEDNESDAY]).toBe(a.state().sessionIds[WEDNESDAY]);
    expect(bench(b, WEDNESDAY)).toEqual(bench(a, WEDNESDAY));
    // B derives the same recommendation from the same facts: nothing to write, nothing to push.
    expect(b.refresh('2026-09-28', '2026-09-28T21:00:00.000Z')).toBe(false);
    expect((await b.sync()).errors).toEqual([]);
  });

  it('both devices re-prescribe offline from the same facts: same id, the server copy wins, no error', async () => {
    const a = device(SCENARIOS.muscleGain);
    top(a, sessionKey('2026-09-23', 1));
    a.open('2026-09-28');
    await a.sync(true);
    const b = device(SCENARIOS.muscleGain);
    await b.sync();
    top(a, MONDAY);
    a.set({
      completedSessions: [
        { date: '2026-09-28', sessionIndex: 0, variant: 'full', completedAt: '2026-09-28T19:00:00.000Z' },
      ],
    });
    await a.sync();
    await b.sync();
    a.refresh('2026-09-28', '2026-09-28T20:00:00.000Z');
    b.refresh('2026-09-28', '2026-09-28T20:05:00.000Z');
    expect(b.state().sessionIds[WEDNESDAY]).toBe(a.state().sessionIds[WEDNESDAY]);
    expect((await a.sync()).errors).toEqual([]);
    expect((await b.sync()).errors).toEqual([]);
    expect(bench(b, WEDNESDAY)).toEqual(bench(a, WEDNESDAY));
  });
});

describe('structural decisions (W-5, D-037)', () => {
  const proposal = {
    id: 'reduce_load:reduce_volume:2026-09-28',
    kind: 'reduce_load' as const,
    change: { key: 'reduce_volume', to: -1 },
    reason: { key: 'adaptation.reason.reduce_volume' },
    evidence: { incompleteSessions: 2, sessions: 3, minSets: 2 },
    scope: { kind: 'weeks' as const, days: 14 },
  };
  const answer = (id: string, status: 'applied' | 'declined', at: string) =>
    decisionFor({ id, proposal, status, today: WEEK, decidedAt: at });
  const sets = (d: ReturnType<typeof device>, key: string) =>
    prescriptionFor({ prescriptions: d.state().prescriptions!, sessionIds: d.state().sessionIds }, key)!
      .exercises.filter((e) => e.variant === 'full')
      .map((e) => e.sets);

  it('A applies offline, B refuses offline: both answers kept, the later one wins on both, the week converges', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open(WEEK);
    expect((await a.sync(true)).errors).toEqual([]);
    const b = device(SCENARIOS.muscleGain);
    await b.sync();
    const usual = sets(a, WEDNESDAY);

    fake.setOffline(true);
    a.set({ adjustments: [answer('aaaaaaaa-0000-4000-8000-0000000000a1', 'applied', '2026-09-28T08:00:00.000Z')] });
    expect(a.refresh(WEEK)).toBe(true);
    expect(sets(a, WEDNESDAY)).toEqual(usual.map((n) => (n > STRUCTURE.minSets ? n - 1 : n)));
    b.set({ adjustments: [answer('bbbbbbbb-0000-4000-8000-0000000000b1', 'declined', '2026-09-28T08:05:00.000Z')] });
    expect(b.refresh(WEEK)).toBe(false);
    // Training goes on offline with the prescription of the device.
    await a.sync();
    fake.setOffline(false);

    expect((await a.sync()).errors).toEqual([]);
    expect((await b.sync()).errors).toEqual([]);
    expect((await a.sync()).errors).toEqual([]);
    expect(fake.rows('adjustments')).toHaveLength(2);
    for (const d of [a, b]) {
      expect(d.state().adjustments).toHaveLength(2);
      expect(effectiveDecisions(d.state().adjustments!).get(proposal.id)?.status).toBe('declined');
      expect(appliedDecisions(d.state().adjustments!)).toEqual([]);
    }
    // A follows the decision in force: Wednesday is prescribed with its usual volume again.
    expect(a.refresh(WEEK, '2026-09-28T09:00:00.000Z')).toBe(true);
    expect(sets(a, WEDNESDAY)).toEqual(usual);
    expect((await a.sync()).errors).toEqual([]);
    expect((await b.sync()).errors).toEqual([]);
    expect(b.state().sessionIds[WEDNESDAY]).toBe(a.state().sessionIds[WEDNESDAY]);
    expect(sets(b, WEDNESDAY)).toEqual(usual);
  });

  it('a decision is never rewritten: going back is a new row, the reduced session stays in the history', async () => {
    const a = device(SCENARIOS.muscleGain);
    a.open(WEEK);
    await a.sync(true);
    const applied = answer('aaaaaaaa-0000-4000-8000-0000000000a2', 'applied', '2026-09-28T08:00:00.000Z');
    a.set({ adjustments: [applied] });
    a.refresh(WEEK);
    const reduced = a.state().sessionIds[WEDNESDAY];
    expect((await a.sync()).errors).toEqual([]);
    expect(fake.table('workout_sessions').get(reduced)).toMatchObject({ adjustment_id: applied.id });

    // An in-place change is refused by the server (the journal is append-only).
    a.set({ adjustments: [{ ...applied, status: 'reverted' }] });
    expect((await a.sync()).errors).not.toEqual([]);
    const back = revertDecision(applied, {
      id: 'aaaaaaaa-0000-4000-8000-0000000000a3',
      today: WEEK,
      decidedAt: '2026-09-28T10:00:00.000Z',
    });
    a.set({ adjustments: [applied, back] });
    a.refresh(WEEK, '2026-09-28T10:00:00.000Z');
    expect((await a.sync()).errors).toEqual([]);
    expect(fake.table('adjustments').get(applied.id)).toMatchObject({ status: 'applied' });
    expect(fake.table('adjustments').get(back.id)).toMatchObject({ status: 'reverted', proposal_id: proposal.id });
    // The reduced prescription is kept (superseded), the new one has no decision.
    expect(fake.table('workout_sessions').get(reduced)).toMatchObject({
      status: 'superseded',
      adjustment_id: applied.id,
    });
    expect(fake.table('workout_sessions').get(a.state().sessionIds[WEDNESDAY])?.adjustment_id ?? null).toBeNull();
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
