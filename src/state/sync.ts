import { create } from 'zustand';

import type { SyncError } from '@/services/sync';

export interface FirstPull {
  userId: string;
  outcome: 'reached' | 'unreachable';
}

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncStatusState {
  phase: SyncPhase;
  /**
   * How the first round of the signed-in account went, keyed by that account, so routing never
   * decides "no profile" from another account's round or from the signed-out state:
   * - `reached`: the account's rows were read from the server (its profile, if any, is restored);
   * - `unreachable`: no answer yet (offline, server error); later rounds can still turn it into `reached`.
   * Null while no round of the current account has ended.
   */
  firstPull: FirstPull | null;
  lastSyncedAt: string | null;
  /** Rows the server refused in the last round (kept locally, retried). */
  failed: number;
  /** Kinds of failure of the last round (conflict, offline, rls…): for support, never shown raw. */
  errors: SyncError[];
  set: (patch: Partial<Omit<SyncStatusState, 'set'>>) => void;
}

/** Not persisted: describes the current session only. */
export const useSyncStatus = create<SyncStatusState>()((set) => ({
  phase: 'idle',
  firstPull: null,
  lastSyncedAt: null,
  failed: 0,
  errors: [],
  set: (patch) => set(patch),
}));
