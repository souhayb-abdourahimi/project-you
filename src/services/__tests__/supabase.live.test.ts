/**
 * @jest-environment node
 *
 * Live tests against the real Supabase project (auth, database, RLS, sync).
 * Run: `npm run test:live` with, in .env.local (never committed):
 *   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 *   SUPABASE_TEST_EMAIL_A, SUPABASE_TEST_PASSWORD_A, SUPABASE_TEST_EMAIL_B, SUPABASE_TEST_PASSWORD_B
 * Two confirmed test accounts are required (Dashboard → Authentication → Add user → Auto confirm).
 * Only the publishable key is used: everything goes through Auth + RLS like the app.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SCENARIOS } from '@/domain/scenarios';
import type { SyncableState, SyncedHashes, SyncTable } from '@/domain/sync/projection';

import { isClientSafeKey } from '../keys';
import { syncOnce, type SyncClient, type SyncStore } from '../sync';

const env = process.env;
const url = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const accounts = {
  a: { email: env.SUPABASE_TEST_EMAIL_A ?? '', password: env.SUPABASE_TEST_PASSWORD_A ?? '' },
  b: { email: env.SUPABASE_TEST_EMAIL_B ?? '', password: env.SUPABASE_TEST_PASSWORD_B ?? '' },
};
const ready = env.SUPABASE_LIVE === '1' && url && key && accounts.a.email && accounts.b.email;
const describeLive = ready ? describe : describe.skip;

function memoryAuthStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
  };
}

function newClient(storage = memoryAuthStorage()) {
  return createClient(url, key, { auth: { storage, persistSession: true, autoRefreshToken: false } });
}

function restClient(client: SupabaseClient): SyncClient {
  return {
    select: async (table: SyncTable, since) => {
      let q = client.from(table).select('*');
      if (since) q = q.gt('updated_at', since);
      return q;
    },
    upsert: async (table, rows, onConflict) => client.from(table).upsert(rows, { onConflict }),
    softDelete: async (table, keys, at) => client.from(table).update({ deleted_at: at }).in('id', keys),
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

const PERSONAL_TABLES: SyncTable[] = [
  'exercise_logs',
  'workout_sessions',
  'meal_plan_items',
  'inventory_items',
  'food_expenses',
  'weight_logs',
  'body_measurements',
  'goals',
  'motivations',
  'user_preferences',
  'profiles',
];

async function wipe(client: SupabaseClient, userId: string) {
  for (const t of PERSONAL_TABLES) await client.from(t).delete().eq('user_id', userId);
}

describeLive('live Supabase project', () => {
  jest.setTimeout(60_000);
  // Created in beforeAll: the describe body also runs when the suite is skipped (no URL in CI).
  let a: SupabaseClient;
  let b: SupabaseClient;
  let aId = '';
  let bId = '';

  beforeAll(async () => {
    expect(isClientSafeKey(key)).toBe(true);
    a = newClient();
    b = newClient();
    const ra = await a.auth.signInWithPassword(accounts.a);
    const rb = await b.auth.signInWithPassword(accounts.b);
    expect(ra.error).toBeNull();
    expect(rb.error).toBeNull();
    aId = ra.data.user!.id;
    bId = rb.data.user!.id;
    await wipe(a, aId);
    await wipe(b, bId);
  });

  afterAll(async () => {
    await wipe(a, aId);
    await wipe(b, bId);
    await a.auth.signOut();
    await b.auth.signOut();
  });

  it('auth: rejects a wrong password with a readable error', async () => {
    const { error } = await newClient().auth.signInWithPassword({
      email: accounts.a.email,
      password: 'wrong-password',
    });
    expect(error?.message).toBeTruthy();
  });

  it('auth: restores a persisted session and refreshes an expired one', async () => {
    const storage = memoryAuthStorage();
    const first = newClient(storage);
    await first.auth.signInWithPassword(accounts.a);
    const restored = newClient(storage);
    const { data } = await restored.auth.getSession();
    expect(data.session?.user.id).toBe(aId);

    // Simulate expiry: the stored access token is past its expiry, the client must refresh it.
    const [storageKey, raw] = [...storage.map.entries()][0];
    const stored = JSON.parse(raw);
    storage.map.set(storageKey, JSON.stringify({ ...stored, expires_at: Math.floor(Date.now() / 1000) - 60 }));
    const expired = newClient(storage);
    const after = await expired.auth.getSession();
    expect(after.data.session?.user.id).toBe(aId);
    expect(after.data.session?.access_token).not.toBe(stored.access_token);
    await expired.auth.signOut({ scope: 'local' });
  });

  it('anonymous visitors cannot read personal tables', async () => {
    const anon = newClient();
    for (const t of PERSONAL_TABLES) {
      const { data, error } = await anon.from(t).select('*').limit(1);
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
  });

  it('sync: creates the profile and data, restores them on a second device', async () => {
    const phone = memoryStore({
      snapshot: SCENARIOS.vegan,
      weights: [{ id: crypto.randomUUID(), date: '2026-09-30', weightKg: 75 }],
      inventory: [
        {
          id: crypto.randomUUID(),
          foodId: 'tofu',
          name: 'Tofu',
          quantity: 400,
          unit: 'g',
          category: 'protein',
          expiresOn: null,
          source: 'manual',
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    const push = await syncOnce(restClient(a), phone, aId, { claim: true });
    expect(push).toMatchObject({ offline: false, failed: 0, rejected: 0 });

    const laptop = memoryStore();
    const pull = await syncOnce(restClient(a), laptop, aId);
    expect(pull).toMatchObject({ offline: false, failed: 0, rejected: 0, pushed: 0 });
    expect(laptop.state().snapshot).toEqual(SCENARIOS.vegan);
    expect(laptop.state().weights).toEqual(phone.state().weights);
    expect(laptop.state().inventory.map((i) => i.quantity)).toEqual([400]);
  });

  it('RLS: B cannot read, modify or delete A data, nor write rows for A', async () => {
    const { data: aWeights } = await a.from('weight_logs').select('id');
    const target = aWeights?.[0]?.id as string;
    expect(target).toBeTruthy();

    const read = await b.from('weight_logs').select('*').eq('id', target);
    expect(read.data).toEqual([]);
    const update = await b.from('weight_logs').update({ weight_kg: 1 }).eq('id', target).select();
    expect(update.data ?? []).toEqual([]);
    const del = await b.from('weight_logs').delete().eq('id', target).select();
    expect(del.data ?? []).toEqual([]);
    const insert = await b.from('weight_logs').insert({ user_id: aId, measured_on: '2026-09-30', weight_kg: 60 });
    expect(insert.error).not.toBeNull();

    const still = await a.from('weight_logs').select('weight_kg').eq('id', target).single();
    expect(Number(still.data?.weight_kg)).toBe(75);
  });

  it('sign-out ends access to private data', async () => {
    const storage = memoryAuthStorage();
    const c = newClient(storage);
    await c.auth.signInWithPassword(accounts.a);
    expect((await c.from('profiles').select('user_id')).data?.length).toBe(1);
    await c.auth.signOut({ scope: 'local' });
    const { data, error } = await c.from('profiles').select('user_id');
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
