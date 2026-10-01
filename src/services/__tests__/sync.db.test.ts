/**
 * @jest-environment node
 *
 * Integration: the sync against the real schema, migrations and RLS policies on Postgres.
 * Runs from `npm run test:db` (DATABASE_URL set); skipped otherwise.
 */
import { Client, types } from 'pg';

import { SCENARIOS } from '@/domain/scenarios';
import type { Row, SyncableState, SyncedHashes, SyncTable } from '@/domain/sync/projection';
import { sessionKey } from '@/domain/sync/projection';

import { syncOnce, type SyncClient, type SyncStore } from '../sync';

const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

// PostgREST returns `date` columns as "YYYY-MM-DD", not as timestamps.
types.setTypeParser(1082, (v: string) => v);

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';

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
      `insert into auth.users (id, email) values ($1, 'sync-a@example.test'), ($2, 'sync-b@example.test')
                    on conflict (id) do nothing`,
      [A, B],
    );
  });
  afterAll(async () => {
    await db.query('delete from auth.users where id = any($1::uuid[])', [[A, B]]);
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
});
