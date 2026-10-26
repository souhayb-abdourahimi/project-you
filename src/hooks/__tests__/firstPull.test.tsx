/**
 * Reinstalled PWA + sign-in (bug of 2026-10-26): the real sync hook and the real routing rule,
 * against an in-memory account server. The status "first pull done" left over from the signed-out
 * state used to send an existing account to onboarding before its profile was pulled.
 */
import { act, renderHook } from '@testing-library/react-native';

import { SCENARIOS } from '@/domain/scenarios';
import { project, SYNC_TABLES, type Row, type SyncTable } from '@/domain/sync/projection';
import { useDataStore } from '@/state/data';
import { useProfileStore } from '@/state/profile';
import { useSyncStatus } from '@/state/sync';

import { useProfileGate } from '../useProfileGate';
import { useSync } from '../useSync';

const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const B = 'bbbbbbbb-0000-4000-8000-00000000000b';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The account server: rows per user, and a gate holding every read until the test releases it.
const mockServer: { rows: Record<string, Partial<Record<SyncTable, Row[]>>>; user: string | null; hold: Promise<void> } = {
  rows: {},
  user: null,
  hold: Promise.resolve(),
};
let mockSession: { user: { id: string } } | null = null;

jest.mock('@/services/auth', () => ({ useSession: () => ({ session: mockSession, loading: false }) }));
jest.mock('@/services/supabase', () => {
  const ok = { error: null };
  const query = (table: string) => {
    const q = {
      gt: () => q,
      order: () => q,
      range: async () => {
        await mockServer.hold;
        return { data: (mockServer.user && mockServer.rows[mockServer.user]?.[table as SyncTable]) ?? [], error: null };
      },
    };
    return q;
  };
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: (table: string) => ({
        select: () => query(table),
        upsert: async () => ok,
        update: () => ({ in: async () => ok }),
      }),
      rpc: async () => ok,
    },
  };
});

/** What the server holds for an account that finished onboarding on another device. */
function accountWithProfile(userId: string) {
  const projected = project({ ...useDataStore.getState(), snapshot: SCENARIOS.vegan }, userId);
  const at = '2026-10-20T10:00:00.000Z';
  return Object.fromEntries(
    (Object.keys(SYNC_TABLES) as SyncTable[]).map((t) => [t, [...projected[t].values()].map((r) => ({ ...r, updated_at: at }))]),
  ) as Partial<Record<SyncTable, Row[]>>;
}

function holdServer() {
  let release!: () => void;
  mockServer.hold = new Promise<void>((resolve) => (release = resolve));
  return () => release();
}

/** Every frame rendered, as the user would see it. */
let frames: { gate: string | null; snapshot: unknown }[] = [];

/** The root layout runs the sync; the tabs layout routes. Both, as in the app. */
function useApp() {
  useSync();
  const frame = { gate: useProfileGate(), snapshot: useProfileStore((s) => s.snapshot) };
  frames.push(frame);
  return frame;
}

const flush = () => act(async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
});

beforeEach(async () => {
  frames = [];
  mockSession = null;
  mockServer.rows = {};
  mockServer.user = null;
  mockServer.hold = Promise.resolve();
  useDataStore.getState().reset();
  useProfileStore.getState().reset();
  useSyncStatus.setState({ phase: 'idle', firstPull: null });
  await useDataStore.persist.rehydrate();
  await useProfileStore.persist.rehydrate();
});

describe('first pull after sign-in', () => {
  it('fresh PWA + existing account: loading while the profile is pulled, then Today with that profile', async () => {
    mockServer.rows[A] = accountWithProfile(A);
    const { result, rerender, unmount } = await renderHook(useApp);
    await flush();
    expect(result.current.gate).toBe('sign-in');

    const release = holdServer();
    mockSession = { user: { id: A } };
    mockServer.user = A;
    frames = [];
    await rerender({});
    await flush();
    // Never onboarding while the account's own pull has not ended.
    expect(new Set(frames.map((f) => f.gate))).toEqual(new Set(['wait']));

    release();
    await flush();
    expect(frames.map((f) => f.gate)).not.toContain('onboarding');
    expect(result.current.gate).toBe('app');
    expect(result.current.snapshot).toEqual(SCENARIOS.vegan);
    expect(useDataStore.getState().ownerId).toBe(A);
    unmount();
  });

  it('fresh PWA + new account: loading, then onboarding once the server answered "no profile"', async () => {
    const { result, rerender, unmount } = await renderHook(useApp);
    await flush();
    const release = holdServer();
    mockSession = { user: { id: B } };
    mockServer.user = B;
    frames = [];
    await rerender({});
    await flush();
    expect(new Set(frames.map((f) => f.gate))).toEqual(new Set(['wait']));
    release();
    await flush();
    expect(result.current.gate).toBe('onboarding');
    unmount();
  });

  it("account A then account B: A's profile is never shown for B", async () => {
    mockServer.rows[A] = accountWithProfile(A);
    mockSession = { user: { id: A } };
    mockServer.user = A;
    const { result, rerender, unmount } = await renderHook(useApp);
    await flush();
    expect(result.current.gate).toBe('app');
    expect(result.current.snapshot).toEqual(SCENARIOS.vegan);

    // B signs in on the same device (B has no profile).
    const release = holdServer();
    mockSession = { user: { id: B } };
    mockServer.user = B;
    frames = [];
    await rerender({});
    await flush();
    release();
    await flush();
    // Not one frame of the app with a profile while B is signed in.
    expect(frames.filter((f) => f.gate === 'app')).toEqual([]);
    expect(result.current.gate).toBe('onboarding');
    expect(result.current.snapshot).toBeNull();
    expect(useDataStore.getState().ownerId).toBe(B);
    unmount();
  });

  it('a "first pull done" left from the signed-out state or an earlier session never sends to onboarding', async () => {
    mockServer.rows[A] = accountWithProfile(A);
    // What the old status kept: done, from before the sign-in.
    useSyncStatus.setState({ firstPull: { userId: A, outcome: 'reached' } });
    const release = holdServer();
    mockSession = { user: { id: A } };
    mockServer.user = A;
    const { result, unmount } = await renderHook(useApp);
    await flush();
    expect(frames.map((f) => f.gate)).not.toContain('onboarding');
    expect(result.current.gate).toBe('wait');
    release();
    await flush();
    expect(result.current.gate).toBe('app');
    unmount();
  });

  it('offline on the first pull: never onboarding; the profile appears once the account is read', async () => {
    mockServer.rows[A] = accountWithProfile(A);
    mockServer.hold = Promise.reject(new Error('offline'));
    mockServer.hold.catch(() => undefined);
    mockSession = { user: { id: A } };
    mockServer.user = A;
    const { result, unmount } = await renderHook(useApp);
    await flush();
    expect(result.current.gate).toBe('unreachable');
    mockServer.hold = Promise.resolve();
    const { syncNow } = jest.requireActual<typeof import('../useSync')>('../useSync');
    await act(() => syncNow());
    expect(result.current.gate).toBe('app');
    unmount();
  });
});
