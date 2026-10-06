/**
 * Workout session engine (W-3, D-034): what the session screen shows and records, as pure functions.
 * It reads the persisted prescription (W-2) and the facts (sets, replacements, exercise reports),
 * never the profile: nothing is recomputed during a session, nothing is invented.
 *
 * - Planned ≠ done: the prescription stays as given; what happened is a separate fact.
 * - A proposed load comes only from the stored prescription; a prefilled load only from a real set.
 * - Exercise status, session result and progress are derived, never stored.
 * - No progression decision here (W-4): the hints only repeat the target or a real number.
 */
import type { IsoDate } from '../shared/dates';
import { parseSessionKey, type SessionKey } from '../shared/ids';
import type { SetUnit, WorkoutTemplate } from './engine';
import { getExercise } from './exercises';
import type { PlannedExercise, TrainingPurpose } from './program';
import type { LoggedSet, ProgressionAction } from './progression';
import type { ReplacementReason } from './replacement';

export type SetLogs = Record<SessionKey, Record<string, LoggedSet[]>>;

/** What the user declared about one exercise of a session (`exercise_reports`). */
export interface ExerciseReport {
  /** "Je ne fais pas cet exercice": the prescription stays, the fact is "not performed". */
  notPerformed?: boolean;
  notPerformedReason?: ReplacementReason;
  /** Felt difficulty of this exercise, 1 very easy … 5 very hard. */
  difficulty?: number;
}
export type ExerciseReports = Record<SessionKey, Record<string, ExerciseReport>>;

/** One exercise of the session as the screen shows it: the prescription, and what replaced it. */
export interface SessionExercise {
  /** `planned_exercises.id`; null off plan (the engine's proposal is not a prescription). */
  plannedId: string | null;
  /** The prescribed exercise (key of reports and swaps). */
  prescribedId: string;
  /** The exercise actually done: the prescribed one or its replacement (key of the sets). */
  exerciseId: string;
  replaced: boolean;
  sets: number;
  repsMin: number;
  repsMax: number;
  unit: SetUnit;
  restSeconds: number;
  targetRpe: number | null;
  /** Proposed load from the stored prescription; never carried over to a replacement. */
  proposedLoadKg: number | null;
  progressionAction: ProgressionAction | 'first_time' | null;
  progressionReason: string | null;
  purpose: TrainingPurpose | null;
  purposeTarget: string | null;
}

/** The exercises of the session, from the stored rows (or the off-plan proposal), after the swaps. */
export function sessionExercises(
  source: { planned: readonly PlannedExercise[] } | { template: WorkoutTemplate },
  swaps: Record<string, string> = {},
): SessionExercise[] {
  const rows =
    'planned' in source
      ? [...source.planned].sort((a, b) => a.position - b.position)
      : source.template.exercises.map((e) => ({
          ...e,
          id: null,
          targetLoadKg: null,
          progressionAction: null,
          progressionReason: null,
          purpose: null,
          purposeTarget: null,
        }));
  return rows.map((r) => {
    const exerciseId = swaps[r.exerciseId] ?? r.exerciseId;
    const replaced = exerciseId !== r.exerciseId;
    return {
      plannedId: r.id,
      prescribedId: r.exerciseId,
      exerciseId,
      replaced,
      sets: r.sets,
      repsMin: r.repsMin,
      repsMax: r.repsMax,
      unit: r.unit,
      restSeconds: r.restSeconds,
      targetRpe: r.targetRpe,
      // A load proposed for one movement says nothing about another one.
      proposedLoadKg: replaced ? null : r.targetLoadKg,
      progressionAction: replaced ? null : r.progressionAction,
      progressionReason: replaced ? null : r.progressionReason,
      purpose: r.purpose,
      purposeTarget: r.purposeTarget,
    };
  });
}

/** A set held in time is stored with `seconds` (and `reps: 0`); older ones only had `reps`. */
export function isTimed(set: LoggedSet): boolean {
  return set.seconds !== undefined;
}

export interface Performance {
  date: IsoDate;
  loadKg: number;
  reps: number | null;
  seconds: number | null;
}

/** Best set of a list: heaviest load, then most reps (or longest hold). */
function bestSet(sets: readonly LoggedSet[]): LoggedSet | null {
  let best: LoggedSet | null = null;
  for (const s of sets) {
    if (!isTimed(s) && s.reps < 1) continue;
    if (
      !best ||
      s.loadKg > best.loadKg ||
      (s.loadKg === best.loadKg && (s.seconds ?? s.reps) > (best.seconds ?? best.reps))
    )
      best = s;
  }
  return best;
}

/**
 * "Dernière fois : 67,5 kg × 10": the best set of the last earlier session with this exercise.
 * Real sets only; null when there is none (never estimated).
 */
export function lastPerformance(setLogs: SetLogs, exerciseId: string, current: SessionKey): Performance | null {
  const before = Object.keys(setLogs)
    .filter((k) => k !== current && k < current && (setLogs[k][exerciseId]?.length ?? 0) > 0)
    .sort();
  for (let i = before.length - 1; i >= 0; i--) {
    const best = bestSet(setLogs[before[i]][exerciseId]);
    if (!best) continue;
    return {
      date: parseSessionKey(before[i]).date,
      loadKg: best.loadKg,
      reps: isTimed(best) ? null : best.reps,
      seconds: isTimed(best) ? (best.seconds ?? null) : null,
    };
  }
  return null;
}

export type PrefillSource = 'previous_set' | 'proposed' | 'last_time' | 'bodyweight' | null;

export interface Prefill {
  /** Null = empty field: the user enters it (a load is never guessed). */
  loadKg: number | null;
  /** Reps or seconds: the previous set of today, else the bottom of the prescribed range. */
  value: number;
  source: PrefillSource;
  /** The prescription planned an increase, but today calls for keeping the load (fatigue, safety). */
  keepLoad: boolean;
}

/**
 * Values the set entry opens with, from reliable data only, in this order: the previous set of
 * this exercise today, the load proposed by the stored prescription, the real load of last time,
 * bodyweight for a movement without load. When the prescription planned an increase and the day's
 * declared fatigue is high or the safety rule asks to slow down, the load of last time is kept
 * (no new progression decision: W-4).
 */
export function prefill(
  ex: SessionExercise,
  today: readonly LoggedSet[],
  last: Performance | null,
  opts: { holdIncrease: boolean },
): Prefill {
  const previous = today.at(-1);
  const bodyweight = (getExercise(ex.exerciseId)?.loadIncrementKg ?? 0) === 0;
  const value = previous ? (isTimed(previous) ? (previous.seconds ?? ex.repsMin) : previous.reps) : ex.repsMin;
  if (previous) return { loadKg: previous.loadKg, value, source: 'previous_set', keepLoad: false };
  const keepLoad = opts.holdIncrease && ex.progressionAction === 'increase_load' && last !== null;
  if (keepLoad) return { loadKg: last!.loadKg, value, source: 'last_time', keepLoad: true };
  if (ex.proposedLoadKg !== null) return { loadKg: ex.proposedLoadKg, value, source: 'proposed', keepLoad: false };
  if (last) return { loadKg: last.loadKg, value, source: 'last_time', keepLoad: false };
  if (bodyweight) return { loadKg: 0, value, source: 'bodyweight', keepLoad: false };
  return { loadKg: null, value, source: null, keepLoad: false };
}

/** A set as entered: load plus reps, or load plus seconds for a hold. Invalid input is refused. */
export function makeSet(
  unit: SetUnit,
  input: { loadKg: number | null | undefined; value: number | null | undefined; rpe?: number },
): LoggedSet | null {
  const value = input.value ?? NaN;
  const loadKg = input.loadKg ?? 0;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) return null;
  if (unit === 'reps' && value > 300) return null;
  if (unit === 'seconds' && value > 3600) return null;
  if (!Number.isFinite(loadKg) || loadKg < 0 || loadKg > 1000) return null;
  const rpe = input.rpe !== undefined && input.rpe >= 1 && input.rpe <= 10 ? input.rpe : undefined;
  const load = Math.round(loadKg * 4) / 4;
  return unit === 'seconds'
    ? { reps: 0, seconds: value, loadKg: load, ...(rpe ? { rpe } : {}) }
    : { reps: value, loadKg: load, ...(rpe ? { rpe } : {}) };
}

/**
 * Optional feel of a set, in words (never a number to pick). Stored as the RPE of the set, on the
 * repetitions-in-reserve scale: about 4 left = 6, 2 left = 8, none left = 10.
 */
export const SET_FEELS = { easy: 6, ok: 8, very_hard: 10 } as const;
export type SetFeel = keyof typeof SET_FEELS;
export function setFeel(rpe: number | undefined): SetFeel | null {
  if (rpe === undefined) return null;
  return rpe >= 9.5 ? 'very_hard' : rpe <= 6.5 ? 'easy' : 'ok';
}

export type ExerciseStatus = 'pending' | 'in_progress' | 'done' | 'not_performed';

/** Derived, never stored: the declared "not performed", else the sets done against the sets planned. */
export function exerciseStatus(
  ex: SessionExercise,
  sets: readonly LoggedSet[],
  report?: ExerciseReport,
): ExerciseStatus {
  if (report?.notPerformed && sets.length === 0) return 'not_performed';
  if (sets.length === 0) return 'pending';
  return sets.length >= ex.sets ? 'done' : 'in_progress';
}

export interface SessionProgress {
  setsDone: number;
  setsPlanned: number;
  exercisesDone: number;
  /** Exercises settled: done or declared not performed. */
  exercisesSettled: number;
  total: number;
  /** First exercise still to do; null when every exercise is settled. */
  current: number | null;
}

export function sessionProgress(
  exercises: readonly SessionExercise[],
  sets: Record<string, LoggedSet[]> = {},
  reports: Record<string, ExerciseReport> = {},
): SessionProgress {
  const statuses = exercises.map((e) => exerciseStatus(e, sets[e.exerciseId] ?? [], reports[e.prescribedId]));
  const current = statuses.findIndex((s) => s === 'pending' || s === 'in_progress');
  return {
    setsDone: exercises.reduce((n, e) => n + Math.min(e.sets, sets[e.exerciseId]?.length ?? 0), 0),
    setsPlanned: exercises.reduce((n, e) => n + e.sets, 0),
    exercisesDone: statuses.filter((s) => s === 'done').length,
    exercisesSettled: statuses.filter((s) => s === 'done' || s === 'not_performed').length,
    total: exercises.length,
    current: current === -1 ? null : current,
  };
}

/**
 * Result of a session (D-034), derived: never "échec". `partial` is a fact (some planned exercises
 * or sets not done), not a judgement. `stopped` = ended early on purpose (with its reason).
 */
export type SessionResult = 'planned' | 'in_progress' | 'completed' | 'partial' | 'stopped' | 'skipped' | 'replaced';

export function sessionResult(input: {
  completed: { stopped?: string } | null;
  outcome: { status: 'skipped' | 'replaced' } | null;
  exercises: readonly SessionExercise[];
  sets: Record<string, LoggedSet[]>;
  reports: Record<string, ExerciseReport>;
}): SessionResult {
  if (input.completed) {
    if (input.completed.stopped) return 'stopped';
    const p = sessionProgress(input.exercises, input.sets, input.reports);
    return p.exercisesDone === p.total ? 'completed' : 'partial';
  }
  if (input.outcome) return input.outcome.status;
  const anySet = Object.values(input.sets).some((s) => s.length > 0);
  const anyReport = Object.keys(input.reports).length > 0;
  return anySet || anyReport ? 'in_progress' : 'planned';
}

export interface SessionSummary {
  /** Opening → end of the session, in minutes; null when the opening was not recorded. */
  minutes: number | null;
  exercisesDone: number;
  exercisesTotal: number;
  sets: number;
  replacements: { fromId: string; toId: string; reason: ReplacementReason | null }[];
  notPerformed: string[];
  /** Real new bests of this session (heavier load, or more reps at a load), from the sets. */
  records: { exerciseId: string; loadKg: number; reps: number; kind: 'load' | 'reps' }[];
}

/** End-of-session summary: real facts only (no calories, no estimate about the body). */
export function sessionSummary(input: {
  key: SessionKey;
  exercises: readonly SessionExercise[];
  setLogs: SetLogs;
  reports: Record<string, ExerciseReport>;
  swapReasons: Record<string, ReplacementReason>;
  openedAt: string | null;
  endedAt: string;
}): SessionSummary {
  const sets = input.setLogs[input.key] ?? {};
  const p = sessionProgress(input.exercises, sets, input.reports);
  const minutes =
    input.openedAt !== null
      ? Math.max(0, Math.round((Date.parse(input.endedAt) - Date.parse(input.openedAt)) / 60_000))
      : null;
  const records: SessionSummary['records'] = [];
  for (const ex of input.exercises) {
    const today = (sets[ex.exerciseId] ?? []).filter((s) => !isTimed(s) && s.reps >= 1);
    if (today.length === 0) continue;
    const before = Object.keys(input.setLogs)
      .filter((k) => k < input.key)
      .flatMap((k) => (input.setLogs[k][ex.exerciseId] ?? []).filter((s) => !isTimed(s) && s.reps >= 1));
    if (before.length === 0) continue; // a first time is not a record
    const maxLoad = Math.max(...before.map((s) => s.loadKg));
    const top = bestSet(today)!;
    if (top.loadKg > maxLoad) {
      records.push({ exerciseId: ex.exerciseId, loadKg: top.loadKg, reps: top.reps, kind: 'load' });
      continue;
    }
    const repsBefore = Math.max(-1, ...before.filter((s) => s.loadKg >= top.loadKg).map((s) => s.reps));
    const bestAtLoad = today.filter((s) => s.loadKg === top.loadKg).reduce((m, s) => Math.max(m, s.reps), 0);
    if (repsBefore >= 0 && bestAtLoad > repsBefore)
      records.push({ exerciseId: ex.exerciseId, loadKg: top.loadKg, reps: bestAtLoad, kind: 'reps' });
  }
  return {
    minutes,
    exercisesDone: p.exercisesDone,
    exercisesTotal: p.total,
    sets: Object.values(sets).reduce((n, s) => n + s.length, 0),
    replacements: input.exercises
      .filter((e) => e.replaced)
      .map((e) => ({ fromId: e.prescribedId, toId: e.exerciseId, reason: input.swapReasons[e.prescribedId] ?? null })),
    notPerformed: input.exercises
      .filter((e) => exerciseStatus(e, sets[e.exerciseId] ?? [], input.reports[e.prescribedId]) === 'not_performed')
      .map((e) => e.prescribedId),
    records,
  };
}

/** What the replace flow says and offers for a reason (D-034). */
export interface ReplacementAdvice {
  /** Message key under `workout.advice`, or null. */
  note: 'discomfort' | 'technique' | 'one_off' | 'preference' | null;
  /** Show the cues of the exercise before the alternatives (unknown technique). */
  showCues: boolean;
  /** Offer to skip the exercise and to end the session (a movement that bothers). */
  offerStop: boolean;
}

export function replacementAdvice(reason: ReplacementReason): ReplacementAdvice {
  switch (reason) {
    case 'discomfort':
      // Never "continue anyway": replace, skip this exercise, or end the session. No diagnosis.
      return { note: 'discomfort', showCues: false, offerStop: true };
    case 'cant_do':
      return { note: 'technique', showCues: true, offerStop: false };
    case 'busy_equipment':
    case 'no_equipment':
      return { note: 'one_off', showCues: false, offerStop: false };
    case 'preference':
    case 'dislike':
      return { note: 'preference', showCues: false, offerStop: false };
    default:
      return { note: null, showCues: false, offerStop: false };
  }
}

/** Reasons shown in the replace flow (the others stay readable in history). */
export const SHOWN_REPLACEMENT_REASONS = [
  'busy_equipment',
  'discomfort',
  'cant_do',
  'too_hard_today',
  'no_equipment',
  'no_time',
  'preference',
  'other',
] as const satisfies readonly ReplacementReason[];

/** "Pourquoi cet exercice ?": the structured purpose of the stored row (never generated text). */
export function whyKey(ex: SessionExercise): { key: string; target: string | null } | null {
  if (!ex.purpose) return null;
  return { key: `workout.why.${ex.purpose}`, target: ex.purposeTarget };
}

export type CoachHint =
  | { key: 'target'; params: { min: number; max: number } }
  | { key: 'last_time'; params: { reps: number } }
  | { key: 'last_time_seconds'; params: { seconds: number } }
  | { key: 'keep_load'; params: Record<string, never> }
  | { key: 'very_hard'; params: Record<string, never> };

/**
 * One discreet line under the current exercise: the target, what the user did last time, or after a
 * very hard set that keeping the load is fine. No new progression decision (W-4).
 */
export function coachHint(
  ex: SessionExercise,
  today: readonly LoggedSet[],
  last: Performance | null,
  pre: Prefill,
): CoachHint {
  const previous = today.at(-1);
  if (previous && (previous.rpe ?? 0) >= 9.5) return { key: 'very_hard', params: {} };
  if (!previous && pre.keepLoad) return { key: 'keep_load', params: {} };
  if (!previous && last) {
    if (last.seconds !== null) return { key: 'last_time_seconds', params: { seconds: last.seconds } };
    if (last.reps !== null) return { key: 'last_time', params: { reps: last.reps } };
  }
  return { key: 'target', params: { min: ex.repsMin, max: ex.repsMax } };
}

/* ------------------------------------------------------------------------------------------------
 * Rest timer: pure state over timestamps, so it keeps counting while the screen changes or sleeps.
 * ---------------------------------------------------------------------------------------------- */

export interface RestTimer {
  /** Epoch ms when the rest ends; null while paused. */
  endsAt: number | null;
  /** Remaining ms while paused. */
  pausedMs: number | null;
  totalMs: number;
}

export const REST_EXTEND_SECONDS = 30;

export function startRest(now: number, seconds: number): RestTimer {
  const ms = Math.max(0, Math.round(seconds)) * 1000;
  return { endsAt: now + ms, pausedMs: null, totalMs: ms };
}

export function restRemaining(t: RestTimer, now: number): number {
  const ms = t.endsAt !== null ? t.endsAt - now : (t.pausedMs ?? 0);
  return Math.max(0, Math.ceil(ms / 1000));
}

export function extendRest(t: RestTimer, now: number, seconds = REST_EXTEND_SECONDS): RestTimer {
  const add = seconds * 1000;
  if (t.endsAt === null) return { ...t, pausedMs: (t.pausedMs ?? 0) + add, totalMs: t.totalMs + add };
  // Extending a rest that already ended starts a new one from now.
  const base = Math.max(t.endsAt, now);
  return { ...t, endsAt: base + add, totalMs: t.totalMs + add + (base - t.endsAt) };
}

export function pauseRest(t: RestTimer, now: number): RestTimer {
  if (t.endsAt === null) return t;
  return { ...t, endsAt: null, pausedMs: Math.max(0, t.endsAt - now) };
}

export function resumeRest(t: RestTimer, now: number): RestTimer {
  if (t.endsAt !== null) return t;
  return { ...t, endsAt: now + (t.pausedMs ?? 0), pausedMs: null };
}
