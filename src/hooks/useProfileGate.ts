import { useSession } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import { useDataStore } from '@/state/data';
import { useProfileStore } from '@/state/profile';
import { useSyncStatus } from '@/state/sync';

import { profileGate, type ProfileGate } from './profileGate';
import { useHydrated } from './useSync';

/** `profileGate` over the live stores, `null` until the session and the saved data are read. */
export function useProfileGate(): ProfileGate | null {
  const { session, loading } = useSession();
  const hasSnapshot = useProfileStore((s) => s.snapshot !== null);
  const localMode = useProfileStore((s) => s.localMode);
  const ownerId = useDataStore((s) => s.ownerId);
  const firstPull = useSyncStatus((s) => s.firstPull);
  const ready = useHydrated(useProfileStore, useDataStore);
  if (loading) return null;
  // Cold start on iOS / Android: the saved profile is read asynchronously; never decide before.
  if (!ready) return 'wait';
  return profileGate({
    supabaseConfigured: isSupabaseConfigured,
    userId: session?.user.id ?? null,
    localMode,
    hasSnapshot,
    ownerId,
    firstPull,
  });
}
