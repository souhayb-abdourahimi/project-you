import { HEALTH_DATA_TYPES, type HealthAvailability, type HealthDataType, type HealthPermissions } from './types';

export type HealthConnectionStatus =
  /** No health store on this platform (web). */
  | 'unsupported'
  /** The store exists but can't be used now (not installed, update needed, restricted). */
  | 'unavailable'
  | 'not_connected'
  | 'connected'
  /** Some of the chosen data types are allowed, others were refused. */
  | 'partial'
  /** Every chosen type was refused. The app keeps working with manual entries. */
  | 'denied';

const usable = (p: HealthPermissions[HealthDataType]) => p === 'granted' || p === 'requested';

export function noPermissions(): HealthPermissions {
  return {
    weight: 'not_determined',
    steps: 'not_determined',
    workouts: 'not_determined',
    activeCalories: 'not_determined',
  };
}

/** Types the app may try to read: granted, or asked on iOS where the answer is never revealed. */
export function readableTypes(permissions: HealthPermissions, wanted: HealthDataType[]): HealthDataType[] {
  return wanted.filter((t) => usable(permissions[t]));
}

/** Types that were usable before and are not anymore (revoked in system settings). */
export function withdrawnTypes(previous: HealthPermissions | null, current: HealthPermissions): HealthDataType[] {
  if (!previous) return [];
  return HEALTH_DATA_TYPES.filter((t) => usable(previous[t]) && !usable(current[t]));
}

export function connectionStatus(input: {
  availability: HealthAvailability;
  connected: boolean;
  permissions: HealthPermissions | null;
  wanted: HealthDataType[];
}): HealthConnectionStatus {
  if (input.availability === 'not_supported') return 'unsupported';
  if (input.availability !== 'available') return 'unavailable';
  if (!input.connected || !input.permissions || input.wanted.length === 0) return 'not_connected';
  const allowed = readableTypes(input.permissions, input.wanted).length;
  if (allowed === 0) return 'denied';
  return allowed === input.wanted.length ? 'connected' : 'partial';
}
