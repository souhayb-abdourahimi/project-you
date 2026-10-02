import { SCENARIOS } from '../../scenarios';
import { publishWeek } from '../../scenarios/training';
import {
  applyRemote,
  diff,
  hashRow,
  project,
  rowRef,
  sessionKey,
  stableUuid,
  SYNC_TABLE_ORDER,
  type Row,
  type SyncableState,
  type SyncedHashes,
  type SyncTable,
} from '../projection';

const USER = '11111111-1111-4111-8111-111111111111';

function emptyState(): SyncableState {
  return {
    snapshot: null,
    inventory: [],
    weights: [],
    waist: [],
    expenses: [],
    mealPlan: null,
    completedSessions: [],
    setLogs: {},
    sessionIds: {},
  };
}

function fullState(): SyncableState {
  const base = legacyState();
  // The week published by the Workout Coach (W-2): a version, frozen sessions, one set done on a
  // prescribed session.
  const week = publishWeek(SCENARIOS.veganFatLoss, {
    records: { programs: [], prescriptions: {}, superseded: {}, sessionIds: base.sessionIds },
    facts: base,
    today: '2026-09-30',
    weekStart: '2026-09-28',
    seed: USER,
    at: '2026-09-28T07:00:00.000Z',
  });
  const prescribed = sessionKey('2026-09-28', 0);
  const first = week.prescriptions[week.sessionIds[prescribed]].exercises[0];
  return {
    ...base,
    ...week,
    setLogs: { ...base.setLogs, [prescribed]: { [first.exerciseId]: [{ reps: 8, loadKg: 20 }] } },
    sessionDifficulty: { [prescribed]: 3 },
  };
}

function legacyState(): SyncableState {
  const key = sessionKey('2026-09-30', 0);
  return {
    ...emptyState(),
    snapshot: SCENARIOS.veganFatLoss,
    inventory: [
      {
        id: 'aaaaaaaa-0000-4000-8000-000000000001',
        foodId: 'rice',
        name: 'Riz',
        quantity: 500,
        unit: 'g',
        category: 'grain',
        expiresOn: null,
        source: 'manual',
        addedAt: '2026-09-30T08:00:00.000Z',
        updatedAt: '2026-09-30T08:00:00.000Z',
      },
    ],
    weights: [{ id: 'aaaaaaaa-0000-4000-8000-000000000002', date: '2026-09-30', weightKg: 91.4 }],
    waist: [{ id: 'aaaaaaaa-0000-4000-8000-000000000003', date: '2026-09-30', cm: 96 }],
    expenses: [{ id: 'aaaaaaaa-0000-4000-8000-000000000004', amountCents: 1234, spentOn: '2026-09-30' }],
    completedSessions: [
      { date: '2026-09-30', sessionIndex: 0, variant: 'short', completedAt: '2026-09-30T19:00:00.000Z' },
    ],
    setLogs: {
      [key]: {
        goblet_squat: [
          { reps: 10, loadKg: 16, rpe: 7 },
          { reps: 9, loadKg: 16 },
        ],
      },
    },
    sessionIds: {
      [key]: 'aaaaaaaa-0000-4000-8000-000000000005',
      [SKIPPED]: 'aaaaaaaa-0000-4000-8000-000000000006',
    },
    ...journeyHistory(),
  };
}

const SKIPPED = sessionKey('2026-09-28', 1);

/** Journey history (D-028): outcomes, swaps with reasons, day rows, meal journal, check-ins… */
function journeyHistory(): Partial<SyncableState> {
  return {
    sessionOutcomes: { [SKIPPED]: { status: 'replaced', replacedBy: 'walk', reason: 'tired', at: '' } },
    exerciseSwaps: { [sessionKey('2026-09-30', 0)]: { goblet_squat: 'split_squat' } },
    swapReasons: { [sessionKey('2026-09-30', 0)]: { goblet_squat: 'dislike' } },
    dayLogs: [{ date: '2026-09-29', energy: 2, fatigue: 4, mode: 'difficult', activity: 'walk', activityMinutes: 15 }],
    mealLog: [
      {
        id: '2026-09-22-lunch-1',
        date: '2026-09-22',
        slot: 'lunch',
        recipeId: 'lentil_curry',
        servings: 1,
        status: 'replaced',
        reason: 'restaurant',
        kcal: 0,
      },
    ],
    measurements: [{ id: 'aaaaaaaa-0000-4000-8000-000000000007', date: '2026-09-30', kind: 'arm', cm: 33 }],
    weeklyCheckins: [
      {
        weekStart: '2026-09-21',
        weekRating: 4,
        energy: 3,
        mainProblem: 'time',
        answeredAt: '2026-09-27T18:00:00.000Z',
      },
    ],
    milestones: { first_session: { reachedOn: '2026-09-23', celebratedAt: '2026-09-24T08:00:00.000Z' } },
    adjustments: [
      {
        id: 'aaaaaaaa-0000-4000-8000-000000000008',
        kind: 'training',
        changeKey: 'sessions_per_week',
        from: 3,
        to: 2,
        reasonKey: 'adapt.reason.missed_two_weeks',
        evidence: { adherence: 50 },
        status: 'applied',
        effectiveFrom: '2026-09-28',
        decidedAt: '2026-09-27T18:05:00.000Z',
      },
    ],
  };
}

/** What the server would return: projected rows plus server-owned columns. */
function asServer(state: SyncableState): Partial<Record<SyncTable, Row[]>> {
  const projected = project(state, USER);
  return Object.fromEntries(
    SYNC_TABLE_ORDER.map((t) => [
      t,
      [...projected[t].values()].map((r) => ({
        ...r,
        created_at: '2026-09-30T08:00:00.000Z',
        updated_at: '2026-09-30T20:00:00.000Z',
      })),
    ]),
  );
}

function syncedFor(state: SyncableState): SyncedHashes {
  const projected = project(state, USER);
  const out: SyncedHashes = {};
  for (const t of SYNC_TABLE_ORDER) for (const [k, r] of projected[t]) out[rowRef(t, k)] = hashRow(r);
  return out;
}

describe('stableUuid', () => {
  it('is deterministic, UUID-shaped and spreads inputs', () => {
    expect(stableUuid('a')).toBe(stableUuid('a'));
    expect(stableUuid('a')).not.toBe(stableUuid('b'));
    expect(stableUuid('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('project', () => {
  it('maps every synced data type and never sends updated_at', () => {
    const p = project(fullState(), USER);
    for (const t of SYNC_TABLE_ORDER.filter((t) => t !== 'meal_plan_items')) expect(p[t].size).toBeGreaterThan(0);
    for (const t of SYNC_TABLE_ORDER)
      for (const r of p[t].values()) {
        expect(r).not.toHaveProperty('updated_at');
        expect(r.user_id).toBe(USER);
      }
    expect(p.exercise_logs.size).toBe(3);
    // Workout Coach (W-2): the version, its frozen sessions and their planned exercises.
    expect(p.training_programs.size).toBe(1);
    expect(p.workout_sessions.size).toBe(5);
    expect(p.planned_exercises.size).toBe(15);
    const logs = [...p.exercise_logs.values()];
    const linked = logs.filter((r) => r.planned_exercise_id !== null);
    expect(linked).toHaveLength(1);
    expect(p.planned_exercises.get(String(linked[0].planned_exercise_id))?.exercise_id).toBe(linked[0].exercise_id);
    const prescribed = [...p.workout_sessions.values()].filter((r) => r.prescription_source === 'engine');
    expect(prescribed.map((r) => r.status).sort()).toEqual(['in_progress', 'planned', 'planned']);
    // Recorded before W-2: no prescription, no source until the server attaches it (never invented).
    const legacy = [...p.workout_sessions.values()].filter((r) => r.prescription_source === null);
    expect(legacy).toHaveLength(2);
    for (const r of legacy)
      expect([r.program_id, r.focus, r.planned_minutes, r.prescribed_at]).toEqual([null, null, null, null]);
  });

  it('does not depend on the user for random ids but scopes derived ids to the user', () => {
    const a = project(fullState(), USER).goals;
    const b = project(fullState(), '22222222-2222-4222-8222-222222222222').goals;
    expect([...a.keys()]).not.toEqual([...b.keys()]);
  });
});

describe('diff', () => {
  it('pushes everything on first sync, nothing when unchanged', () => {
    const state = fullState();
    expect(diff(project(state, USER), {}).upserts.length).toBeGreaterThan(8);
    expect(diff(project(state, USER), syncedFor(state))).toEqual({ upserts: [], deletes: [] });
  });

  it('pushes a changed row and soft-deletes a removed one, never history', () => {
    const state = fullState();
    const synced = syncedFor(state);
    const next = {
      ...state,
      inventory: [],
      weights: [{ ...state.weights[0], weightKg: 91 }],
      completedSessions: [],
      sessionIds: {},
      setLogs: {},
    };
    const plan = diff(project(next, USER), synced);
    expect(plan.upserts.map((u) => u.table)).toEqual(['weight_logs']);
    expect(plan.deletes).toEqual([{ table: 'inventory_items', key: state.inventory[0].id }]);
  });
});

describe('applyRemote', () => {
  it('restores a whole account on a new device (profile, data, workouts)', () => {
    const source = fullState();
    const { state, synced, rejected } = applyRemote(emptyState(), asServer(source), USER, {});
    expect(rejected).toBe(0);
    expect(state.snapshot).toEqual(source.snapshot);
    expect(state.inventory.map((i) => i.id)).toEqual(source.inventory.map((i) => i.id));
    expect(state.weights).toEqual(source.weights);
    expect(state.waist).toEqual(source.waist);
    expect(state.expenses).toEqual([{ ...source.expenses[0], note: undefined }]);
    expect(state.completedSessions).toEqual(source.completedSessions);
    expect(state.setLogs).toEqual(source.setLogs);
    // Nothing to push back right after a pull.
    expect(diff(project(state, USER), synced)).toEqual({ upserts: [], deletes: [] });
  });

  it('restores the journey history on a second device (outcomes, swaps, days, meals, check-ins, milestones)', () => {
    const source = fullState();
    const { state, synced, rejected } = applyRemote(emptyState(), asServer(source), USER, {});
    expect(rejected).toBe(0);
    expect(state.sessionOutcomes).toEqual({
      [SKIPPED]: { ...source.sessionOutcomes![SKIPPED], at: '2026-09-30T20:00:00.000Z' },
    });
    expect(state.exerciseSwaps).toEqual(source.exerciseSwaps);
    expect(state.swapReasons).toEqual(source.swapReasons);
    expect(state.dayLogs).toEqual(source.dayLogs);
    expect(state.measurements).toEqual(source.measurements);
    expect(state.weeklyCheckins).toEqual(source.weeklyCheckins);
    expect(state.milestones).toEqual(source.milestones);
    expect(state.adjustments).toEqual(source.adjustments);
    expect(state.mealLog).toEqual([
      expect.objectContaining({ date: '2026-09-22', slot: 'lunch', status: 'replaced', reason: 'restaurant' }),
    ]);
    // Nothing to push back right after a pull, and nothing duplicated.
    expect(diff(project(state, USER), synced)).toEqual({ upserts: [], deletes: [] });
  });

  it('keeps local changes that are not pushed yet', () => {
    const source = fullState();
    const synced = syncedFor(source);
    const local = { ...source, weights: [{ ...source.weights[0], weightKg: 90 }] };
    const server = asServer({ ...source, weights: [{ ...source.weights[0], weightKg: 95 }] });
    const { state } = applyRemote(local, server, USER, synced);
    expect(state.weights[0].weightKg).toBe(90);
  });

  it('applies server changes and deletions when nothing is pending', () => {
    const source = fullState();
    const synced = syncedFor(source);
    const server = asServer({ ...source, weights: [{ ...source.weights[0], weightKg: 95 }] });
    server.inventory_items = server.inventory_items!.map((r) => ({ ...r, deleted_at: '2026-09-30T21:00:00.000Z' }));
    const { state } = applyRemote(source, server, USER, synced);
    expect(state.weights[0].weightKg).toBe(95);
    expect(state.inventory).toEqual([]);
  });

  it('does not resurrect a row deleted locally', () => {
    const source = fullState();
    const synced = syncedFor(source);
    const { state } = applyRemote({ ...source, inventory: [] }, asServer(source), USER, synced);
    expect(state.inventory).toEqual([]);
  });

  it('lets the account win when a device attaches local data to it', () => {
    const local = { ...fullState(), weights: [{ id: 'local-w', date: '2026-10-01', weightKg: 70 }] };
    const server = asServer({ ...fullState(), snapshot: SCENARIOS.muscleGain });
    const { state, synced } = applyRemote(local, server, USER, {}, { serverWins: true });
    expect(state.snapshot?.goal.type).toBe('muscle_gain');
    // The local-only weigh-in is kept and will be uploaded.
    expect(diff(project(state, USER), synced).upserts.map((u) => u.key)).toContain('local-w');
  });

  it('rejects an invalid remote profile instead of trusting it', () => {
    const server = asServer(fullState());
    server.profiles = [{ ...server.profiles![0], height_cm: 20 }];
    const { state, rejected } = applyRemote(emptyState(), server, USER, {});
    expect(state.snapshot).toBeNull();
    expect(rejected).toBe(1);
  });

  it('rejects invalid remote rows instead of storing NaN or unknown values', () => {
    const server = asServer(fullState());
    const weight = server.weight_logs![0];
    const item = server.inventory_items![0];
    server.weight_logs = [{ ...weight, weight_kg: null }];
    server.inventory_items = [{ ...item, unit: 'bucket' }];
    const { state, rejected } = applyRemote(emptyState(), server, USER, {});
    expect(rejected).toBe(2);
    expect(state.weights).toEqual([]);
    expect(state.inventory).toEqual([]);
  });

  it('accepts numbers sent as strings (Postgres numeric) and deletions with partial data', () => {
    const source = fullState();
    const server = asServer(source);
    server.weight_logs = server.weight_logs!.map((w) => ({ ...w, weight_kg: String(w.weight_kg) }));
    const { state, rejected } = applyRemote(emptyState(), server, USER, {});
    expect(rejected).toBe(0);
    expect(state.weights).toEqual(source.weights);

    const deleted = asServer(source);
    deleted.inventory_items = [{ id: deleted.inventory_items![0].id, deleted_at: '2026-09-30T10:00:00Z' }];
    const after = applyRemote(source, deleted, USER, syncedFor(source));
    expect(after.rejected).toBe(0);
    expect(after.state.inventory.map((i) => i.id)).not.toContain(source.inventory[0].id);
  });
});
