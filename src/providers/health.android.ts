import {
  aggregateGroupByPeriod,
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  revokeAllPermissions,
  SdkAvailabilityStatus,
  type Permission,
} from 'react-native-health-connect';

import type {
  HealthAvailability,
  HealthDataType,
  HealthPermissions,
  RawDailyTotal,
  TimeRange,
} from '@/domain/health/types';
import { toIsoDate } from '@/domain/shared/dates';

import { guarded, healthDenied, healthOk } from './health.shared';
import type { HealthProvider, ProviderResult } from './types';

/**
 * AndroidHealthProvider (Health Connect, via react-native-health-connect). Read-only; the four
 * READ_* permissions below are the only ones declared in app.json. Permissions are checked before
 * every read because the user can revoke them at any time in Health Connect.
 */
const RECORD = {
  weight: 'Weight',
  steps: 'Steps',
  workouts: 'ExerciseSession',
  activeCalories: 'ActiveCaloriesBurned',
} as const satisfies Record<HealthDataType, Permission['recordType']>;

const ok = <T>(data: T) => healthOk('health_connect', data);
const between = (range: TimeRange) => ({
  operator: 'between' as const,
  startTime: range.from.toISOString(),
  endTime: range.to.toISOString(),
});
const PAGE_SIZE = 500;
/** A workout's energy needs one extra query: bounded so a long history can't flood Health Connect. */
const MAX_WORKOUT_ENERGY_QUERIES = 60;

let initialized = false;
async function ready(): Promise<boolean> {
  if (!initialized) initialized = await initialize();
  return initialized;
}

async function availability(): Promise<HealthAvailability> {
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update_required';
    return 'not_installed';
  } catch {
    return 'not_installed';
  }
}

function toPermissions(
  granted: { accessType: string; recordType: string }[],
  types: HealthDataType[],
): HealthPermissions {
  const has = (type: HealthDataType) => granted.some((p) => p.accessType === 'read' && p.recordType === RECORD[type]);
  const result: HealthPermissions = {
    weight: 'not_determined',
    steps: 'not_determined',
    workouts: 'not_determined',
    activeCalories: 'not_determined',
  };
  for (const type of types) result[type] = has(type) ? 'granted' : 'denied';
  return result;
}

async function isGranted(type: HealthDataType): Promise<boolean> {
  const granted = await getGrantedPermissions();
  return granted.some((p) => 'recordType' in p && p.accessType === 'read' && p.recordType === RECORD[type]);
}

/** Reads every page of a record type, after checking the permission is still there. */
async function readAll<T extends (typeof RECORD)[HealthDataType]>(recordType: T, range: TimeRange) {
  const records = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords(recordType, {
      timeRangeFilter: between(range),
      pageSize: PAGE_SIZE,
      pageToken,
      ascendingOrder: true,
    });
    records.push(...page.records);
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return records;
}

/** Period slices come back as local date-times ("2026-09-30T00:00"); durations as instants. */
function localDate(value: string): string {
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? toIsoDate(new Date(value)) : value.slice(0, 10);
}

async function withPermission<T>(
  type: HealthDataType,
  read: () => Promise<ProviderResult<T>>,
): Promise<ProviderResult<T>> {
  return guarded(async () => {
    if (!(await ready()) || !(await isGranted(type))) return healthDenied;
    return read();
  });
}

async function daily(type: 'steps' | 'activeCalories', range: TimeRange): Promise<RawDailyTotal[]> {
  const slicer = { period: 'DAYS' as const, length: 1 };
  // Aggregates let Health Connect merge sources by the user's priority order instead of adding them.
  if (type === 'steps') {
    const days = await aggregateGroupByPeriod({
      recordType: 'Steps',
      timeRangeFilter: between(range),
      timeRangeSlicer: slicer,
    });
    return days.map((d) => ({ date: localDate(d.startTime), value: d.result.COUNT_TOTAL, unit: 'count' }));
  }
  const days = await aggregateGroupByPeriod({
    recordType: 'ActiveCaloriesBurned',
    timeRangeFilter: between(range),
    timeRangeSlicer: slicer,
  });
  return days.map((d) => ({
    date: localDate(d.startTime),
    value: d.result.ACTIVE_CALORIES_TOTAL.inKilocalories,
    unit: 'kcal',
  }));
}

export const deviceHealthProvider: HealthProvider = {
  source: 'health_connect',
  getAvailability: availability,
  requestPermissions: (types) =>
    guarded(async () => {
      if (!(await ready())) return { status: 'unavailable', reason: 'not_configured' };
      const granted = await requestPermission(types.map((t) => ({ accessType: 'read', recordType: RECORD[t] })));
      return ok(toPermissions(granted.filter((p) => 'recordType' in p) as Permission[], types));
    }),
  getPermissions: (types) =>
    guarded(async () => {
      if (!(await ready())) return { status: 'unavailable', reason: 'not_configured' };
      const granted = await getGrantedPermissions();
      return ok(toPermissions(granted.filter((p) => 'recordType' in p) as Permission[], types));
    }),
  getWeight: (range) =>
    withPermission('weight', async () => {
      const records = await readAll(RECORD.weight, range);
      return ok(
        records.map((r) => ({
          id: r.metadata?.id ?? `${r.time}`,
          at: r.time,
          value: r.weight.inKilograms,
          unit: 'kg',
        })),
      );
    }),
  getSteps: (range) => withPermission('steps', async () => ok(await daily('steps', range))),
  getActiveCalories: (range) => withPermission('activeCalories', async () => ok(await daily('activeCalories', range))),
  getWorkouts: (range) =>
    withPermission('workouts', async () => {
      const sessions = await readAll(RECORD.workouts, range);
      const energyAllowed = await isGranted('activeCalories');
      const workouts = await Promise.all(
        sessions.map(async (s, i) => {
          let activeEnergy: { value: number; unit: string } | null = null;
          if (energyAllowed && i < MAX_WORKOUT_ENERGY_QUERIES) {
            const total = await aggregateRecord({
              recordType: 'ActiveCaloriesBurned',
              timeRangeFilter: { operator: 'between', startTime: s.startTime, endTime: s.endTime },
            }).catch(() => null);
            if (total) activeEnergy = { value: total.ACTIVE_CALORIES_TOTAL.inKilocalories, unit: 'kcal' };
          }
          return {
            id: s.metadata?.id ?? `${s.startTime}`,
            start: s.startTime,
            end: s.endTime,
            activityCode: s.exerciseType,
            activeEnergy,
          };
        }),
      );
      return ok(workouts);
    }),
  disconnect: () =>
    guarded<{ revokedBySystem: boolean }>(async () => {
      if (!(await ready())) return ok({ revokedBySystem: false });
      // Health Connect applies a revocation at the next app start; the app stops reading right away.
      await revokeAllPermissions();
      return ok({ revokedBySystem: true });
    }),
  openSettings: async () => {
    try {
      openHealthConnectSettings();
    } catch {
      // Health Connect missing: nothing to open.
    }
  },
};
