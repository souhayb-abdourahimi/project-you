import { addDays, toIsoDate } from '../shared/dates';
import { mergeHealthData } from './merge';
import { normalizeHealth } from './normalize';
import { readableTypes, withdrawnTypes } from './permissions';
import {
  HEALTH_DATA_TYPES,
  type HealthAvailability,
  type HealthData,
  type HealthDataType,
  type HealthPermissions,
  type HealthSource,
  type RawDailyTotal,
  type RawHealthBatch,
  type RawWeightSample,
  type RawWorkout,
  type ReadResult,
  type TimeRange,
} from './types';

/** Imported data older than this is dropped from the device: enough for the 14-day trends. */
export const HEALTH_RETENTION_DAYS = 28;

/** What the sync engine needs from a platform provider (implemented in src/providers/health.*). */
export interface HealthReader {
  readonly source: HealthSource | null;
  getAvailability(): Promise<HealthAvailability>;
  getPermissions(types: HealthDataType[]): Promise<ReadResult<HealthPermissions>>;
  getWeight(range: TimeRange): Promise<ReadResult<RawWeightSample[]>>;
  getSteps(range: TimeRange): Promise<ReadResult<RawDailyTotal[]>>;
  getWorkouts(range: TimeRange): Promise<ReadResult<RawWorkout[]>>;
  getActiveCalories(range: TimeRange): Promise<ReadResult<RawDailyTotal[]>>;
}

export interface HealthSyncInput {
  reader: HealthReader;
  /** Types the user chose to share. */
  wanted: HealthDataType[];
  previous: HealthData;
  previousPermissions: HealthPermissions | null;
  now: Date;
}

export interface HealthSyncOutcome {
  availability: HealthAvailability;
  permissions: HealthPermissions | null;
  data: HealthData;
  /** Types whose access was withdrawn since last time: their imported data was removed. */
  withdrawn: HealthDataType[];
  /** Types that could not be read this time: their previous data is kept as is. */
  failed: HealthDataType[];
  /** Samples dropped by validation. */
  rejected: number;
}

const KEY: Record<HealthDataType, keyof HealthData> = {
  weight: 'weights',
  steps: 'steps',
  workouts: 'workouts',
  activeCalories: 'activeKcal',
};

const BATCH_KEY: Record<HealthDataType, keyof RawHealthBatch> = {
  weight: 'weights',
  steps: 'steps',
  workouts: 'workouts',
  activeCalories: 'activeCalories',
};

function clear(data: HealthData, key: keyof HealthData) {
  data[key] = [];
}

function read(reader: HealthReader, type: HealthDataType, range: TimeRange): Promise<ReadResult<unknown[]>> {
  switch (type) {
    case 'weight':
      return reader.getWeight(range);
    case 'steps':
      return reader.getSteps(range);
    case 'workouts':
      return reader.getWorkouts(range);
    case 'activeCalories':
      return reader.getActiveCalories(range);
  }
}

/**
 * HealthSyncEngine: provider → normalisation → validation → deduplication → local state.
 * Each run re-reads the whole retention window, so data deleted in Apple Health / Health Connect
 * disappears here too. A type that fails keeps its previous values (offline, timeout); a type whose
 * access was withdrawn, or that the user unticked, is purged. Nothing here talks to the server.
 */
export async function runHealthSync(input: HealthSyncInput): Promise<HealthSyncOutcome> {
  const { reader, wanted, previous, now } = input;
  const availability = await reader.getAvailability();
  const keepFrom = addDays(toIsoDate(now), -(HEALTH_RETENTION_DAYS - 1));
  const unchanged = {
    availability,
    permissions: input.previousPermissions,
    data: previous,
    withdrawn: [],
    failed: [],
    rejected: 0,
  };
  if (availability !== 'available' || !reader.source) return unchanged;

  const permissionResult = await reader.getPermissions(wanted);
  if (permissionResult.status !== 'ok') return { ...unchanged, failed: wanted };
  const permissions = permissionResult.data;
  const readable = readableTypes(permissions, wanted);
  const withdrawn = withdrawnTypes(input.previousPermissions, permissions);

  const [y, m, d] = keepFrom.split('-').map(Number);
  const range: TimeRange = { from: new Date(y, m - 1, d), to: now };
  const results = await Promise.all(readable.map(async (type) => [type, await read(reader, type, range)] as const));

  const batch: Record<string, unknown[]> = {};
  const failed: HealthDataType[] = [];
  for (const [type, result] of results) {
    if (result.status === 'ok') batch[BATCH_KEY[type]] = result.data;
    // iOS reports nothing for a refused type; Android reports permission_denied. Either way: no data.
    else if (result.status === 'unavailable') batch[BATCH_KEY[type]] = [];
    else failed.push(type);
  }
  const { data: fresh, rejected } = normalizeHealth(batch as RawHealthBatch, reader.source, now);

  // Start from what we had, drop types that are no longer shared, replace types read successfully.
  const base: HealthData = { ...previous };
  for (const type of HEALTH_DATA_TYPES) {
    const gone = !wanted.includes(type) || (!readable.includes(type) && !failed.includes(type));
    if (gone || fresh[KEY[type]]) clear(base, KEY[type]);
  }
  return {
    availability,
    permissions,
    data: mergeHealthData(base, fresh, keepFrom),
    withdrawn,
    failed,
    rejected,
  };
}
