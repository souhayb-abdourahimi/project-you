import { SCENARIOS } from '@/domain/scenarios';
import { SYNC_TABLES, type Row, type SyncableState, type SyncedHashes, type SyncTable } from '@/domain/sync/projection';

import { syncOnce, type SyncClient, type SyncStore } from '../sync';

const A = '11111111-1111-4111-8111-111111111111';

/** In-memory Supabase stand-in: one table map per user, `updated_at` owned by the "server". */
function fakeServer() {
  const tables = new Map<SyncTable, Map<string, Row>>();
  let clock = 0;
  const tick = () => new Date(Date.UTC(2026, 8, 30, 12, 0, clock++)).toISOString();
  const table = (t: SyncTable) => tables.get(t) ?? tables.set(t, new Map()).get(t)!;
  let failNext: SyncTable | null = null;
  const client: SyncClient = {
    select: async (t, since) => ({
      data: [...table(t).values()].filter((r) => !since || String(r.updated_at) > since),
      error: null,
    }),
    upsert: async (t, rows, onConflict) => {
      if (failNext === t) {
        failNext = null;
        return { error: new Error('refused') };
      }
      for (const r of rows) {
        const key = String(r[onConflict]);
        table(t).set(key, { ...table(t).get(key), ...r, updated_at: tick() });
      }
      return { error: null };
    },
    softDelete: async (t, keys, at) => {
      for (const k of keys) {
        const r = table(t).get(k);
        if (r) table(t).set(k, { ...r, deleted_at: at, updated_at: tick() });
      }
      return { error: null };
    },
  };
  return { client, table, failOnce: (t: SyncTable) => (failNext = t) };
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
  return {
    read: () => state,
    write: (patch: Parameters<SyncStore['write']>[0]) => (state = { ...state, ...patch }),
    state: () => state,
  };
}

describe('syncOnce', () => {
  it('uploads a new account, then a second device restores it', async () => {
    const server = fakeServer();
    const phone = memoryStore({
      snapshot: SCENARIOS.vegan,
      weights: [{ id: 'aaaaaaaa-0000-4000-8000-000000000002', date: '2026-09-30', weightKg: 75 }],
    });
    const first = await syncOnce(server.client, phone, A, { claim: true });
    expect(first.offline).toBe(false);
    expect(first.pushed).toBe(5);
    expect(server.table('profiles').get(A)).toMatchObject({ display_name: 'Alex (MOCK)', user_id: A });

    const laptop = memoryStore();
    await syncOnce(server.client, laptop, A);
    expect(laptop.state().snapshot).toEqual(SCENARIOS.vegan);
    expect(laptop.state().weights).toEqual(phone.state().weights);

    // Nothing is pushed back after a restore.
    const again = await syncOnce(server.client, laptop, A);
    expect(again.pushed).toBe(0);
  });

  it('propagates an edit and a deletion to the other device', async () => {
    const server = fakeServer();
    const item = {
      id: 'aaaaaaaa-0000-4000-8000-000000000009',
      foodId: 'rice',
      name: 'Riz',
      quantity: 500,
      unit: 'g' as const,
      category: 'grain',
      expiresOn: null,
      source: 'manual' as const,
      addedAt: '2026-09-30T08:00:00.000Z',
      updatedAt: '2026-09-30T08:00:00.000Z',
    };
    const a = memoryStore({ inventory: [item] });
    const b = memoryStore();
    await syncOnce(server.client, a, A);
    await syncOnce(server.client, b, A);
    expect(b.state().inventory.map((i) => i.quantity)).toEqual([500]);

    a.write({ inventory: [{ ...item, quantity: 200 }] });
    await syncOnce(server.client, a, A);
    await syncOnce(server.client, b, A);
    expect(b.state().inventory.map((i) => i.quantity)).toEqual([200]);

    b.write({ inventory: [] });
    const r = await syncOnce(server.client, b, A);
    expect(r.deleted).toBe(1);
    expect(server.table('inventory_items').get(item.id)?.deleted_at).toBeTruthy();
    await syncOnce(server.client, a, A);
    expect(a.state().inventory).toEqual([]);
  });

  it('keeps refused rows unsynced and retries them next round', async () => {
    const server = fakeServer();
    const store = memoryStore({ weights: [{ id: 'w1', date: '2026-09-30', weightKg: 75 }] });
    server.failOnce('weight_logs');
    // Batch refused, then the per-row retry succeeds in the same round.
    const r = await syncOnce(server.client, store, A);
    expect(r.pushed).toBe(1);
    expect(r.failed).toBe(0);
  });

  it('reports offline without touching local data', async () => {
    const store = memoryStore({ snapshot: SCENARIOS.vegan });
    const client: SyncClient = {
      select: async () => ({ data: null, error: new Error('offline') }),
      upsert: async () => ({ error: new Error('offline') }),
      softDelete: async () => ({ error: new Error('offline') }),
    };
    const r = await syncOnce(client, store, A);
    expect(r.offline).toBe(true);
    expect(store.state().snapshot).toEqual(SCENARIOS.vegan);
    expect(store.state().synced).toEqual({});
  });

  it('uses the table primary key for conflicts', () => {
    expect(SYNC_TABLES.profiles.key).toBe('user_id');
    expect(SYNC_TABLES.inventory_items.key).toBe('id');
  });
});
