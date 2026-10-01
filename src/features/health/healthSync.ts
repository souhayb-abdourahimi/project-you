import { runHealthSync } from '@/domain/health/sync';
import { EMPTY_HEALTH_DATA, type HealthDataType } from '@/domain/health/types';
import { readableTypes } from '@/domain/health/permissions';
import { providers } from '@/providers';
import { useHealthStore } from '@/state/health';

/** Automatic syncs (app open / back to foreground) are spaced by at least this much. */
export const AUTO_SYNC_INTERVAL_MS = 15 * 60_000;

let running: Promise<void> | null = null;

/**
 * Reads Apple Health / Health Connect into the local store through the HealthSyncEngine.
 * Health stores are on the device, so this works offline; nothing is sent to the server.
 */
export function syncHealth(options: { force?: boolean } = {}): Promise<void> {
  if (running) return running;
  const state = useHealthStore.getState();
  if (!state.connected) return Promise.resolve();
  const recent = state.lastSyncAt && Date.now() - Date.parse(state.lastSyncAt) < AUTO_SYNC_INTERVAL_MS;
  if (recent && !options.force) return Promise.resolve();

  running = (async () => {
    state.update({ status: 'syncing' });
    try {
      const out = await runHealthSync({
        reader: providers.health,
        wanted: state.wanted,
        previous: state.data,
        previousPermissions: state.permissions,
        now: new Date(),
      });
      const current = useHealthStore.getState();
      // Disconnected, or the device was reset, while reading: drop the result.
      if (!current.connected) return;
      const readSomething = out.availability === 'available' && out.failed.length < state.wanted.length;
      current.update({
        availability: out.availability,
        permissions: out.permissions,
        data: out.data,
        lastSyncAt: readSomething ? new Date().toISOString() : current.lastSyncAt,
        status: out.failed.length > 0 ? 'error' : 'idle',
        notice: out.withdrawn.length > 0 ? 'withdrawn' : current.notice,
      });
    } catch {
      useHealthStore.getState().update({ status: 'error' });
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Shows the system permission sheet for the chosen types, then imports. Refusing everything
 * leaves the app exactly as before: manual entries keep working.
 */
export async function connectHealth(
  types: HealthDataType[],
): Promise<'connected' | 'denied' | 'unavailable' | 'error'> {
  const store = useHealthStore.getState();
  const availability = await providers.health.getAvailability();
  store.update({ availability });
  if (availability !== 'available') return 'unavailable';
  const result = await providers.health.requestPermissions(types);
  if (result.status === 'error') return 'error';
  if (result.status === 'unavailable') return result.reason === 'permission_denied' ? 'denied' : 'unavailable';
  const permissions = result.data;
  if (readableTypes(permissions, types).length === 0) {
    store.update({ permissions, connected: false });
    return 'denied';
  }
  store.update({ connected: true, wanted: types, permissions, notice: null });
  await syncHealth({ force: true });
  return 'connected';
}

/**
 * Logical disconnect: stops reading and deletes every imported value from this device. On Android
 * the permissions are also revoked (effective at next app start); iOS has no API for it.
 */
export async function disconnectHealth(): Promise<void> {
  const result = await providers.health.disconnect();
  const revoked = result.status === 'ok' && result.data.revokedBySystem;
  useHealthStore.getState().update({
    connected: false,
    permissions: null,
    data: EMPTY_HEALTH_DATA,
    lastSyncAt: null,
    status: 'idle',
    notice: revoked ? 'restart_to_finish' : 'remove_in_settings',
  });
}

/** Changes which types are shared; a type that is unticked is purged at once. */
export async function setSharedTypes(types: HealthDataType[]): Promise<void> {
  const store = useHealthStore.getState();
  const removed = store.wanted.filter((t) => !types.includes(t));
  const data = { ...store.data };
  if (removed.includes('weight')) data.weights = [];
  if (removed.includes('steps')) data.steps = [];
  if (removed.includes('workouts')) data.workouts = [];
  if (removed.includes('activeCalories')) data.activeKcal = [];
  store.update({ wanted: types, data });
  const added = types.filter((t) => !store.wanted.includes(t));
  if (added.length > 0) await connectHealth(types);
}
