import { create } from 'zustand';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncStatusState {
  phase: SyncPhase;
  /** True once the first pull after sign-in has finished (or failed), so routing can decide. */
  initialPullDone: boolean;
  lastSyncedAt: string | null;
  /** Rows the server refused in the last round (kept locally, retried). */
  failed: number;
  set: (patch: Partial<Omit<SyncStatusState, 'set'>>) => void;
}

/** Not persisted: describes the current session only. */
export const useSyncStatus = create<SyncStatusState>()((set) => ({
  phase: 'idle',
  initialPullDone: false,
  lastSyncedAt: null,
  failed: 0,
  set: (patch) => set(patch),
}));
