import { SCENARIOS } from '../../scenarios';
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
    sessionIds: { [key]: 'aaaaaaaa-0000-4000-8000-000000000005' },
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
    expect(p.exercise_logs.size).toBe(2);
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
});
