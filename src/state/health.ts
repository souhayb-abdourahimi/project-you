import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  EMPTY_HEALTH_DATA,
  HEALTH_DATA_TYPES,
  type HealthAvailability,
  type HealthData,
  type HealthDataType,
  type HealthPermissions,
} from '@/domain/health/types';

import { persistStorage } from './storage';

export type HealthNotice =
  /** Access to some types was removed in system settings: their imported data was deleted. */
  | 'withdrawn'
  /** Android: Health Connect applies a revocation at the next app start. */
  | 'restart_to_finish'
  /** iOS: the app stopped reading; access can be removed in Settings › Health. */
  | 'remove_in_settings';

interface HealthState {
  /** The user chose to link Apple Health / Health Connect on this device. */
  connected: boolean;
  /** Types the user chose to share. */
  wanted: HealthDataType[];
  availability: HealthAvailability | null;
  permissions: HealthPermissions | null;
  /** Imported values, last 28 days only, kept on this device and never synced (D-018). */
  data: HealthData;
  lastSyncAt: string | null;
  status: 'idle' | 'syncing' | 'error';
  notice: HealthNotice | null;
  update: (patch: Partial<Omit<HealthState, 'update' | 'reset'>>) => void;
  reset: () => void;
}

const initial = {
  connected: false,
  wanted: [...HEALTH_DATA_TYPES],
  availability: null,
  permissions: null,
  data: EMPTY_HEALTH_DATA,
  lastSyncAt: null,
  status: 'idle' as const,
  notice: null,
};

/** Device-level link: each phone has its own health store. Not synced to the account. */
export const useHealthStore = create<HealthState>()(
  persist(
    (set) => ({
      ...initial,
      update: (patch) => set(patch),
      reset: () => set(initial),
    }),
    {
      name: 'py.health.v1',
      storage: persistStorage,
      version: 1,
      // A sync in progress when the app was closed is not in progress anymore.
      partialize: ({ status: _status, ...rest }) => rest,
    },
  ),
);
