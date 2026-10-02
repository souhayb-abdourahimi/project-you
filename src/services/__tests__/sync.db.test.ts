/**
 * @jest-environment node
 *
 * Integration: the sync against the real schema, migrations and RLS policies on Postgres.
 * Runs from `npm run test:db` (DATABASE_URL set); skipped otherwise.
 */
import { Client, types } from 'pg';

import { CATEGORY_TABLES, EXPORT_ONLY_TABLES } from '@/domain/privacy/data';
import { SCENARIOS, scenario } from '@/domain/scenarios';
import { publishWeek } from '@/domain/scenarios/training';
import type { UserContextSnapshot } from '@/domain/profile/schemas';
import {
  SYNC_TABLE_ORDER,
  type Row,
  type SyncableState,
  type SyncedHashes,
  type SyncTable,
} from '@/domain/sync/projection';
import { sessionKey } from '@/domain/sync/projection';
import { activeProgram, prescriptionFor, rescheduleSession } from '@/domain/training/week';

import { classifySyncError, syncOnce, type SyncClient, type SyncStore } from '../sync';

const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

// PostgREST returns `date` columns as "YYYY-MM-DD", not as timestamps.
types.setTypeParser(1082, (v: string) => v);

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';
// Workout Coach (W-2): one account used on two devices, and an intruder.
const C = '00000000-0000-4000-8000-0000000000c1';
const D = '00000000-0000-4000-8000-0000000000d1';
const E = '00000000-0000-4000-8000-0000000000e1';
const F = '00000000-0000-4000-8000-0000000000f1';

/** PostgREST-like client acting as `authenticated` with the user's JWT claims, so RLS applies. */
function restAs(db: Client, userId: string): SyncClient {
  const types = new Map<string, string>();
  const columnType = async (table: string, column: string) => {
    if (types.size === 0) {
      const { rows } = await db.query(
        `select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'`,
      );
      for (const r of rows) types.set(`${r.table_name}.${r.column_name}`, r.data_type);
    }
    return types.get(`${table}.${column}`);
  };
  const asUser = async <T>(fn: () => Promise<T>): Promise<T> => {
    await db.query('begin');
    try {
      await db.query(`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
      const out = await fn();
      await db.query('commit');
      return out;
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
  };
  const wrap = async (fn: () => Promise<unknown>) => {
    try {
      await asUser(fn);
      return { error: null };
    } catch (error) {
      return { error };
    }
  };
  return {
    select: async (table: SyncTable, since) => {
      try {
        const data = await asUser(async () => {
          const { rows } = since
            ? await db.query(`select * from public.${table} where updated_at > $1`, [since])
            : await db.query(`select * from public.${table}`);
          // Mimic PostgREST JSON: numerics as numbers, dates as ISO strings.
          return rows.map((r) =>
            Object.fromEntries(
              Object.entries(r).map(([k, v]) => [
                k,
                v instanceof Date
                  ? v.toISOString()
                  : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && k !== 'id'
                    ? Number(v)
                    : v,
              ]),
            ),
          ) as Row[];
        });
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    upsert: (table, rows, onConflict) =>
      wrap(async () => {
        for (const row of rows) {
          const cols = Object.keys(row);
          const values = await Promise.all(
            cols.map(async (c) => ((await columnType(table, c)) === 'jsonb' ? JSON.stringify(row[c]) : row[c])),
          );
          const updates = cols.filter((c) => c !== onConflict).map((c) => `${c} = excluded.${c}`);
          await db.query(
            `insert into public.${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
             on conflict (${onConflict}) do update set ${updates.join(', ')}`,
            values,
          );
        }
      }),
    softDelete: (table, keys, at) =>
      wrap(() => db.query(`update public.${table} set deleted_at = $1 where id = any($2::uuid[])`, [at, keys])),
    attachHistory: () => wrap(() => db.query('select public.attach_reconstructed_training_history()')),
  };
}

function memoryStore(initial: Partial<SyncableState> = {}) {
  let state: SyncableState & { synced: SyncedHashes; lastPulledAt: string | null } = {
    snapshot: null,
    inventory: [],
    weights: [],
    waist: [],
    expenses: [],
    mealPlan: null,
    completedSessions: [],
    setLogs: {},
    sessionIds: {},
    synced: {},
    lastPulledAt: null,
    ...initial,
  };
  const store: SyncStore & { state: () => typeof state } = {
    read: () => state,
    write: (patch) => (state = { ...state, ...patch }),
    state: () => state,
  };
  return store;
}

describeDb('sync against the real schema (Postgres + RLS)', () => {
  const db = new Client({ connectionString: url });

  beforeAll(async () => {
    await db.connect();
    await db.query(
      `insert into auth.users (id, email) values ($1, 'sync-a@example.test'), ($2, 'sync-b@example.test'),
              ($3, 'sync-c@example.test'), ($4, 'sync-d@example.test'), ($5, 'sync-e@example.test'),
              ($6, 'sync-f@example.test')
                    on conflict (id) do nothing`,
      [A, B, C, D, E, F],
    );
  });
  afterAll(async () => {
    await db.query('delete from auth.users where id = any($1::uuid[])', [[A, B, C, D, E, F]]);
    await db.end();
  });

  it('uploads every data type, restores it on a second device, and isolates users', async () => {
    const key = sessionKey('2026-09-30', 0);
    const phone = memoryStore({
      snapshot: SCENARIOS.veganFatLoss,
      inventory: [
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000001',
          foodId: 'tofu',
          name: 'Tofu',
          quantity: 400,
          unit: 'g',
          category: 'protein',
          expiresOn: '2026-10-05',
          source: 'manual',
          addedAt: '2026-09-30T08:00:00.000Z',
          updatedAt: '2026-09-30T08:00:00.000Z',
        },
      ],
      weights: [{ id: 'aaaaaaaa-0000-4000-8000-000000000002', date: '2026-09-30', weightKg: 91.4 }],
      waist: [{ id: 'aaaaaaaa-0000-4000-8000-000000000003', date: '2026-09-30', cm: 96.5 }],
      expenses: [{ id: 'aaaaaaaa-0000-4000-8000-000000000004', amountCents: 1234, spentOn: '2026-09-30' }],
      completedSessions: [
        { date: '2026-09-30', sessionIndex: 0, variant: 'short', completedAt: '2026-09-30T19:00:00.000Z' },
      ],
      setLogs: {
        [key]: {
          goblet_squat: [
            { reps: 10, loadKg: 16, rpe: 7 },
            { reps: 9, loadKg: 16.25 },
          ],
        },
      },
      sessionIds: { [key]: 'aaaaaaaa-0000-4000-8000-000000000005' },
    });
    const first = await syncOnce(restAs(db, A), phone, A, { claim: true });
    expect(first).toMatchObject({ offline: false, failed: 0, rejected: 0 });
    // 4 profile rows + inventory + weight + waist + expense + session + 2 sets.
    expect(first.pushed).toBe(11);

    const laptop = memoryStore();
    const restore = await syncOnce(restAs(db, A), laptop, A);
    expect(restore).toMatchObject({ offline: false, failed: 0, rejected: 0, pushed: 0 });
    const s = laptop.state();
    expect(s.snapshot).toEqual(SCENARIOS.veganFatLoss);
    expect(s.inventory.map((i) => [i.id, i.quantity, i.expiresOn])).toEqual([
      ['aaaaaaaa-0000-4000-8000-000000000001', 400, '2026-10-05'],
    ]);
    expect(s.weights).toEqual(phone.state().weights);
    expect(s.waist).toEqual(phone.state().waist);
    expect(s.completedSessions.map((c) => [c.date, c.variant])).toEqual([['2026-09-30', 'short']]);
    expect(s.setLogs).toEqual(phone.state().setLogs);

    // B sees nothing of A's account.
    const intruder = memoryStore();
    const r = await syncOnce(restAs(db, B), intruder, B);
    expect(r.pulled).toBe(0);
    expect(intruder.state().snapshot).toBeNull();
  });

  it('edits and deletions propagate between devices', async () => {
    const a = memoryStore();
    const b = memoryStore();
    await syncOnce(restAs(db, A), a, A);
    await syncOnce(restAs(db, A), b, A);
    a.write({ inventory: a.state().inventory.map((i) => ({ ...i, quantity: 150 })) });
    expect((await syncOnce(restAs(db, A), a, A)).pushed).toBe(1);
    await syncOnce(restAs(db, A), b, A);
    expect(b.state().inventory.map((i) => i.quantity)).toEqual([150]);

    b.write({ inventory: [] });
    expect((await syncOnce(restAs(db, A), b, A)).deleted).toBe(1);
    await syncOnce(restAs(db, A), a, A);
    expect(a.state().inventory).toEqual([]);
  });

  it('journey history (D-028) goes through the real schema and comes back on a second device', async () => {
    const done = sessionKey('2026-09-29', 0);
    const replaced = sessionKey('2026-09-27', 1);
    const phone = memoryStore({
      completedSessions: [
        { date: '2026-09-29', sessionIndex: 0, variant: 'full', completedAt: '2026-09-29T19:00:00.000Z' },
      ],
      sessionIds: {
        [done]: 'aaaaaaaa-0000-4000-8000-0000000000d1',
        [replaced]: 'aaaaaaaa-0000-4000-8000-0000000000d2',
      },
      sessionOutcomes: { [replaced]: { status: 'replaced', replacedBy: 'walk', reason: 'tired', at: '' } },
      exerciseSwaps: { [done]: { goblet_squat: 'split_squat' } },
      swapReasons: { [done]: { goblet_squat: 'dislike' } },
      dayLogs: [
        { date: '2026-09-27', fatigue: 4, energy: 2, mode: 'difficult', activity: 'walk', activityMinutes: 15 },
      ],
      mealLog: [
        {
          id: '2026-09-21-lunch-1',
          date: '2026-09-21',
          slot: 'lunch',
          recipeId: 'lentil_curry',
          servings: 1,
          status: 'skipped',
          reason: 'no_time',
          kcal: 0,
        },
      ],
      measurements: [{ id: 'aaaaaaaa-0000-4000-8000-0000000000d3', date: '2026-09-29', kind: 'chest', cm: 101 }],
      weeklyCheckins: [
        {
          weekStart: '2026-09-21',
          weekRating: 3,
          fatigue: 4,
          mainProblem: 'sleep',
          answeredAt: '2026-09-27T18:00:00.000Z',
        },
      ],
      milestones: { first_session: { reachedOn: '2026-09-29', celebratedAt: null } },
      adjustments: [
        {
          id: 'aaaaaaaa-0000-4000-8000-0000000000d4',
          kind: 'nutrition',
          changeKey: 'calories_per_day',
          from: 0,
          to: -120,
          reasonKey: 'adapt.reason.slow_loss',
          evidence: { weeks: 3, adherence: 85 },
          status: 'proposed',
          effectiveFrom: '2026-10-05',
          decidedAt: '2026-10-04T18:00:00.000Z',
        },
      ],
    });
    const up = await syncOnce(restAs(db, A), phone, A);
    expect(up).toMatchObject({ offline: false, failed: 0, rejected: 0 });

    const laptop = memoryStore();
    await syncOnce(restAs(db, A), laptop, A);
    const s = laptop.state();
    expect(s.sessionOutcomes?.[replaced]).toMatchObject({ status: 'replaced', replacedBy: 'walk', reason: 'tired' });
    expect(s.swapReasons).toMatchObject({ [done]: { goblet_squat: 'dislike' } });
    expect(s.dayLogs).toEqual(phone.state().dayLogs);
    expect(s.measurements).toEqual(phone.state().measurements);
    expect(s.weeklyCheckins).toEqual(phone.state().weeklyCheckins);
    expect(s.milestones).toEqual(phone.state().milestones);
    expect(s.adjustments).toEqual(phone.state().adjustments);
    expect(s.mealLog).toEqual([expect.objectContaining({ date: '2026-09-21', status: 'skipped', reason: 'no_time' })]);
    // The second device has nothing to push back.
    expect((await syncOnce(restAs(db, A), laptop, A)).pushed).toBe(0);
  });

  it('refuses a row that violates a constraint without losing the others', async () => {
    const store = memoryStore({
      weights: [
        { id: 'aaaaaaaa-0000-4000-8000-0000000000f1', date: '2026-10-01', weightKg: 90 },
        { id: 'aaaaaaaa-0000-4000-8000-0000000000f2', date: '2026-10-02', weightKg: 9999 },
      ],
    });
    const r = await syncOnce(restAs(db, A), store, A);
    expect(r.failed).toBe(1);
    expect(r.pushed).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------------------------
  // Workout Coach W-2 (D-032): versions, prescriptions and reconciliation on the real schema.
  // ---------------------------------------------------------------------------------------------
  const WEEK = '2026-09-28';
  const MONDAY = sessionKey('2026-09-28', 0);
  const WEDNESDAY = sessionKey('2026-09-30', 1);

  /** A device of account C: its store, plus what usePlan does when the app opens. */
  function deviceOf(user: string, snapshot: UserContextSnapshot, initial: Partial<SyncableState> = {}) {
    const store = memoryStore({ snapshot, programs: [], prescriptions: {}, superseded: {}, ...initial });
    const state = () => store.state();
    return {
      state,
      write: store.write,
      open: (today: string, at = `${today}T07:00:00.000Z`) => {
        const s = state();
        store.write(
          publishWeek(s.snapshot!, {
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
            seed: user,
            at,
          }),
        );
      },
      logSet: (key: string, exerciseId: string, reps: number, loadKg: number) => {
        const s = state();
        store.write({
          setLogs: {
            ...s.setLogs,
            [key]: { ...s.setLogs[key], [exerciseId]: [...(s.setLogs[key]?.[exerciseId] ?? []), { reps, loadKg }] },
          },
        });
      },
      sync: (claim = false) => syncOnce(restAs(db, user), store, user, { claim }),
    };
  }
  const rowsOf = async (table: string, user: string) =>
    (await db.query(`select * from public.${table} where user_id = $1`, [user])).rows as Row[];
  const firstExercise = (d: ReturnType<typeof deviceOf>, key: string) =>
    prescriptionFor({ prescriptions: d.state().prescriptions!, sessionIds: d.state().sessionIds }, key)!.exercises[0]
      .exerciseId;

  it('W-2: A publishes v1, B sees exactly v1, sessions sync both ways, offline versions resolve deterministically', async () => {
    const a = deviceOf(C, SCENARIOS.muscleGain);
    a.open('2026-09-28');
    expect((await a.sync(true)).errors).toEqual([]);
    expect(await rowsOf('training_programs', C)).toHaveLength(1);
    expect(await rowsOf('workout_sessions', C)).toHaveLength(3);
    const planned = await rowsOf('planned_exercises', C);
    expect(planned.length).toBeGreaterThan(10);
    // No proposed load without history: null, never guessed.
    expect(planned.every((r) => r.target_load_kg === null)).toBe(true);

    // B syncs and sees exactly v1 and the same frozen week; opening the app publishes nothing.
    const b = deviceOf(C, SCENARIOS.muscleGain);
    expect((await b.sync()).errors).toEqual([]);
    expect(b.state().programs!.map((p) => [p.id, p.version, p.status, p.params])).toEqual(
      a.state().programs!.map((p) => [p.id, p.version, p.status, p.params]),
    );
    expect(b.state().sessionIds).toEqual(a.state().sessionIds);
    const programsBefore = b.state().programs;
    b.open('2026-09-28');
    expect(b.state().programs).toBe(programsBefore);
    expect((await b.sync()).pushed).toBe(0);

    // A records Monday, B sees it; the sets are linked to the prescription.
    const exercise = firstExercise(a, MONDAY);
    a.logSet(MONDAY, exercise, 8, 40);
    a.write({
      completedSessions: [
        { date: '2026-09-28', sessionIndex: 0, variant: 'full', completedAt: '2026-09-28T19:00:00.000Z' },
      ],
    });
    expect((await a.sync()).errors).toEqual([]);
    const [log] = await rowsOf('exercise_logs', C);
    expect(planned.find((p) => p.id === log.planned_exercise_id)).toMatchObject({ exercise_id: exercise });
    await b.sync();
    expect(b.state().setLogs[MONDAY][exercise]).toHaveLength(1);
    expect(b.state().completedSessions.map((c) => c.date)).toEqual(['2026-09-28']);

    // Both go offline and publish their own new version (different changes).
    const v1 = a.state().programs![0];
    const mondayRow = (await rowsOf('workout_sessions', C)).find((r) => r.scheduled_for === '2026-09-28')!;
    const strip = (rows: Row[]) => rows.map(({ updated_at: _u, ...r }) => r);
    const mondayPlanned = strip((await rowsOf('planned_exercises', C)).filter((p) => p.session_id === mondayRow.id));
    a.write({ snapshot: scenario({ goal: { type: 'muscle_gain' }, training: { sessionsPerWeek: 2 } }) });
    a.open('2026-09-30');
    b.write({
      snapshot: scenario({
        goal: { type: 'muscle_gain' },
        training: { equipment: ['bodyweight', 'dumbbells', 'bench'] },
      }),
    });
    b.open('2026-09-30', '2026-09-30T08:00:00.000Z');
    const bExercise = firstExercise(b, WEDNESDAY);
    b.logSet(WEDNESDAY, bExercise, 12, 10);

    // Back online: A first, then B; a few rounds and app openings, as on real devices.
    expect((await a.sync()).errors).toEqual([]);
    expect((await b.sync()).errors).toEqual([]);
    b.open('2026-09-30', '2026-09-30T08:05:00.000Z');
    await b.sync();
    await a.sync();
    a.open('2026-09-30', '2026-09-30T08:10:00.000Z');
    await a.sync();
    await b.sync();

    const programs = await rowsOf('training_programs', C);
    expect(programs.filter((p) => p.status === 'active')).toHaveLength(1);
    // B's v2 lost for the future but B used it on Wednesday: archived, closed (D-033).
    expect(programs.map((p) => p.version).sort()).toEqual([1, 2, 2, 3]);
    expect(programs.filter((p) => p.version === 2).map((p) => p.status)).toEqual(['superseded', 'superseded']);
    // v1 was never rewritten: only closed. Monday (done) is exactly as prescribed by v1.
    expect(programs.find((p) => p.id === v1.id)).toMatchObject({ status: 'superseded', sessions_per_week: 3 });
    const monday = (await rowsOf('workout_sessions', C)).find((r) => r.id === mondayRow.id)!;
    expect(monday).toMatchObject({ program_id: v1.id, status: 'completed', focus: mondayRow.focus });
    expect(monday.prescribed_at).toEqual(mondayRow.prescribed_at);
    // Profile changed twice since: Monday's prescription, reread from the server, is still v1's.
    expect(strip((await rowsOf('planned_exercises', C)).filter((p) => p.session_id === mondayRow.id))).toEqual(
      mondayPlanned,
    );
    expect(b.state().prescriptions![String(mondayRow.id)]).toEqual(a.state().prescriptions![String(mondayRow.id)]);
    // No history lost: B's offline sets are on the server; both devices agree.
    expect((await rowsOf('exercise_logs', C)).map((r) => r.exercise_id).sort()).toEqual([exercise, bExercise].sort());
    expect(activeProgram(a.state().programs!)!.id).toBe(activeProgram(b.state().programs!)!.id);
    expect(a.state().setLogs).toEqual(b.state().setLogs);
    expect(a.state().sessionIds).toEqual(b.state().sessionIds);
  });

  it('D-033: the server decides the future, the prescription used decides the past (opened, sets, replacement)', async () => {
    const a = deviceOf(F, SCENARIOS.muscleGain);
    a.open('2026-09-28');
    expect((await a.sync(true)).errors).toEqual([]);
    const b = deviceOf(F, SCENARIOS.muscleGain);
    await b.sync();
    // Offline: A publishes v2-A (no barbell), opens Wednesday, logs a set and replaces an exercise.
    a.write({
      snapshot: scenario({
        goal: { type: 'muscle_gain' },
        training: { equipment: ['bodyweight', 'dumbbells', 'bench'] },
      }),
    });
    a.open('2026-09-30', '2026-09-30T08:00:00.000Z');
    const seen = a.state().prescriptions![a.state().sessionIds[WEDNESDAY]];
    const [first, second] = seen.exercises.filter((e) => e.variant === 'full');
    a.write({ sessionOpened: { [WEDNESDAY]: '2026-09-30T10:00:00.000Z' } });
    a.logSet(WEDNESDAY, first.exerciseId, 8, 70);
    a.write({ exerciseSwaps: { [WEDNESDAY]: { [second.exerciseId]: 'push_up' } } });
    // Offline: B publishes v2-B (45 min) and reaches the server first.
    b.write({ snapshot: scenario({ goal: { type: 'muscle_gain' }, training: { sessionMinutes: 45 } }) });
    b.open('2026-09-30', '2026-09-30T09:00:00.000Z');
    const v2B = activeProgram(b.state().programs!)!;
    expect((await b.sync()).errors).toEqual([]);
    const fridayB = (await rowsOf('workout_sessions', F)).find((r) => r.scheduled_for === '2026-10-02')!;
    // A comes back.
    expect((await a.sync()).errors).toEqual([]);
    expect((await a.sync()).errors).toEqual([]);
    expect((await b.sync()).errors).toEqual([]);

    const programs = await rowsOf('training_programs', F);
    expect(programs.filter((p) => p.status === 'active').map((p) => p.id)).toEqual([v2B.id]);
    const sessions = await rowsOf('workout_sessions', F);
    const kept = sessions.find((r) => r.id === a.state().sessionIds[WEDNESDAY])!;
    // Prescribed (not off plan), by v2-A archived, with the time A prescribed it.
    expect(kept).toMatchObject({ prescription_source: 'engine', status: 'in_progress', session_index: 1 });
    expect(new Date(String(kept.prescribed_at)).toISOString()).toBe(seen.prescribedAt);
    expect(new Date(String(kept.started_at)).toISOString()).toBe('2026-09-30T10:00:00.000Z');
    const archived = programs.find((p) => p.id === kept.program_id)!;
    expect(archived).toMatchObject({ version: 2, status: 'superseded', session_minutes: 60 });
    expect(archived.equipment).not.toContain('barbell');
    // A's exercises, its set and its replacement linked to them; B's Wednesday abandoned, unchanged.
    const planned = (await rowsOf('planned_exercises', F)).filter((e) => e.session_id === kept.id);
    expect(planned.filter((e) => e.variant === 'full').map((e) => e.exercise_id)).toEqual(
      seen.exercises.filter((e) => e.variant === 'full').map((e) => e.exerciseId),
    );
    const [log] = await rowsOf('exercise_logs', F);
    expect(planned.find((e) => e.id === log.planned_exercise_id)).toMatchObject({ exercise_id: first.exerciseId });
    const [swap] = await rowsOf('exercise_substitutions', F);
    expect(planned.find((e) => e.id === swap.planned_exercise_id)).toMatchObject({ exercise_id: second.exerciseId });
    const abandoned = sessions.filter((r) => r.program_id === v2B.id && r.scheduled_for === '2026-09-30');
    expect(abandoned.map((r) => r.status)).toEqual(['superseded']);
    // One live session per slot; the future (Friday) is still B's prescription.
    const live = sessions.filter((r) => r.status !== 'superseded').map((r) => `${r.scheduled_for}#${r.session_index}`);
    expect(new Set(live).size).toBe(live.length);
    const friday = sessions.find((r) => r.id === fridayB.id)!;
    expect(friday).toMatchObject({ program_id: v2B.id, status: 'planned', prescribed_at: fridayB.prescribed_at });
    // Both devices read the same history, and nothing is left to push.
    expect(b.state().sessionIds[WEDNESDAY]).toBe(kept.id);
    expect(b.state().prescriptions![String(kept.id)].exercises).toEqual(
      a.state().prescriptions![String(kept.id)].exercises,
    );
    expect(b.state().setLogs[WEDNESDAY]).toEqual(a.state().setLogs[WEDNESDAY]);
    for (const d of [a, b]) expect(await d.sync()).toMatchObject({ pushed: 0, failed: 0 });
  });

  it('W-2: syncs a reschedule and the felt difficulty, and keeps the original session', async () => {
    const a = deviceOf(E, SCENARIOS.muscleGain);
    a.open('2026-09-28');
    await a.sync(true);
    const original = a.state().sessionIds[WEDNESDAY];
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
    a.write({ ...moved, rescheduled: { '2026-09-30': '2026-10-01' }, sessionDifficulty: { [MONDAY]: 4 } });
    expect((await a.sync()).errors).toEqual([]);
    const sessions = await rowsOf('workout_sessions', E);
    expect(sessions).toHaveLength(4);
    expect(sessions.find((r) => r.id === original)).toMatchObject({
      status: 'rescheduled',
      rescheduled_to: '2026-10-01',
      scheduled_for: '2026-09-30',
    });
    const copy = sessions.find((r) => r.scheduled_for === '2026-10-01')!;
    expect(copy).toMatchObject({ status: 'planned', program_id: sessions.find((r) => r.id === original)!.program_id });
    expect((await rowsOf('planned_exercises', E)).filter((p) => p.session_id === copy.id).length).toBeGreaterThan(0);
    const b = deviceOf(E, SCENARIOS.muscleGain);
    await b.sync();
    expect(b.state().rescheduled).toEqual({ '2026-09-30': '2026-10-01' });
    expect(b.state().sessionIds[sessionKey('2026-10-01', 1)]).toBe(copy.id);
    expect(b.state().sessionDifficulty).toEqual({ [MONDAY]: 4 });
  });

  it('W-2: attaches history recorded before W-2 once, from device A then a partially synced device B', async () => {
    const legacyA = memoryStore({
      snapshot: SCENARIOS.beginner,
      sessionIds: { [sessionKey('2026-09-14', 0)]: 'aaaaaaaa-0000-4000-8000-0000000001a1' },
      setLogs: { [sessionKey('2026-09-14', 0)]: { squat: [{ reps: 5, loadKg: 60 }] } },
    });
    await syncOnce(restAs(db, B), legacyA, B, { claim: true });
    await syncOnce(restAs(db, B), legacyA, B);
    const reconstructed = (await rowsOf('training_programs', B)).filter((p) => p.source === 'reconstructed');
    expect(reconstructed).toHaveLength(1);
    expect(legacyA.state().sessionSources?.[sessionKey('2026-09-14', 0)]).toEqual({
      source: 'unknown',
      programId: reconstructed[0].id,
    });
    // Device B holds older history never synced: it joins the same reconstructed program.
    const legacyB = memoryStore({
      sessionIds: { [sessionKey('2026-09-07', 1)]: 'bbbbbbbb-0000-4000-8000-0000000001b1' },
      setLogs: { [sessionKey('2026-09-07', 1)]: { squat: [{ reps: 5, loadKg: 55 }] } },
    });
    await syncOnce(restAs(db, B), legacyB, B);
    await syncOnce(restAs(db, B), legacyB, B);
    expect((await rowsOf('training_programs', B)).filter((p) => p.source === 'reconstructed')).toHaveLength(1);
    const sessions = await rowsOf('workout_sessions', B);
    const legacy = sessions.filter((s) =>
      ['aaaaaaaa-0000-4000-8000-0000000001a1', 'bbbbbbbb-0000-4000-8000-0000000001b1'].includes(String(s.id)),
    );
    expect(legacy.map((s) => [s.program_id, s.prescription_source])).toEqual([
      [reconstructed[0].id, 'unknown'],
      [reconstructed[0].id, 'unknown'],
    ]);
    // Nothing invented for the history.
    expect((await rowsOf('planned_exercises', B)).filter((p) => legacy.some((s) => s.id === p.session_id))).toEqual([]);
    expect(legacyB.state().sessionSources?.[sessionKey('2026-09-07', 1)]?.source).toBe('unknown');
  });

  it('W-2: RLS — another user reads nothing, cannot attach to the program and the sync cannot bypass it', async () => {
    const intruder = memoryStore();
    const pulled = await syncOnce(restAs(db, D), intruder, D);
    expect(intruder.state().programs ?? []).toEqual([]);
    expect(pulled.pulled).toBe(0);
    // D crafts a session on C's program and a prescription on C's session: refused by RLS.
    const cProgram = (await rowsOf('training_programs', C)).find((p) => p.status === 'active')!;
    const cSession = (await rowsOf('workout_sessions', C)).find((s) => s.program_id === cProgram.id)!;
    const [cPlanned] = await rowsOf('planned_exercises', C);
    const client = restAs(db, D);
    const err = async (table: SyncTable, row: Row) =>
      (await client.upsert(table, [{ ...row, user_id: D }], 'id')).error;
    expect(
      classifySyncError(
        await err('workout_sessions', {
          id: 'dddddddd-0000-4000-8000-0000000000d1',
          scheduled_for: '2026-09-30',
          session_index: 0,
          status: 'planned',
          program_id: cProgram.id,
        }),
      ),
    ).toBe('rls');
    expect(
      classifySyncError(
        await err('planned_exercises', {
          ...cPlanned,
          id: 'dddddddd-0000-4000-8000-0000000000d2',
          session_id: cSession.id,
          created_at: undefined,
          updated_at: undefined,
        }),
      ),
    ).toBe('rls');
    // Through syncOnce too: the rows stay on D's device, reported as RLS, C's data is untouched.
    const forged = memoryStore({
      sessionIds: { [sessionKey('2026-09-30', 1)]: String(cSession.id) },
      setLogs: { [sessionKey('2026-09-30', 1)]: { squat: [{ reps: 1, loadKg: 1 }] } },
      sessionSources: { [sessionKey('2026-09-30', 1)]: { source: 'off_plan', programId: null } },
    });
    const r = await syncOnce(restAs(db, D), forged, D);
    expect(r.errors).toContainEqual({ kind: 'rls', phase: 'push', table: 'workout_sessions', count: 1 });
    expect((await rowsOf('workout_sessions', C)).find((s) => s.id === cSession.id)).toMatchObject({ user_id: C });
    expect(await rowsOf('workout_sessions', D)).toEqual([]);
  });

  it('W-2: Privacy Center — the export holds programs and prescriptions, deleting workouts erases them', async () => {
    const client = restAs(db, C);
    const exported: Record<string, Row[]> = {};
    for (const table of [...SYNC_TABLE_ORDER, ...EXPORT_ONLY_TABLES]) {
      const { data } = await client.select(table as SyncTable, null);
      exported[table] = data ?? [];
    }
    expect(exported.training_programs.length).toBeGreaterThanOrEqual(3);
    expect(exported.planned_exercises.length).toBeGreaterThan(10);
    expect(exported.workout_sessions.some((s) => s.prescription_source === 'engine')).toBe(true);
    // Category deletion, in the Privacy Center order (children first), as the user (RLS applies).
    for (const table of CATEGORY_TABLES.workouts) {
      await db.query('begin');
      await db.query(`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: C, role: 'authenticated' }),
      ]);
      await db.query(`delete from public.${table} where user_id = $1`, [C]);
      await db.query('commit');
    }
    for (const table of CATEGORY_TABLES.workouts) expect(await rowsOf(table, C)).toEqual([]);
    // Account deletion removes everything else (reconstructed history included).
    await db.query('delete from auth.users where id = $1', [B]);
    expect(await rowsOf('training_programs', B)).toEqual([]);
    expect(await rowsOf('workout_sessions', B)).toEqual([]);
    await db.query(`insert into auth.users (id, email) values ($1, 'sync-b@example.test')`, [B]);
  });
});
