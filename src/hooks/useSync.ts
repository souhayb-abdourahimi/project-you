import { useEffect } from 'react';
import { AppState } from 'react-native';

import { diff, project, SYNC_TABLES, type SyncTable } from '@/domain/sync/projection';
import { useSession } from '@/services/auth';
import { fetchAllPages } from '@/services/paging';
import { supabase } from '@/services/supabase';
import { syncOnce, type SyncClient, type SyncStore } from '@/services/sync';
import { useDataStore } from '@/state/data';
import { useNotificationStore } from '@/state/notifications';
import { useProfileStore } from '@/state/profile';
import { useSyncStatus } from '@/state/sync';

import { resetDeviceData } from './deviceData';

const INTERVAL_MS = 30_000;

/**
 * Store bound to one account: once the effect is cleaned up (sign-out, account switch) or the
 * device data belongs to someone else, a round still in flight can no longer write anything.
 */
function storeFor(userId: string, isActive: () => boolean): SyncStore {
  return {
    read: () => syncedState(),
    write: (patch) => {
      if (!isActive() || useDataStore.getState().ownerId !== userId) return;
      applySyncedPatch(patch);
    },
  };
}

/** Everything the sync reads: the data, the profile, and the reminder preferences once they are the user's. */
export function syncedState() {
  const notifications = useNotificationStore.getState();
  return {
    ...useDataStore.getState(),
    snapshot: useProfileStore.getState().snapshot,
    notificationPrefs: notifications.prefsSaved ? notifications.prefs : null,
  };
}

/** Writes a merged patch back to the three stores (profile, reminder preferences, data). */
export function applySyncedPatch(patch: Parameters<SyncStore['write']>[0]) {
  if ('snapshot' in patch && patch.snapshot !== useProfileStore.getState().snapshot) {
    useProfileStore.getState().setSnapshot(patch.snapshot ?? null);
  }
  const { notificationPrefs, ...data } = patch;
  if (notificationPrefs && notificationPrefs !== useNotificationStore.getState().prefs) {
    useNotificationStore.getState().adoptPrefs(notificationPrefs);
  }
  useDataStore.getState().applySync(data);
}

/**
 * Local changes the account does not hold yet (rows to send or delete). 0 in local mode: there is
 * nothing to send. Used to warn before a sign-out that would lose them.
 */
export function pendingChanges(): number {
  const state = syncedState();
  if (!state.ownerId) return 0;
  const plan = diff(project(state, state.ownerId), state.synced);
  return plan.upserts.length + plan.deletes.length;
}

/** Starts a round now (a "Réessayer" button); resolves when it ends. No-op when signed out. */
let runNow: (() => Promise<void>) | null = null;
export function syncNow(): Promise<void> {
  return runNow ? runNow() : Promise.resolve();
}

export function hydrated(persisted: {
  persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void };
}) {
  return new Promise<void>((resolve) => {
    if (persisted.persist.hasHydrated()) return resolve();
    const unsubscribe = persisted.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

/**
 * Keeps local data and the signed-in account in sync: on sign-in, every 30 s and when the app
 * comes back to the foreground. Local data of another account is cleared before the first pull.
 */
export function useSync() {
  const { session } = useSession();
  const userId = session?.user.id;

  useEffect(() => {
    const status = useSyncStatus.getState();
    if (!supabase || !userId) {
      status.set({ phase: 'idle', initialPullDone: !userId });
      return;
    }
    const client = supabase;
    const remote: SyncClient = {
      select: async (table: SyncTable, since) =>
        fetchAllPages((from, to) => {
          let query = client.from(table).select('*');
          if (since) query = query.gt('updated_at', since);
          return query.order(SYNC_TABLES[table].key).range(from, to);
        }),
      upsert: async (table, rows, onConflict) => client.from(table).upsert(rows, { onConflict }),
      softDelete: async (table, keys, deletedAt) => client.from(table).update({ deleted_at: deletedAt }).in('id', keys),
      attachHistory: async () => client.rpc('attach_reconstructed_training_history'),
    };

    let running = false;
    let cancelled = false;
    let claim = false;
    const store = storeFor(userId, () => !cancelled);

    const tick = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        useSyncStatus.getState().set({ phase: 'syncing' });
        const result = await syncOnce(remote, store, userId, { claim });
        // The account's data wins only until a first round actually reached the server.
        if (!result.offline) claim = false;
        if (!cancelled) {
          useSyncStatus.getState().set({
            phase: result.offline
              ? 'offline'
              : result.failed > 0 || result.errors.some((e) => e.kind !== 'invalid_data')
                ? 'error'
                : 'idle',
            initialPullDone: true,
            lastSyncedAt: result.offline ? useSyncStatus.getState().lastSyncedAt : new Date().toISOString(),
            failed: result.failed,
            errors: result.errors,
          });
        }
      } catch {
        if (!cancelled) useSyncStatus.getState().set({ phase: 'error', initialPullDone: true });
      } finally {
        running = false;
      }
    };

    runNow = tick;
    let timer: ReturnType<typeof setInterval> | undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void tick();
    });
    // Wait for the saved data to be loaded, otherwise its owner is unknown.
    void Promise.all([hydrated(useDataStore), hydrated(useProfileStore), hydrated(useNotificationStore)]).then(() => {
      if (cancelled) return;
      // Attach the local data to this account, or clear data belonging to another one.
      const data = useDataStore.getState();
      if (data.ownerId !== userId) {
        if (data.ownerId !== null) {
          void resetDeviceData();
        } else {
          claim = true;
        }
        useDataStore.getState().setOwner(userId);
        useDataStore.getState().applySync({ synced: {}, lastPulledAt: null });
      }
      void tick();
      timer = setInterval(tick, INTERVAL_MS);
    });
    return () => {
      cancelled = true;
      if (runNow === tick) runNow = null;
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [userId]);
}
