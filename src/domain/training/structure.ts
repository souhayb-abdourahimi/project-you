/**
 * Structural adaptations of the Workout Coach (W-5, D-037): what an accepted change does to the
 * sessions, and the training facts the Adaptation Engine reads to propose one. Pure functions.
 *
 * - A structural change is never applied without the user's explicit "yes" (D-036): this module
 *   only reads decisions already taken (`adjustments`), it never decides.
 * - Every change has a known end (scope): a week, some weeks, some sessions, or durable (then a new
 *   program version, `week.ts`). Temporary changes become new prescriptions of the sessions not
 *   started yet, linked to their decision (`workout_sessions.adjustment_id`); the past is never
 *   rewritten (D-033).
 * - Relations between exercises come from the catalogue (`EASIER_VARIANTS`), never from a name.
 */
import { appliedDecisions, byInstant, effectiveDecisions, type Adjustment } from '../journey/adjustments';
import type { Equipment } from '../profile/schemas';
import { addDays, daysBetween, type IsoDate } from '../shared/dates';
import { parseSessionKey, type SessionKey } from '../shared/ids';
import { estimateMinutes, generateWorkoutPlan, type PrescribedExercise, type WorkoutTemplate } from './engine';
import { easierVariants, getExercise, isAvailable } from './exercises';
import type { PrescribedSession, ProgramParams, ProgramVersion } from './program';
import type { VersionDecisions } from './week';
import type { ReplacementReason } from './replacement';

/**
 * Design parameters of the structural adaptations (one place). Every value marked [relire] is a
 * coaching choice to be reviewed by a professional, like those of D-024/D-026/D-028/D-035.
 */
export const STRUCTURE = {
  /** A light week lasts 7 days from the day it is accepted. [relire] */
  lightWeekDays: 7,
  /** Reduced volume: 2 weeks, one set fewer per exercise, never under 2 sets. [relire] */
  reduceVolumeDays: 14,
  volumeStep: 1,
  minSets: 2,
  /** Easier variant: for the next 2 sessions with the exercise, 3 weeks at most. [relire] */
  easierSessions: 2,
  easierMaxDays: 21,
  /** Restart after a break: 2 sessions with one set fewer, one load step lower, effort ≤ 7. [relire] */
  restartSessions: 2,
  restartMaxDays: 14,
  restartRpe: 7,
  /** A break: no session done for 14 days, after at least 2 sessions. [relire] */
  breakDays: 14,
  breakMinSessionsBefore: 2,
  /** Same reason on this many different sessions before a question about an exercise. [relire] */
  repeat: 2,
  /** Struggling: under the range in 3 of the last 4 full sessions of the exercise. [relire] */
  strugglingWindow: 4,
  strugglingMisses: 3,
  /** Incomplete: sets missing on 2+ exercises in 2 of the last 3 full sessions (not for time). [relire] */
  incompleteWindow: 3,
  incompleteSessions: 2,
  incompleteExercises: 2,
  /** Repeated fatigue: a light week needs at least 2 full sessions in the last 14 days. [relire] */
  fatigueFullSessions: 2,
  /** A plateau that lasts: no better session for 5 weeks. [relire] */
  persistentStagnationDays: 35,
  /** After "Refuser": not proposed again for 4 weeks; after "Pas maintenant": 1 week. [relire] */
  declineCooldownDays: 28,
  postponeDays: 7,
  /** After a change ended, the same change waits 2 weeks (time to see its effect). [relire] */
  reapplyGapDays: 14,
  /** One grouped proposal lists at most 3 exercises (one confirmation, never ten). */
  maxGrouped: 3,
  /** Facts read for a signal (one 6-week cycle). */
  historyDays: 42,
} as const;

/** Every change that needs the user's "yes" (D-036), in the order the Daily Coach prefers them. */
export const STRUCTURAL_CHANGES = [
  'light_week',
  'restart',
  'reduce_volume',
  'easier_variant',
  'exercise_change',
  'cycle_review',
  'sessions_per_week',
] as const;
export type StructuralChange = (typeof STRUCTURAL_CHANGES)[number];

export function isStructural(key: string): key is StructuralChange {
  return (STRUCTURAL_CHANGES as readonly string[]).includes(key);
}

/** End-of-cycle options: continue as is, a light week, or a small evolution (new version). */
export const CYCLE_OPTIONS = ['continue', 'light_week', 'evolve'] as const;
export type CycleOption = (typeof CYCLE_OPTIONS)[number];

/** Exercise ids held in a decision value ("bench_press,pull_up"). */
export function idList(value: number | string | null | undefined): string[] {
  return typeof value === 'string' && value.length > 0 ? value.split(',') : [];
}

type Records = Pick<
  { prescriptions: Record<string, PrescribedSession>; sessionIds: Record<SessionKey, string> },
  'prescriptions' | 'sessionIds'
>;

/** Sessions completed under each decision (a `sessions` scope ends when enough are done). */
export function sessionsDoneUnder(
  records: Records,
  completed: readonly { date: IsoDate; sessionIndex: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of completed) {
    const id = records.sessionIds[`${c.date}#${c.sessionIndex}`];
    const adjustmentId = id ? records.prescriptions[id]?.adjustmentId : null;
    if (adjustmentId) out[adjustmentId] = (out[adjustmentId] ?? 0) + 1;
  }
  return out;
}

/** What a decision changes in the sessions (an end-of-cycle light week is a light week). */
export function structureKey(d: Pick<Adjustment, 'changeKey' | 'to'>): StructuralChange | null {
  if (d.changeKey === 'cycle_review') return d.to === 'light_week' ? 'light_week' : null;
  return isStructural(d.changeKey) ? d.changeKey : null;
}

/** Last day an applied decision covers (a light week decided before W-5 lasts 7 days). */
export function lastDay(d: Adjustment): IsoDate | null {
  if (d.effectiveTo) return d.effectiveTo;
  if (structureKey(d) === 'light_week') return addDays(d.effectiveFrom, STRUCTURE.lightWeekDays - 1);
  return null;
}

/** True when an applied decision covers a date (and its sessions are not all done yet). */
export function covers(d: Adjustment, date: IsoDate, done: Record<string, number> = {}): boolean {
  const to = lastDay(d);
  if (date < d.effectiveFrom || (to !== null && date > to)) return false;
  return !(d.scope === 'sessions' && d.sessionCount && (done[d.id] ?? 0) >= d.sessionCount);
}

export interface StructureOfDay {
  lightWeek: Adjustment | null;
  /** Restart or reduced volume (restart first): fewer sets for every exercise. */
  volume: Adjustment | null;
  easier: Adjustment[];
}

/** The temporary structures in force on a date, from the decisions in force (latest per proposal). */
export function structureOn(
  adjustments: readonly Adjustment[],
  date: IsoDate,
  done: Record<string, number> = {},
): StructureOfDay {
  const active = appliedDecisions(adjustments).filter((d) => covers(d, date, done));
  const of = (key: StructuralChange) => active.filter((d) => structureKey(d) === key);
  return {
    lightWeek: of('light_week').at(-1) ?? null,
    volume: of('restart').at(-1) ?? of('reduce_volume').at(-1) ?? null,
    easier: of('easier_variant'),
  };
}

/** A prescribed exercise standing in for another one (easier variant): the row keeps its target. */
export type ShapedExercise = PrescribedExercise & { standsFor?: string };

/**
 * The full template of a session under the structures of its day (D-037):
 * - easier variant: the exercise is replaced by the catalogue's easier variant, same sets and
 *   range, when the version's equipment allows it and it is not excluded;
 * - restart / reduced volume: one set fewer per exercise, never under `minSets` (restart also
 *   caps the target effort);
 * - light week: nothing here (the light variant of the day and the progression gate carry it).
 * Returns the decision the new prescription follows (null when nothing changed).
 */
export function shapeTemplate(
  template: WorkoutTemplate,
  day: StructureOfDay,
  ctx: { equipment: readonly Equipment[]; excluded: readonly string[] },
): { template: WorkoutTemplate; adjustmentId: string | null } {
  let exercises: ShapedExercise[] = template.exercises.map((e) => ({ ...e }));
  let adjustmentId: string | null = null;
  for (const d of day.easier) {
    const from = idList(d.from);
    const to = idList(d.to);
    from.forEach((x, i) => {
      const y = getExercise(to[i] ?? '');
      const at = exercises.findIndex((e) => e.exerciseId === x);
      if (at < 0 || !y || !isAvailable(y, ctx.equipment) || ctx.excluded.includes(y.id)) return;
      if (exercises.some((e) => e.exerciseId === y.id)) return;
      exercises = exercises.map((e, j) => (j === at ? { ...e, exerciseId: y.id, standsFor: x, alternatives: [] } : e));
      adjustmentId ??= d.id;
    });
  }
  const volume = day.volume;
  if (volume) {
    const restart = structureKey(volume) === 'restart';
    const reduced = exercises.map((e) => ({
      ...e,
      sets: e.sets > STRUCTURE.minSets ? Math.max(STRUCTURE.minSets, e.sets - STRUCTURE.volumeStep) : e.sets,
      ...(restart ? { targetRpe: Math.min(e.targetRpe, STRUCTURE.restartRpe) } : {}),
    }));
    const changed = reduced.some((e, i) => e.sets !== exercises[i].sets || e.targetRpe !== exercises[i].targetRpe);
    // A restart is a restart even when the sets already are at the minimum (the loads are lower).
    if (changed || restart) adjustmentId = volume.id;
    exercises = reduced;
  }
  if (adjustmentId === null) return { template, adjustmentId: null };
  return { template: { ...template, exercises, estimatedMinutes: estimateMinutes(exercises) }, adjustmentId };
}

/**
 * The easier variant the catalogue knows for an exercise, available with this equipment and not
 * excluded; null when there is none (nothing is invented).
 */
export function easierVariantFor(
  exerciseId: string,
  ctx: { equipment: readonly Equipment[]; excluded: readonly string[] },
): string | null {
  return (
    easierVariants(exerciseId).find((e) => isAvailable(e, ctx.equipment) && !ctx.excluded.includes(e.id))?.id ?? null
  );
}

/**
 * Why an exercise was replaced or not performed, by what it may mean for the program (D-037 §9):
 * - temporary (busy machine, missing equipment, no time, other): never changes the program;
 * - preference, too_hard (technique not mastered, too hard): may become durable after a question;
 * - safety (discomfort): a question to stop proposing it, never a diagnosis.
 */
export const REASON_CATEGORY: Record<ReplacementReason, 'temporary' | 'preference' | 'too_hard' | 'safety' | 'none'> = {
  busy_equipment: 'temporary',
  no_equipment: 'temporary',
  no_time: 'temporary',
  other: 'temporary',
  preference: 'preference',
  dislike: 'preference',
  cant_do: 'too_hard',
  too_hard_today: 'too_hard',
  easier: 'too_hard',
  discomfort: 'safety',
  harder: 'none',
};
export type ReasonCategory = (typeof REASON_CATEGORY)[ReplacementReason];

export interface ExercisePattern {
  exerciseId: string;
  category: ReasonCategory;
  /** Different sessions where it happened, oldest first. */
  keys: SessionKey[];
}

/** Replacements and exercises not performed, grouped by exercise and meaning, over the window. */
export function exercisePatterns(
  facts: {
    swapReasons?: Record<SessionKey, Record<string, ReplacementReason>>;
    exerciseReports?: Record<
      SessionKey,
      Record<string, { notPerformed?: boolean; notPerformedReason?: ReplacementReason | null }>
    >;
  },
  today: IsoDate,
): ExercisePattern[] {
  const from = addDays(today, -STRUCTURE.historyDays);
  const seen = new Map<string, Set<SessionKey>>();
  const add = (key: SessionKey, exerciseId: string, reason: ReplacementReason | null | undefined) => {
    const { date } = parseSessionKey(key);
    if (!reason || date < from || date > today) return;
    const category = REASON_CATEGORY[reason];
    if (!category || category === 'none') return;
    const id = `${exerciseId}|${category}`;
    seen.set(id, (seen.get(id) ?? new Set()).add(key));
  };
  for (const [key, swaps] of Object.entries(facts.swapReasons ?? {}))
    for (const [exerciseId, reason] of Object.entries(swaps)) add(key, exerciseId, reason);
  for (const [key, reports] of Object.entries(facts.exerciseReports ?? {}))
    for (const [exerciseId, r] of Object.entries(reports))
      if (r.notPerformed) add(key, exerciseId, r.notPerformedReason);
  return [...seen.entries()]
    .map(([id, keys]) => {
      const [exerciseId, category] = id.split('|') as [string, ReasonCategory];
      return { exerciseId, category, keys: [...keys].sort() };
    })
    .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId) || a.category.localeCompare(b.category));
}

/** The last session done before today, how long ago, and how many were done before it. */
export function trainingBreak(
  completed: readonly { date: IsoDate }[],
  today: IsoDate,
): { lastDate: IsoDate; days: number; sessionsBefore: number } | null {
  const past = completed
    .map((c) => c.date)
    .filter((d) => d < today)
    .sort();
  const lastDate = past.at(-1);
  return lastDate ? { lastDate, days: daysBetween(lastDate, today), sessionsBefore: past.length } : null;
}

/** Where the active version is in its cycle; a cycle restarts after each end-of-cycle answer. */
export function cycleState(
  program: Pick<ProgramVersion, 'effectiveFrom' | 'cycleWeeks' | 'source'> | null,
  adjustments: readonly Adjustment[],
  today: IsoDate,
): { start: IsoDate; week: number; weeks: number; ended: boolean } | null {
  if (!program || program.source !== 'engine' || !program.cycleWeeks) return null;
  const answered = [...effectiveDecisions(adjustments).values()]
    .filter((a) => a.changeKey === 'cycle_review' && (a.status === 'applied' || a.status === 'declined'))
    .map((a) => a.effectiveFrom)
    .sort()
    .at(-1);
  const start = answered && answered > program.effectiveFrom ? answered : program.effectiveFrom;
  const days = daysBetween(start, today);
  return {
    start,
    week: Math.floor(Math.max(0, days) / 7) + 1,
    weeks: program.cycleWeeks,
    ended: days >= program.cycleWeeks * 7,
  };
}

/**
 * A small evolution at the end of a cycle (D-037 §15): the exercises that stopped moving are
 * rotated to the next option the engine already knows for their movement (same equipment, level
 * and exclusions). Only what really changes is listed; nothing changes when there is no other
 * option.
 */
export function cycleEvolution(
  params: ProgramParams,
  rotate: readonly string[],
): { rotated: string[]; changes: { from: string; to: string }[] } {
  const plan = (rotatedExerciseIds: readonly string[]) =>
    generateWorkoutPlan({
      goal: params.goal,
      training: {
        level: params.level,
        sessionsPerWeek: params.sessionsPerWeek,
        sessionMinutes: params.sessionMinutes,
        equipment: [...params.equipment],
        refusedExerciseIds: [...params.excludedExerciseIds],
        rotatedExerciseIds: [...rotatedExerciseIds],
      },
    }).sessions;
  const before = plan(params.rotatedExerciseIds ?? []);
  const candidates = [...new Set(rotate)].filter((id) =>
    before.some((s) => s.exercises.some((e) => e.exerciseId === id)),
  );
  const after = plan(candidates);
  const changes: { from: string; to: string }[] = [];
  before.forEach((s, i) =>
    s.exercises.forEach((e, j) => {
      const to = after[i]?.exercises[j]?.exerciseId;
      if (to && to !== e.exerciseId && !changes.some((c) => c.from === e.exerciseId))
        changes.push({ from: e.exerciseId, to });
    }),
  );
  return { rotated: changes.length > 0 ? candidates.sort() : [], changes };
}

/** Completed sessions of the last `days` days: full ones and the others (short, light). */
export function recentSessions(
  completed: readonly { date: IsoDate; variant?: string }[],
  today: IsoDate,
  days: number,
): { full: number; other: number } {
  const from = addDays(today, -(days - 1));
  const recent = completed.filter((c) => c.date >= from && c.date <= today);
  const full = recent.filter((c) => (c.variant ?? 'full') === 'full').length;
  return { full, other: recent.length - full };
}

/**
 * Full sessions where sets were missing on several exercises (D-037 §6): among the last full
 * sessions done with a prescription, not stopped for time and not under declared fatigue (those
 * have their own reading), those where `incompleteExercises` exercises or more got fewer sets
 * than prescribed. An exercise not done at all is another signal (not performed, replaced).
 */
export function incompleteSessions(input: {
  records: Records;
  facts: {
    setLogs: Record<SessionKey, Record<string, readonly unknown[]>>;
    completedSessions: readonly { date: IsoDate; sessionIndex: number; variant?: string; stopped?: string }[];
    exerciseSwaps?: Record<SessionKey, Record<string, string>>;
  };
  /** Days with a high declared fatigue (journey definition). */
  fatigueDates: ReadonlySet<IsoDate>;
  today: IsoDate;
}): { incomplete: number; of: number } {
  const from = addDays(input.today, -STRUCTURE.historyDays);
  const sessions = input.facts.completedSessions
    .filter(
      (c) =>
        c.date >= from &&
        c.date <= input.today &&
        (c.variant ?? 'full') === 'full' &&
        c.stopped !== 'no_time' &&
        !input.fatigueDates.has(c.date),
    )
    .map((c) => `${c.date}#${c.sessionIndex}`)
    .filter((key) => !!input.records.prescriptions[input.records.sessionIds[key] ?? ''])
    .sort()
    .slice(-STRUCTURE.incompleteWindow);
  let incomplete = 0;
  for (const key of sessions) {
    const p = input.records.prescriptions[input.records.sessionIds[key]];
    const logs = input.facts.setLogs[key] ?? {};
    const swaps = input.facts.exerciseSwaps?.[key] ?? {};
    const short = p.exercises.filter((e) => {
      if (e.variant !== 'full') return false;
      const done = (logs[swaps[e.exerciseId] ?? e.exerciseId] ?? []).length;
      return done > 0 && done < e.sets;
    }).length;
    if (short >= STRUCTURE.incompleteExercises) incomplete++;
  }
  return { incomplete, of: sessions.length };
}

/**
 * The exercise the engine would prescribe in the slot of `exerciseId` if it were excluded (the
 * preview of a durable change, D-037 §8): same version parameters, same position. Null when the
 * slot disappears (no other option) or the exercise is not in the program.
 */
export function replacementPreview(params: ProgramParams, exerciseId: string): string | null {
  const plan = (excluded: readonly string[]) =>
    generateWorkoutPlan({
      goal: params.goal,
      training: {
        level: params.level,
        sessionsPerWeek: params.sessionsPerWeek,
        sessionMinutes: params.sessionMinutes,
        equipment: [...params.equipment],
        refusedExerciseIds: [...excluded],
        ...(params.rotatedExerciseIds ? { rotatedExerciseIds: [...params.rotatedExerciseIds] } : {}),
      },
    }).sessions;
  const before = plan(params.excludedExerciseIds);
  const after = plan([...params.excludedExerciseIds, exerciseId]);
  for (const [i, s] of before.entries()) {
    const j = s.exercises.findIndex((e) => e.exerciseId === exerciseId);
    const to = j >= 0 ? after[i]?.exercises[j]?.exerciseId : undefined;
    if (to && to !== exerciseId) return to;
  }
  return null;
}

/**
 * The profile's training after the durable changes the user accepted (D-037 §8, §15): exercises
 * removed from the program after confirmation, exercises rotated at an end-of-cycle evolution.
 * Read by the version (`ensureProgram`), never by a past session.
 */
export function durableTraining<T extends { refusedExerciseIds: readonly string[] }>(
  training: T,
  adjustments: readonly Adjustment[],
): Omit<T, 'refusedExerciseIds'> & { refusedExerciseIds: string[]; rotatedExerciseIds?: string[] } {
  const applied = appliedDecisions(adjustments);
  const removed = applied.filter((d) => d.changeKey === 'exercise_change').flatMap((d) => idList(d.from));
  const evolve = applied.filter((d) => d.changeKey === 'cycle_review' && d.to === 'evolve').at(-1);
  const rotated = evolve ? idList(evolve.from) : [];
  return {
    ...training,
    refusedExerciseIds: [...new Set([...training.refusedExerciseIds, ...removed])],
    ...(rotated.length > 0 ? { rotatedExerciseIds: rotated } : {}),
  };
}

/**
 * The decisions a new version links to (`versionChange`): the latest decision in force on each
 * durable change (applied, or reverted: going back is a decision too, D-037 §21).
 */
export function versionDecisions(adjustments: readonly Adjustment[]): VersionDecisions {
  const latest = (match: (a: Adjustment) => boolean) =>
    [...effectiveDecisions(adjustments).values()]
      .filter((a) => (a.status === 'applied' || a.status === 'reverted') && match(a))
      .sort(byInstant)
      .at(-1)?.id ?? null;
  return {
    frequency: latest((a) => a.changeKey === 'sessions_per_week'),
    exercises: latest((a) => a.changeKey === 'exercise_change'),
    cycle: latest((a) => a.changeKey === 'cycle_review' && a.to === 'evolve'),
  };
}

/** The structures in force on each date, for `ensureWeek` / `refreshWeek`. */
export function structureFor(
  adjustments: readonly Adjustment[],
  records: Records,
  completed: readonly { date: IsoDate; sessionIndex: number }[],
): (date: IsoDate) => StructureOfDay {
  const done = sessionsDoneUnder(records, completed);
  return (date) => structureOn(adjustments, date, done);
}

/** The accepted change a planned day follows (its prescription's decision, or a light week), or null. */
export function adaptationOfDay(
  adjustments: readonly Adjustment[],
  adjustmentId: string | null | undefined,
  day: StructureOfDay,
): StructuralChange | null {
  const decision = adjustmentId ? adjustments.find((a) => a.id === adjustmentId) : undefined;
  if (decision) return structureKey(decision);
  return day.lightWeek ? 'light_week' : null;
}
