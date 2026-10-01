import type { IsoDate } from '../shared/dates';

/**
 * Health data read from Apple Health (HealthKit) or Health Connect. V1 reads only what the coach
 * uses: weight, steps, workouts and active energy. Heart rate, sleep, ECG, clinical records and
 * any other type are deliberately out of scope (docs/DECISIONS.md D-018).
 */
export const HEALTH_DATA_TYPES = ['weight', 'steps', 'workouts', 'activeCalories'] as const;
export type HealthDataType = (typeof HEALTH_DATA_TYPES)[number];

export type HealthSource = 'healthkit' | 'health_connect';
/** Where a weight shown in the app comes from. */
export type WeightSource = 'manual' | HealthSource;

export type HealthAvailability =
  /** The platform health store can be used. */
  | 'available'
  /** Web, or a platform without a health store. */
  | 'not_supported'
  /** Android: Health Connect is not installed / not available on this device. */
  | 'not_installed'
  /** Android: the Health Connect app must be updated first. */
  | 'update_required'
  /** iOS: HealthKit unavailable on this device (some iPads) or restricted. */
  | 'unavailable';

/**
 * Per data type. Apple never tells an app whether read access was refused (privacy by design):
 * after asking, iOS types stay `requested` and the app simply reads what it is given.
 */
export type HealthPermission = 'granted' | 'denied' | 'not_determined' | 'requested';
export type HealthPermissions = Record<HealthDataType, HealthPermission>;

/** Result shape shared with `ProviderResult` (src/providers/types.ts), kept local so the domain stays pure. */
export type ReadResult<T> =
  { status: 'ok'; data: T } | { status: 'unavailable'; reason: string } | { status: 'error'; retryable: boolean };

export interface TimeRange {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

/* ---------- Raw values handed over by a platform provider, before normalisation ---------- */

export interface RawWeightSample {
  id: string;
  /** ISO timestamp of the measurement. */
  at: string;
  value: number;
  /** As reported by the platform: 'kg', 'g', 'lb', 'kilograms', 'pounds', … */
  unit: string;
}

/** One local day, already aggregated by the platform (which deduplicates phone + watch). */
export interface RawDailyTotal {
  date: IsoDate;
  value: number;
  /** 'count' for steps; 'kcal', 'kJ', 'cal', 'kilocalories', … for energy. */
  unit: string;
}

export interface RawWorkout {
  id: string;
  start: string;
  end: string;
  /** HKWorkoutActivityType or Health Connect ExerciseType code. */
  activityCode: number;
  activeEnergy?: { value: number; unit: string } | null;
}

export interface RawHealthBatch {
  weights?: RawWeightSample[];
  steps?: RawDailyTotal[];
  activeCalories?: RawDailyTotal[];
  workouts?: RawWorkout[];
}

/* ---------- Normalised values kept by the app ---------- */

export interface HealthWeight {
  id: string;
  date: IsoDate;
  at: string;
  weightKg: number;
  source: HealthSource;
}

export interface DailyValue {
  date: IsoDate;
  value: number;
}

export type WorkoutKind =
  'strength' | 'running' | 'walking' | 'cycling' | 'hiit' | 'yoga' | 'swimming' | 'cardio_machine' | 'other';

export interface HealthWorkout {
  id: string;
  date: IsoDate;
  start: string;
  end: string;
  durationMin: number;
  kind: WorkoutKind;
  /** Estimate from the source device; null when the source has none. */
  activeKcal: number | null;
  source: HealthSource;
}

/** Everything imported, kept on this device only (never synced, see D-018). */
export interface HealthData {
  weights: HealthWeight[];
  steps: DailyValue[];
  activeKcal: DailyValue[];
  workouts: HealthWorkout[];
}

export const EMPTY_HEALTH_DATA: HealthData = { weights: [], steps: [], activeKcal: [], workouts: [] };
