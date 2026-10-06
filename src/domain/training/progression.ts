/**
 * Progression Engine v2 (W-4, D-035, docs/TRAINING_PROGRESSION.md): real sessions → a cautious,
 * explainable recommendation for the next prescription of one exercise. Pure and deterministic.
 *
 * - Only what was measured or declared: sets (reps or seconds, loads), felt difficulty, the
 *   variant done, declared fatigue that day, sessions stopped early, exercises not performed and
 *   why. Nothing missing is guessed: no history, no recommendation.
 * - A recommendation is never a fact. It is frozen into a *future* prescription only (week.ts);
 *   the past is never rewritten.
 * - One session never decides a big change: a load goes up after confirmed sessions, down after
 *   repeated misses; a single bad session is retried.
 * - Short and light sessions are read for what they are: short is never a sign of weakness, light
 *   is never a sign of regression or stagnation.
 * - The context of today (safety, fatigue, protected profile) is applied by the Adaptation Engine
 *   (`journey/adaptation.ts` `gateProgression`), never here: one safety engine, one decision layer.
 */
import { daysBetween, type IsoDate } from '../shared/dates';
import type { SessionKey } from '../shared/ids';
import type { SessionVariant } from './adapt';
import type { SetUnit } from './engine';
import { getExercise } from './exercises';
import type { ReplacementReason } from './replacement';

export interface LoggedSet {
  /** Repetitions; 0 for a set held in time (then `seconds` is set). */
  reps: number;
  loadKg: number;
  /** Rate of perceived exertion 1–10, optional. */
  rpe?: number;
  /** Duration of a set held in time (W-3); absent for a set counted in repetitions. */
  seconds?: number;
}

/**
 * Design parameters of the progression (one place, no magic number elsewhere). Every value marked
 * [relire] is a coaching choice to be reviewed by a professional, like those of D-024/D-026/D-028.
 */
export const PROGRESSION = {
  /** History read for one exercise: one 6-week cycle. [relire] */
  windowDays: 42,
  /** Comparable sessions before any increase (one session is a first reading). [relire] */
  minSessionsToIncrease: 2,
  /** Sessions at the top of the range, in a row and at the same load, before a load increase. [relire] */
  confirmations: 2,
  /** Full sessions under the range among the last `missWindow` before a load decrease. [relire] */
  missesForReduce: 2,
  missWindow: 3,
  /** A decrease is one increment of the equipment, never more. [relire] */
  reduceSteps: 1,
  /** A hold progresses by this many seconds, up to the top of its range. [relire] */
  holdStepSeconds: 5,
  /** Felt difficulty (1–5) that makes a session "very hard". [relire] */
  hardDifficulty: 5,
  /** RPE of a set marked "Très difficile" (W-3 stores 10). [relire] */
  hardRpe: 9.5,
  /** Stagnation: comparable full sessions, spread over at least this many days, adherence. [relire] */
  plateauSessions: 4,
  plateauMinDays: 21,
  plateauMinAdherence: 0.7,
  /** Downward trend: this many comparable sessions in a row, each below the previous one. [relire] */
  trendSessions: 3,
  /** Evidence listed in a recommendation (the most recent sessions). */
  evidenceShown: 4,
} as const;

/**
 * What the next prescription does for an exercise. Few actions on purpose: keeping the load, a
 * retry and slow progress are normal results, not failures (anti-obsession).
 */
export const PROGRESSION_ACTIONS = [
  'increase_load',
  'increase_reps',
  'maintain',
  'retry',
  'reduce_load',
  'no_recommendation',
] as const;
export type ProgressionAction = (typeof PROGRESSION_ACTIONS)[number];
/** Actions stored by W-2 prescriptions before W-4: still read in history, never produced. */
export const LEGACY_PROGRESSION_ACTIONS = ['add_reps', 'keep', 'deload', 'first_time'] as const;
export type LegacyProgressionAction = (typeof LEGACY_PROGRESSION_ACTIONS)[number];

/** How much real history the recommendation stands on (1 session = low, never an increase alone). */
export const PROGRESSION_CONFIDENCES = ['insufficient', 'low', 'medium', 'high'] as const;
export type ProgressionConfidence = (typeof PROGRESSION_CONFIDENCES)[number];

/** One session where the exercise was really done, with what was prescribed and declared. */
export interface Exposure {
  key: SessionKey;
  date: IsoDate;
  /** Variant done; `off_plan` for a day without prescription. */
  variant: SessionVariant | 'off_plan';
  /** The row it was done under that day; null off plan, before W-1 or as a replacement. */
  prescribed: { sets: number; repsMin: number; repsMax: number; loadKg: number | null } | null;
  sets: readonly LoggedSet[];
  exerciseDifficulty: number | null;
  sessionDifficulty: number | null;
  /** Fatigue declared that day (Journey check-in): a lower result is explained, not a regression. */
  fatigueHigh: boolean;
  /** Session ended early, with its reason (no_time, tired, pain, other). */
  stopped: string | null;
}

/** A session where the exercise was planned but not done: declared not performed, or replaced. */
export interface NotDone {
  key: SessionKey;
  date: IsoDate;
  kind: 'not_performed' | 'replaced';
  reason: ReplacementReason | null;
}

/** What an exposure says, against the range prescribed for it. */
export interface ExposureReading {
  date: IsoDate;
  variant: Exposure['variant'];
  loadKg: number;
  /** Load the prescription proposed that day (a planned decrease is not a drop). */
  prescribedLoadKg: number | null;
  /** Reps (or seconds) of the sets at the working load. */
  values: number[];
  difficulty: number | null;
  /** Every prescribed set at the top of the range, without a very hard effort. */
  solid: boolean;
  top: boolean;
  hard: boolean;
  /** A set under the bottom of the range (only counts against in a full, unexplained session). */
  miss: boolean;
  /** Read neither for nor against: short not completed, stopped early, fatigue declared, light. */
  neutral: 'short' | 'light' | 'stopped' | 'fatigue' | null;
}

export interface PrescriptionShape {
  sets: number;
  repsMin: number;
  repsMax: number;
  unit: SetUnit;
  loadKg: number | null;
}

export interface ProgressionRecommendation {
  exerciseId: string;
  action: ProgressionAction;
  /** Translation key under `reasons.` and its parameters, all taken from the evidence. */
  reason: { key: string; params: Record<string, number | string> };
  confidence: ProgressionConfidence;
  /** What the last session was prescribed (or the current range when unknown). */
  previousPrescription: PrescriptionShape;
  /** What the next prescription proposes; `target` = reps (or seconds) to aim for. */
  proposedPrescription: PrescriptionShape & { target: number };
  evidence: {
    used: Pick<ExposureReading, 'date' | 'variant' | 'loadKg' | 'values' | 'difficulty'>[];
    excluded: { date: IsoDate; why: string }[];
    confirmations: number;
    misses: number;
    /** What "keep the load" means: the last real working load and its lowest value. */
    last: { loadKg: number; value: number } | null;
  };
  /** Set by the Adaptation Engine when today's context held an increase back. */
  blockedBy?: 'safety' | 'fatigue' | 'protected';
  signals: { stagnation: Stagnation; trend: 'down' | null };
}

export interface Stagnation {
  active: boolean;
  /** Why it is not called a plateau. */
  notBecause?: 'not_enough_data' | 'low_adherence' | 'fatigue' | 'moving';
  sessions?: number;
  days?: number;
}

const value = (s: LoggedSet) => (s.seconds !== undefined ? s.seconds : s.reps);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Reads one exposure against its range. */
export function readExposure(e: Exposure, range: { sets: number; repsMin: number; repsMax: number }): ExposureReading {
  const min = e.prescribed?.repsMin ?? range.repsMin;
  const max = e.prescribed?.repsMax ?? range.repsMax;
  const planned = e.prescribed?.sets ?? range.sets;
  const done = e.sets.filter((s) => value(s) >= 1);
  const loadKg = done.length > 0 ? Math.max(...done.map((s) => s.loadKg)) : 0;
  const work = done.filter((s) => s.loadKg === loadKg);
  const values = work.map(value);
  const difficulty = e.exerciseDifficulty ?? e.sessionDifficulty;
  const hard = (difficulty ?? 0) >= PROGRESSION.hardDifficulty || work.some((s) => (s.rpe ?? 0) >= PROGRESSION.hardRpe);
  const top = work.length >= planned && values.length > 0 && values.every((v) => v >= max);
  const miss = values.some((v) => v < min);
  let neutral: ExposureReading['neutral'] = null;
  if (e.variant === 'light') neutral = 'light';
  // Stopped for a movement that hurt: never read as a success; stopped for time: only what was done.
  else if (e.stopped === 'pain' || (e.stopped && !top)) neutral = 'stopped';
  else if (e.variant === 'short' && !top) neutral = 'short';
  else if (e.fatigueHigh && !top) neutral = 'fatigue';
  return {
    date: e.date,
    variant: e.variant,
    loadKg,
    prescribedLoadKg: e.prescribed?.loadKg ?? null,
    values,
    difficulty,
    solid: top && !hard,
    top,
    hard,
    miss,
    neutral,
  };
}

const better = (a: ExposureReading, b: ExposureReading) =>
  b.loadKg > a.loadKg || (b.loadKg === a.loadKg && Math.max(...b.values) > Math.max(...a.values));

/**
 * Stagnation, never on a few days: enough comparable full sessions over three weeks or more, with
 * enough regularity, none of them light, short or under declared fatigue, and none beating the
 * first one. Otherwise it is not called a plateau, and why.
 */
export function stagnation(readings: readonly ExposureReading[], adherence: number | null): Stagnation {
  const full = readings.filter((r) => r.neutral === null && r.values.length > 0);
  if (full.length < PROGRESSION.plateauSessions) return { active: false, notBecause: 'not_enough_data' };
  const days = daysBetween(full[0].date, full.at(-1)!.date);
  if (days < PROGRESSION.plateauMinDays) return { active: false, notBecause: 'not_enough_data' };
  if (adherence === null || adherence < PROGRESSION.plateauMinAdherence)
    return { active: false, notBecause: 'low_adherence' };
  const fatigued = readings.filter((r) => r.neutral === 'fatigue').length;
  if (fatigued * 2 >= readings.length) return { active: false, notBecause: 'fatigue' };
  const [first, ...rest] = full;
  if (rest.some((r) => better(first, r))) return { active: false, notBecause: 'moving' };
  return { active: true, sessions: full.length, days };
}

/**
 * Below the previous session: fewer reps (or seconds) at the same load, or a lower load that was
 * not the one prescribed (a planned decrease is a choice, not a drop).
 */
const below = (r: ExposureReading, previous: ExposureReading) =>
  r.loadKg === previous.loadKg
    ? Math.max(...r.values) < Math.max(...previous.values)
    : r.loadKg < previous.loadKg && r.prescribedLoadKg !== r.loadKg;

/** A trend, never one session: the last comparable sessions each below the previous one. */
export function downwardTrend(readings: readonly ExposureReading[]): boolean {
  const full = readings.filter((r) => r.neutral === null && r.values.length > 0).slice(-PROGRESSION.trendSessions);
  if (full.length < PROGRESSION.trendSessions) return false;
  return full.every((r, i) => i === 0 || below(r, full[i - 1]));
}

const confidenceOf = (n: number): ProgressionConfidence =>
  n === 0 ? 'insufficient' : n === 1 ? 'low' : n < PROGRESSION.plateauSessions ? 'medium' : 'high';

/**
 * The recommendation for the next prescription of one exercise, from its own history only (a
 * replacement's sets belong to the replacement, never to the exercise it replaced).
 */
export function recommendProgression(input: {
  exerciseId: string;
  /** Range of the next prescription (the session being prescribed). */
  range: { sets: number; repsMin: number; repsMax: number; unit: SetUnit };
  /** Sessions where it was done, oldest first, all before the session being prescribed. */
  exposures: readonly Exposure[];
  notDone?: readonly NotDone[];
  /** Planned sessions done / planned over the window (journey adherence), null when unknown. */
  adherence?: number | null;
}): ProgressionRecommendation {
  const { exerciseId, range } = input;
  const increment = getExercise(exerciseId)?.loadIncrementKg;
  const step = range.unit === 'seconds' ? PROGRESSION.holdStepSeconds : 1;
  const readings = input.exposures.map((e) => readExposure(e, range));
  const decisive = readings.filter((r) => r.neutral === null && r.values.length > 0);
  const lastAny = readings.at(-1) ?? null;
  const lastExposure = input.exposures.at(-1) ?? null;
  const last = decisive.at(-1) ?? null;
  const misses = decisive.slice(-PROGRESSION.missWindow).filter((r) => r.miss).length;
  let confirmations = 0;
  if (last) {
    for (let i = decisive.length - 1; i >= 0 && decisive[i].solid && decisive[i].loadKg === last.loadKg; i--)
      confirmations++;
  }
  const previous: PrescriptionShape = {
    sets: lastExposure?.prescribed?.sets ?? range.sets,
    repsMin: lastExposure?.prescribed?.repsMin ?? range.repsMin,
    repsMax: lastExposure?.prescribed?.repsMax ?? range.repsMax,
    unit: range.unit,
    loadKg: lastExposure?.prescribed?.loadKg ?? null,
  };
  const reference = last ?? lastAny;
  const lastValue = reference && reference.values.length > 0 ? Math.min(...reference.values) : null;
  const evidence: ProgressionRecommendation['evidence'] = {
    used: decisive
      .slice(-PROGRESSION.evidenceShown)
      .map(({ date, variant, loadKg, values, difficulty }) => ({ date, variant, loadKg, values, difficulty })),
    excluded: [
      ...readings.filter((r) => r.neutral !== null).map((r) => ({ date: r.date, why: r.neutral! })),
      ...(input.notDone ?? []).map((n) => ({ date: n.date, why: `${n.kind}:${n.reason ?? 'none'}` })),
    ].sort((a, b) => a.date.localeCompare(b.date)),
    confirmations,
    misses,
    last: reference && lastValue !== null ? { loadKg: reference.loadKg, value: lastValue } : null,
  };
  const signals = {
    stagnation: stagnation(readings, input.adherence ?? null),
    trend: downwardTrend(readings) ? ('down' as const) : null,
  };
  const make = (
    action: ProgressionAction,
    loadKg: number | null,
    target: number,
    key: string,
    params: Record<string, number | string> = {},
  ): ProgressionRecommendation => ({
    exerciseId,
    action,
    reason: { key: `progression.reason.${key}`, params },
    confidence: confidenceOf(decisive.length),
    previousPrescription: previous,
    proposedPrescription: {
      sets: range.sets,
      repsMin: range.repsMin,
      repsMax: range.repsMax,
      unit: range.unit,
      loadKg: loadKg === null ? null : Math.max(0, Math.round(loadKg * 4) / 4),
      target: clamp(Math.round(target), range.repsMin, range.repsMax),
    },
    evidence,
    signals,
  });
  // A load is proposed only when it exists in reality (bodyweight = 0 is not a load to show).
  const keep = (r: ExposureReading) => (r.loadKg > 0 ? r.loadKg : null);

  if (!last) {
    if (lastAny) {
      // Only light, short-not-finished, stopped or tired sessions: they say nothing against the
      // load. It is kept as really done, except a light day's (lighter on purpose): its prescribed
      // load, else none (the session shows last time's real load).
      const real = [...readings].reverse().find((r) => r.neutral !== 'light');
      const load = real ? keep(real) : (lastExposure?.prescribed?.loadKg ?? null);
      const value = real && real.values.length > 0 ? Math.min(...real.values) : range.repsMin;
      return make('maintain', load, value, `context_${lastAny.neutral}`);
    }
    return make('no_recommendation', null, range.repsMin, input.notDone?.length ? 'not_done' : 'no_history');
  }

  // A movement that bothered, or "too hard today", since the last real session: no increase.
  const since = (input.notDone ?? []).filter((n) => n.date >= last.date);
  const painStop = input.exposures.some((e) => e.date >= last.date && e.stopped === 'pain');
  const caution = painStop
    ? 'discomfort'
    : (since.find((n) => n.reason === 'discomfort') ?? since.find((n) => n.reason === 'too_hard_today'))?.reason;

  if (last.miss) {
    if (misses >= PROGRESSION.missesForReduce && increment && last.loadKg > 0) {
      const to = Math.max(0, last.loadKg - increment * PROGRESSION.reduceSteps);
      return make('reduce_load', to, range.repsMin, 'repeated_misses', { sessions: misses, min: range.repsMin });
    }
    if (misses >= PROGRESSION.missesForReduce)
      return make('maintain', keep(last), range.repsMin, 'consolidate', { min: range.repsMin });
    return make('retry', keep(last), range.repsMin, 'single_miss', { min: range.repsMin });
  }
  // A later session explained by its context (fatigue, stop, short) that still went under the
  // range or felt very hard: it does not count against, but nothing goes up on top of it.
  const shaky = readings.find(
    (r) => r.date > last.date && r.neutral !== null && r.neutral !== 'light' && (r.miss || r.hard),
  );
  if (shaky) {
    return make('maintain', keep(last), Math.min(...shaky.values), `context_${shaky.neutral}`);
  }
  if (caution) {
    return make('maintain', keep(last), lastValue!, caution === 'discomfort' ? 'recent_discomfort' : 'recent_too_hard');
  }
  // One real session is a first reading, not a trend: the same goal again, nothing goes up yet.
  if (decisive.length < PROGRESSION.minSessionsToIncrease) {
    return make('maintain', keep(last), last.top ? range.repsMax : lastValue!, 'first_reading');
  }
  if (last.solid) {
    if (confirmations >= PROGRESSION.confirmations) {
      if (increment && increment > 0) {
        return make('increase_load', last.loadKg + increment, range.repsMin, 'top_confirmed', {
          sessions: confirmations,
          max: range.repsMax,
          increment,
        });
      }
      // Bodyweight (or a load the catalogue does not know): no invented load; the range is reached.
      const key = increment === undefined ? 'no_increment' : range.unit === 'seconds' ? 'hold_top' : 'bodyweight_top';
      return make('maintain', keep(last), range.repsMax, key, { max: range.repsMax });
    }
    return make('maintain', keep(last), range.repsMax, 'confirm_top', { max: range.repsMax });
  }
  if (last.hard) return make('maintain', keep(last), lastValue!, 'hard_effort');
  const target = Math.min(range.repsMax, lastValue! + step);
  return make('increase_reps', keep(last), target, range.unit === 'seconds' ? 'hold_longer' : 'add_rep', { target });
}
