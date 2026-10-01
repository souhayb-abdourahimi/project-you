import { z } from 'zod';

import { toIsoDate } from '../shared/dates';
import type {
  DailyValue,
  HealthData,
  HealthSource,
  HealthWeight,
  HealthWorkout,
  RawDailyTotal,
  RawHealthBatch,
  RawWeightSample,
  RawWorkout,
  WorkoutKind,
} from './types';

/* ---------- Units ---------- */

const KG_PER: Record<string, number> = {
  kg: 1,
  kilogram: 1,
  kilograms: 1,
  g: 0.001,
  gram: 0.001,
  grams: 0.001,
  lb: 0.45359237,
  lbs: 0.45359237,
  pound: 0.45359237,
  pounds: 0.45359237,
  oz: 0.028349523125,
  ounces: 0.028349523125,
  st: 6.35029318,
  stone: 6.35029318,
};

/**
 * Energy units. Careful: HealthKit's 'Cal' and Health Connect's 'kilocalories' are kilocalories,
 * while 'cal' / 'calories' are small calories (1/1000 kcal).
 */
const KCAL_PER: Record<string, number> = {
  kcal: 1,
  Cal: 1,
  kilocalorie: 1,
  kilocalories: 1,
  cal: 0.001,
  calorie: 0.001,
  calories: 0.001,
  kJ: 1 / 4.184,
  kilojoule: 1 / 4.184,
  kilojoules: 1 / 4.184,
  J: 1 / 4184,
  joule: 1 / 4184,
  joules: 1 / 4184,
};

/** Converts a mass to kilograms; null for an unknown unit (the value is then rejected, never guessed). */
export function toKg(value: number, unit: string): number | null {
  const factor = KG_PER[unit] ?? KG_PER[unit.toLowerCase()];
  return factor === undefined ? null : value * factor;
}

export function toKcal(value: number, unit: string): number | null {
  const factor = KCAL_PER[unit] ?? KCAL_PER[unit.toLowerCase()];
  return factor === undefined ? null : value * factor;
}

/* ---------- Plausibility bounds: values outside are rejected, not clamped ---------- */

export const HEALTH_BOUNDS = {
  weightKg: { min: 20, max: 400 },
  stepsPerDay: { min: 0, max: 150_000 },
  activeKcalPerDay: { min: 0, max: 10_000 },
  workoutMinutes: { min: 1, max: 24 * 60 },
  workoutKcal: { min: 0, max: 5_000 },
} as const;

/* ---------- Workout types ---------- */

/** HKWorkoutActivityType raw values (Apple). Anything else is 'other'. */
const HEALTHKIT_KINDS: Record<number, WorkoutKind> = {
  20: 'strength', // functionalStrengthTraining
  50: 'strength', // traditionalStrengthTraining
  59: 'strength', // coreTraining
  11: 'hiit', // crossTraining
  63: 'hiit', // highIntensityIntervalTraining
  73: 'hiit', // mixedCardio
  37: 'running',
  52: 'walking',
  24: 'walking', // hiking
  13: 'cycling',
  57: 'yoga',
  66: 'yoga', // pilates
  62: 'yoga', // flexibility
  46: 'swimming',
  16: 'cardio_machine', // elliptical
  35: 'cardio_machine', // rowing
  44: 'cardio_machine', // stairClimbing
  68: 'cardio_machine', // stairs
};

/** Health Connect ExerciseSessionRecord.exerciseType values. */
const HEALTH_CONNECT_KINDS: Record<number, WorkoutKind> = {
  70: 'strength', // STRENGTH_TRAINING
  81: 'strength', // WEIGHTLIFTING
  13: 'strength', // CALISTHENICS
  10: 'hiit', // BOOT_CAMP
  36: 'hiit', // HIGH_INTENSITY_INTERVAL_TRAINING
  56: 'running',
  57: 'running', // RUNNING_TREADMILL
  79: 'walking',
  37: 'walking', // HIKING
  8: 'cycling', // BIKING
  9: 'cycling', // BIKING_STATIONARY
  83: 'yoga',
  48: 'yoga', // PILATES
  71: 'yoga', // STRETCHING
  73: 'swimming', // SWIMMING_OPEN_WATER
  74: 'swimming', // SWIMMING_POOL
  25: 'cardio_machine', // ELLIPTICAL
  54: 'cardio_machine', // ROWING_MACHINE
  68: 'cardio_machine', // STAIR_CLIMBING
  69: 'cardio_machine', // STAIR_CLIMBING_MACHINE
};

export function workoutKind(source: HealthSource, code: number): WorkoutKind {
  return (source === 'healthkit' ? HEALTHKIT_KINDS : HEALTH_CONNECT_KINDS)[code] ?? 'other';
}

/* ---------- Shape validation of what a native module returns ---------- */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestamp = z.string().refine((s) => !Number.isNaN(Date.parse(s)));
const finite = z.number().finite();

const rawWeight = z.object({ id: z.string().min(1), at: timestamp, value: finite, unit: z.string() });
const rawDaily = z.object({ date: isoDate, value: finite, unit: z.string() });
const rawWorkout = z.object({
  id: z.string().min(1),
  start: timestamp,
  end: timestamp,
  activityCode: z.number().int(),
  activeEnergy: z.object({ value: finite, unit: z.string() }).nullish(),
});

const inRange = (v: number, b: { min: number; max: number }) => v >= b.min && v <= b.max;
const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** A small clock tolerance: a sample "from the future" beyond it is rejected. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

function weight(raw: RawWeightSample, source: HealthSource, now: Date): HealthWeight | null {
  if (!rawWeight.safeParse(raw).success) return null;
  const kg = toKg(raw.value, raw.unit);
  if (kg === null || !inRange(kg, HEALTH_BOUNDS.weightKg)) return null;
  const at = new Date(raw.at);
  if (at.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) return null;
  return { id: `${source}:${raw.id}`, date: toIsoDate(at), at: at.toISOString(), weightKg: round(kg, 2), source };
}

function daily(
  raw: RawDailyTotal,
  convert: (v: number, unit: string) => number | null,
  bounds: { min: number; max: number },
  today: string,
): DailyValue | null {
  if (!rawDaily.safeParse(raw).success || raw.date > today) return null;
  const value = convert(raw.value, raw.unit);
  if (value === null || !inRange(value, bounds)) return null;
  return { date: raw.date, value: Math.round(value) };
}

const steps = (v: number, unit: string) => (unit === 'count' ? v : null);

function workout(raw: RawWorkout, source: HealthSource, now: Date): HealthWorkout | null {
  if (!rawWorkout.safeParse(raw).success) return null;
  const start = new Date(raw.start);
  const end = new Date(raw.end);
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (!inRange(minutes, HEALTH_BOUNDS.workoutMinutes)) return null;
  if (end.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) return null;
  let activeKcal: number | null = null;
  if (raw.activeEnergy) {
    const kcal = toKcal(raw.activeEnergy.value, raw.activeEnergy.unit);
    // An implausible energy value is dropped; the workout itself stays.
    activeKcal = kcal !== null && inRange(kcal, HEALTH_BOUNDS.workoutKcal) ? Math.round(kcal) : null;
  }
  return {
    id: `${source}:${raw.id}`,
    date: toIsoDate(start),
    start: start.toISOString(),
    end: end.toISOString(),
    durationMin: Math.round(minutes),
    kind: workoutKind(source, raw.activityCode),
    activeKcal,
    source,
  };
}

function keep<T>(values: (T | null)[], counter: { rejected: number }): T[] {
  const kept = values.filter((v): v is T => v !== null);
  counter.rejected += values.length - kept.length;
  return kept;
}

/**
 * Validates and converts everything a provider returned. Invalid samples (unknown unit, out of
 * range, malformed, in the future) are counted and dropped, never patched.
 */
export function normalizeHealth(
  batch: RawHealthBatch,
  source: HealthSource,
  now: Date,
): { data: Partial<HealthData>; rejected: number } {
  const counter = { rejected: 0 };
  const today = toIsoDate(now);
  const data: Partial<HealthData> = {};
  if (batch.weights)
    data.weights = keep(
      batch.weights.map((w) => weight(w, source, now)),
      counter,
    );
  if (batch.steps)
    data.steps = keep(
      batch.steps.map((d) => daily(d, steps, HEALTH_BOUNDS.stepsPerDay, today)),
      counter,
    );
  if (batch.activeCalories)
    data.activeKcal = keep(
      batch.activeCalories.map((d) => daily(d, toKcal, HEALTH_BOUNDS.activeKcalPerDay, today)),
      counter,
    );
  if (batch.workouts)
    data.workouts = keep(
      batch.workouts.map((w) => workout(w, source, now)),
      counter,
    );
  return { data, rejected: counter.rejected };
}
