import { syncView } from '@/domain/sync/status';
import { pendingChanges } from '@/hooks/useSync';
import { useSession } from '@/services/auth';
import { useDataStore } from '@/state/data';
import { useSyncStatus } from '@/state/sync';

/** The sync state in plain words (D-043), shared by Réglages and the main screens. */
export function useSyncView() {
  const { session } = useSession();
  const phase = useSyncStatus((s) => s.phase);
  const errors = useSyncStatus((s) => s.errors);
  const lastSyncedAt = useSyncStatus((s) => s.lastSyncedAt);
  // Re-read on every data change, so "en attente" disappears as soon as the round sent it.
  useDataStore((s) => s.synced);
  const pending = session ? pendingChanges() : 0;
  return { view: syncView({ signedIn: !!session, phase, pending, errors }), pending, lastSyncedAt };
}
