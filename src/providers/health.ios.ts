import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailableAsync,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
  type ObjectTypeIdentifier,
} from '@kingstinct/react-native-healthkit';
import { Linking } from 'react-native';

import type { HealthDataType, HealthPermissions, RawDailyTotal, TimeRange } from '@/domain/health/types';
import { toIsoDate } from '@/domain/shared/dates';

import { guarded, healthOk } from './health.shared';
import type { HealthProvider, ProviderResult } from './types';

/**
 * AppleHealthProvider (HealthKit, via @kingstinct/react-native-healthkit). Read-only: the app
 * never writes to Apple Health in V1, so no "share" type is ever requested. Clinical records are
 * not enabled. Apple hides whether read access was refused: unread types simply return nothing.
 */
const READ_TYPES: Record<HealthDataType, ObjectTypeIdentifier> = {
  weight: 'HKQuantityTypeIdentifierBodyMass',
  steps: 'HKQuantityTypeIdentifierStepCount',
  workouts: 'HKWorkoutTypeIdentifier',
  activeCalories: 'HKQuantityTypeIdentifierActiveEnergyBurned',
};

const ok = <T>(data: T) => healthOk('healthkit', data);
const dateFilter = (range: TimeRange) => ({ date: { startDate: range.from, endDate: range.to } });

async function permissions(types: HealthDataType[]): Promise<ProviderResult<HealthPermissions>> {
  const result: HealthPermissions = {
    weight: 'not_determined',
    steps: 'not_determined',
    workouts: 'not_determined',
    activeCalories: 'not_determined',
  };
  for (const type of types) {
    const status = await getRequestStatusForAuthorization({ toRead: [READ_TYPES[type]] });
    // "unnecessary" = the sheet was already shown for this type; whether the user allowed it is private.
    if (status === AuthorizationRequestStatus.unnecessary) result[type] = 'requested';
  }
  return ok(result);
}

async function dailySums(
  identifier: 'HKQuantityTypeIdentifierStepCount' | 'HKQuantityTypeIdentifierActiveEnergyBurned',
  unit: 'count' | 'kcal',
  range: TimeRange,
): Promise<ProviderResult<RawDailyTotal[]>> {
  // HealthKit statistics merge overlapping sources (iPhone + Apple Watch) instead of adding them.
  const days = await queryStatisticsCollectionForQuantity(
    identifier,
    ['cumulativeSum'],
    range.from,
    { day: 1 },
    {
      filter: dateFilter(range),
      unit,
    },
  );
  return ok(
    days
      .filter((d) => d.startDate && d.sumQuantity)
      .map((d) => ({
        date: toIsoDate(new Date(d.startDate!)),
        value: d.sumQuantity!.quantity,
        unit: d.sumQuantity!.unit,
      })),
  );
}

export const deviceHealthProvider: HealthProvider = {
  source: 'healthkit',
  getAvailability: async () => {
    try {
      return (await isHealthDataAvailableAsync()) ? 'available' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  },
  requestPermissions: (types) =>
    guarded(async () => {
      await requestAuthorization({ toRead: types.map((t) => READ_TYPES[t]) });
      return permissions(types);
    }),
  getPermissions: (types) => guarded(() => permissions(types)),
  getWeight: (range) =>
    guarded(async () => {
      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', {
        limit: 0,
        ascending: true,
        unit: 'kg',
        filter: dateFilter(range),
      });
      return ok(
        samples.map((s) => ({ id: s.uuid, at: new Date(s.startDate).toISOString(), value: s.quantity, unit: s.unit })),
      );
    }),
  getSteps: (range) => guarded(() => dailySums('HKQuantityTypeIdentifierStepCount', 'count', range)),
  getActiveCalories: (range) => guarded(() => dailySums('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', range)),
  getWorkouts: (range) =>
    guarded(async () => {
      const workouts = await queryWorkoutSamples({ limit: 0, ascending: true, filter: dateFilter(range) });
      return ok(
        workouts.map((w) => ({
          id: w.uuid,
          start: new Date(w.startDate).toISOString(),
          end: new Date(w.endDate).toISOString(),
          activityCode: Number(w.workoutActivityType),
          activeEnergy: w.totalEnergyBurned
            ? { value: w.totalEnergyBurned.quantity, unit: w.totalEnergyBurned.unit }
            : null,
        })),
      );
    }),
  // No API can revoke HealthKit access: the app stops reading and the user can remove access in Settings.
  disconnect: async () => ok({ revokedBySystem: false }),
  openSettings: async () => {
    await Linking.openSettings().catch(() => undefined);
  },
};
