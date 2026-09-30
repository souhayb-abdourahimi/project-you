import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { SyncTable } from '@/domain/sync/projection';
import { useSession } from '@/services/auth';
import { supabase } from '@/services/supabase';
import { syncOnce, type SyncClient, type SyncStore } from '@/services/sync';
import { useDataStore } from '@/state/data';
import { useProfileStore } from '@/state/profile';
import { useSyncStatus } from '@/state/sync';

const INTERVAL_MS = 30_000;

const store: SyncStore = {
  read: () => ({ ...useDataStore.getState(), snapshot: useProfileStore.getState().snapshot }),
  write: (patch) => {
    if ('snapshot' in patch && patch.snapshot !== useProfileStore.getState().snapshot) {
      useProfileStore.getState().setSnapshot(patch.snapshot ?? null);
    }
    useDataStore.getState().applySync(patch);
  },
};

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
      select: async (table: SyncTable, since) => {
        let query = client.from(table).select('*');
        if (since) query = query.gt('updated_at', since);
        return query;
      },
      upsert: async (table, rows, onConflict) => client.from(table).upsert(rows, { onConflict }),
      softDelete: async (table, keys, deletedAt) => client.from(table).update({ deleted_at: deletedAt }).in('id', keys),
    };

    // Attach the local data to this account, or clear data belonging to another one.
    const data = useDataStore.getState();
    let claim = false;
    if (data.ownerId !== userId) {
      if (data.ownerId !== null) {
        data.reset();
        useProfileStore.getState().reset();
      }
      claim = data.ownerId === null && data.ownerId !== userId;
      useDataStore.getState().setOwner(userId);
      useDataStore.getState().applySync({ synced: {}, lastPulledAt: null });
    }

    let running = false;
    let cancelled = false;
    const tick = async () => {
      if (running || cancelled) return;
      running = true;
      useSyncStatus.getState().set({ phase: 'syncing' });
      const result = await syncOnce(remote, store, userId, { claim });
      claim = false;
      if (!cancelled) {
        useSyncStatus.getState().set({
          phase: result.offline ? 'offline' : result.failed > 0 ? 'error' : 'idle',
          initialPullDone: true,
          lastSyncedAt: result.offline ? useSyncStatus.getState().lastSyncedAt : new Date().toISOString(),
          failed: result.failed,
        });
      }
      running = false;
    };
    void tick();
    const timer = setInterval(tick, INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void tick();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [userId]);
}
