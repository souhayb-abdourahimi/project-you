/**
 * Workout Coach W-2 (docs/TRAINING_ARCHITECTURE.md §5, D-032): the app publishes a program version,
 * freezes the prescription of the week, then reads it back. The engine still proposes the future;
 * it never rewrites what was prescribed. Pure functions: ids are deterministic, time comes from the
 * caller.
 *
 * Data kinds stay separate (D-031 B): versions and prescriptions are RECOMMENDATIONS (immutable once
 * published), sets and outcomes are FACTS, difficulty is USER_REPORTED, gaps are DERIVED.
 */
import type { GoalType, TrainingProfile } from '../profile/schemas';
import { addDays, type IsoDate } from '../shared/dates';
import { parseSessionKey, sessionKey, stableUuid, type SessionKey } from '../shared/ids';
import { lightSession, shortSession, type SessionVariant } from './adapt';
import { SESSION_DURATION, shortMinutes } from './durations';
import { estimateMinutes, generateWorkoutPlan, type PrescribedExercise, type WorkoutTemplate } from './engine';
import { exerciseHistory, type HistoryFacts } from './history';
import { PROGRESSION, readExposure, recommendProgression, type ProgressionRecommendation } from './progression';
import { shapeTemplate, STRUCTURE, type StructureOfDay } from './structure';
import {
  adaptPrescription,
  deepFreeze,
  prescribeSession,
  programParams,
  publishProgram,
  type PrescribedSession,
  type ProgramParams,
  type ProgramVersion,
  type ProposedLoad,
} from './program';

/**
 * Deterministic ids (D-032): the same publication, prescription or move gives the same id on every
 * device and after every restart, so a retry or a second device writes the same row, never a copy.
 */
export const trainingIds = {
  /** First lineage of an account (or of the device in local mode). */
  lineage: (seed: string) => stableUuid(`${seed}:training:lineage`),
  version: (lineageId: string, version: number) => stableUuid(`${lineageId}:training:v${version}`),
  session: (programId: string, key: SessionKey) => stableUuid(`${programId}:training:session:${key}`),
  planned: (sessionId: string, variant: SessionVariant, position: number) =>
    stableUuid(`${sessionId}:training:planned:${variant}:${position}`),
  moved: (sessionId: string, to: IsoDate) => stableUuid(`${sessionId}:training:moved:${to}`),
  /**
   * Lineage of a version kept for history after it lost a sync conflict (D-033): derived from the
   * content that lost, so a retry or another device archives it under the same id.
   */
  archivedLineage: (lost: ProgramVersion) =>
    stableUuid(
      `${lost.lineageId}:training:archived:v${lost.version}:${lost.publishedAt}:${JSON.stringify(lost.params)}`,
    ),
  /**
   * A new prescription of a session not started yet, when the progression changed since it was
   * frozen (D-035): derived from what it proposes, so every device computes the same id.
   */
  revision: (programId: string, key: SessionKey, fingerprint: string) =>
    stableUuid(`${programId}:training:session:${key}:rev:${fingerprint}`),
  /** A used session kept with its own prescription when the server holds another one for its id. */
  kept: (sessionId: string, prescribedAt: string) => stableUuid(`${sessionId}:training:kept:${prescribedAt}`),
};

/** Where a session without prescription comes from (`workout_sessions.prescription_source`). */
export interface SessionSource {
  source: 'off_plan' | 'unknown';
  programId: string | null;
}

/** Published versions and frozen prescriptions held on the device (server copy + local cache). */
export interface TrainingRecords {
  programs: ProgramVersion[];
  /** Every prescribed session by id, live or superseded. */
  prescriptions: Record<string, PrescribedSession>;
  /** Prescribed sessions replaced by a newer version (or a new schedule) before they started. */
  superseded: Record<string, true>;
  /** The live session of each day: what the screens open. */
  sessionIds: Record<SessionKey, string>;
}

/** What the user did (FACT / USER_REPORTED): a session holding any of it is never replaced. */
export interface TrainingFacts extends HistoryFacts {
  sessionOutcomes?: Record<SessionKey, unknown>;
  /** When a prescribed session was opened: from then on its prescription is what the user saw. */
  sessionOpened?: Record<SessionKey, string>;
}

/**
 * A session the user used: opened, a set, a replacement, an outcome or a difficulty. Its
 * prescription is historical truth from then on (D-033): nothing replaces it, not even a sync
 * conflict.
 */
export function hasFacts(facts: TrainingFacts, key: SessionKey): boolean {
  return facts.sessionOpened?.[key] != null || hasRecords(facts, key);
}

/** What the user recorded (opening aside): a session holding it can no longer be moved. */
function hasRecords(facts: TrainingFacts, key: SessionKey): boolean {
  const { date, sessionIndex } = parseSessionKey(key);
  return (
    Object.values(facts.setLogs[key] ?? {}).some((sets) => sets.length > 0) ||
    facts.completedSessions.some((c) => c.date === date && c.sessionIndex === sessionIndex) ||
    facts.sessionOutcomes?.[key] != null ||
    Object.keys(facts.exerciseSwaps?.[key] ?? {}).length > 0 ||
    facts.sessionDifficulty?.[key] != null ||
    Object.keys(facts.exerciseReports?.[key] ?? {}).length > 0
  );
}

const byVersion = (a: ProgramVersion, b: ProgramVersion) => b.version - a.version || a.id.localeCompare(b.id);

/** The active engine version (one per account; the highest if a merge left several). */
export function activeProgram(programs: readonly ProgramVersion[]): ProgramVersion | null {
  return programs.filter((p) => p.source === 'engine' && p.status === 'active').sort(byVersion)[0] ?? null;
}

/** The engine version that applies to a date: the active one from its start, else the closed one covering it. */
export function versionInForce(programs: readonly ProgramVersion[], date: IsoDate): ProgramVersion | null {
  const active = activeProgram(programs);
  if (active && date >= active.effectiveFrom) return active;
  return (
    programs
      .filter(
        (p) =>
          p.source === 'engine' &&
          p.params &&
          p.status !== 'active' &&
          p.effectiveFrom <= date &&
          (p.effectiveTo === null || date <= p.effectiveTo),
      )
      .sort(byVersion)[0] ?? null
  );
}

/**
 * Why a new version is needed, or null when the active one still fits (D-032 triggers). A new
 * version is published only when a parameter frozen in the version changes: frequency (including
 * an accepted adaptation), equipment, goal, level, session duration, refused exercises (a durable
 * preference) or the engine itself. Everything else (swap, variant of the day, reschedule, skip,
 * sets, difficulty, availability or calendar) never creates a version.
 */
export function versionReason(
  previous: ProgramParams | null,
  next: ProgramParams,
  decisions: VersionDecisions | string | null,
): string | null {
  return versionChange(previous, next, decisions)?.reason ?? null;
}

/**
 * Accepted decisions that may produce a version (W-5, D-037): the frequency, a durable exercise
 * change, an end-of-cycle evolution. A string is the frequency decision (W-2 callers).
 */
export interface VersionDecisions {
  frequency?: string | null;
  exercises?: string | null;
  cycle?: string | null;
}

/** Why a new version is needed and the accepted decision that caused it, if any. */
export function versionChange(
  previous: ProgramParams | null,
  next: ProgramParams,
  decisions: VersionDecisions | string | null,
): { reason: string; adjustmentId: string | null } | null {
  if (!previous) return { reason: 'program.reason.first', adjustmentId: null };
  const d: VersionDecisions = typeof decisions === 'string' ? { frequency: decisions } : (decisions ?? {});
  const same = <K extends keyof ProgramParams>(k: K) => JSON.stringify(previous[k]) === JSON.stringify(next[k]);
  const by = (id: string | null | undefined, adapted: string, other: string) =>
    id ? { reason: adapted, adjustmentId: id } : { reason: other, adjustmentId: null };
  if (!same('sessionsPerWeek')) return by(d.frequency, 'program.reason.adaptation', 'program.reason.frequency');
  if (!same('equipment')) return { reason: 'program.reason.equipment', adjustmentId: null };
  if (!same('goal')) return { reason: 'program.reason.goal', adjustmentId: null };
  if (!same('level')) return { reason: 'program.reason.level', adjustmentId: null };
  if (!same('sessionMinutes')) return { reason: 'program.reason.duration', adjustmentId: null };
  if (!same('excludedExerciseIds')) return by(d.exercises, 'program.reason.adaptation', 'program.reason.exercises');
  if (!same('rotatedExerciseIds')) return by(d.cycle, 'program.reason.cycle', 'program.reason.cycle');
  if (!same('engineVersion') || !same('split')) return { reason: 'program.reason.engine', adjustmentId: null };
  return null;
}

type TrainingInput = Parameters<typeof programParams>[1];

/**
 * Publishes the first version, or the next one when a frozen parameter changed. Returns null when
 * nothing changes (idempotent: a restart, a re-render or a second call publishes nothing).
 */
export function ensureProgram(input: {
  programs: readonly ProgramVersion[];
  goal: GoalType;
  training: TrainingInput;
  today: IsoDate;
  weekStart: IsoDate;
  /** Account id, or "local" before the data is attached to an account. */
  seed: string;
  publishedAt: string;
  /**
   * Applied adaptations that may change a frozen parameter (linked to the version they produce): a
   * string is the frequency decision.
   */
  adjustmentId: VersionDecisions | string | null;
}): ProgramVersion[] | null {
  const next = programParams(input.goal, input.training);
  const active = activeProgram(input.programs);
  const engine = input.programs.filter((p) => p.source === 'engine');
  const previous = active ?? [...engine].sort(byVersion)[0] ?? null;
  const change = versionChange(previous?.params ?? null, next, input.adjustmentId);
  const reason = change?.reason ?? null;
  if (active && reason === null) return null;
  const lineageId = previous?.lineageId ?? trainingIds.lineage(input.seed);
  const version = Math.max(0, ...engine.filter((p) => p.lineageId === lineageId).map((p) => p.version)) + 1;
  const { published, closed } = publishProgram({
    id: trainingIds.version(lineageId, version),
    lineageId,
    previous,
    goal: input.goal,
    training: input.training,
    // The first version covers the current week; a later one applies from today (the past stays).
    effectiveFrom: previous ? input.today : input.weekStart,
    reasonKey: reason ?? 'program.reason.resumed',
    adjustmentId: change?.adjustmentId ?? null,
    publishedAt: input.publishedAt,
    version,
  });
  return [...input.programs.map((p) => (closed && p.id === closed.id ? closed : p)), published];
}

/** The sessions a version generates, from its frozen parameters (never from the current profile). */
export function versionTemplates(program: ProgramVersion): WorkoutTemplate[] {
  const p = program.params;
  if (!p) return [];
  return generateWorkoutPlan({
    goal: p.goal,
    training: {
      level: p.level,
      sessionsPerWeek: p.sessionsPerWeek,
      sessionMinutes: p.sessionMinutes,
      equipment: [...p.equipment],
      refusedExerciseIds: [...p.excludedExerciseIds],
      ...(p.rotatedExerciseIds ? { rotatedExerciseIds: [...p.rotatedExerciseIds] } : {}),
    },
  }).sessions;
}

/** Today's context applied to a recommendation (journey/adaptation.ts `gateProgression`). */
export type ProgressionGate = (rec: ProgressionRecommendation, date: IsoDate) => ProgressionRecommendation;

/**
 * What the next prescription proposes for each exercise (Progression Engine v2, D-035): the
 * exercise's own history before the session, read by `recommendProgression`, then today's context
 * when the caller has it. No history → no entry: the load stays null, it is never guessed.
 */
export function proposedLoads(input: {
  template: Pick<WorkoutTemplate, 'exercises'>;
  records: Pick<TrainingRecords, 'prescriptions' | 'sessionIds'>;
  facts: HistoryFacts;
  date: IsoDate;
  today: IsoDate;
  gate?: ProgressionGate;
}): Record<string, ProposedLoad> {
  const out: Record<string, ProposedLoad> = {};
  for (const e of input.template.exercises) {
    const history = exerciseHistory({
      exerciseId: e.exerciseId,
      records: input.records,
      facts: input.facts,
      before: input.date,
      today: input.today,
    });
    const raw = recommendProgression({
      exerciseId: e.exerciseId,
      range: { sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, unit: e.unit },
      exposures: history.exposures,
      notDone: history.notDone,
      adherence: history.adherence,
    });
    const rec = input.gate ? input.gate(raw, input.date) : raw;
    if (rec.action === 'no_recommendation') continue;
    out[e.exerciseId] = {
      loadKg: rec.proposedPrescription.loadKg,
      action: rec.action,
      reasonKey: rec.reason.key,
      targetReps: rec.proposedPrescription.target,
      confidence: rec.confidence,
      params: rec.reason.params,
    };
  }
  return out;
}

/**
 * Freezes the prescription of the current week (idempotent; null when nothing changes):
 * - each planned session of the week gets one prescription from the version in force that day;
 * - an existing prescription is read, never rebuilt; one replaced earlier is revived, not copied;
 * - a session that holds facts (sets, outcome, swap, difficulty) is never replaced;
 * - a not-started session of an older version, or one the schedule no longer holds from today,
 *   is marked superseded (kept on the server, never deleted);
 * - a closed version never prescribes anything new: the past is not reconstructed.
 */
export function ensureWeek(input: {
  records: TrainingRecords;
  facts: TrainingFacts;
  /** Planned date → new date (the original keeps its row, see `rescheduleSession`). */
  rescheduled: Record<IsoDate, IsoDate>;
  today: IsoDate;
  weekStart: IsoDate;
  /** Workout slots of the week after reschedules. */
  scheduled: readonly { date: IsoDate; sessionIndex: number }[];
  prescribedAt: string;
  /** Structural changes the user accepted, in force on a date (W-5, `structure.ts`). */
  structure?: (date: IsoDate) => StructureOfDay;
}): TrainingRecords | null {
  const { records, facts } = input;
  const weekEnd = addDays(input.weekStart, 6);
  const prescriptions = { ...records.prescriptions };
  const superseded = { ...records.superseded };
  const sessionIds = { ...records.sessionIds };
  const templates = new Map<string, WorkoutTemplate[]>();
  let changed = false;
  const wanted = new Set<SessionKey>();

  for (const { date, sessionIndex } of input.scheduled) {
    if (date < input.weekStart || date > weekEnd) continue;
    const key = sessionKey(date, sessionIndex);
    wanted.add(key);
    const program = versionInForce(records.programs, date);
    if (!program) continue;
    const liveId = sessionIds[key];
    const live = liveId ? prescriptions[liveId] : undefined;
    if (live && live.programId === program.id) continue;
    // Off-plan, history or a started session: what happened stays as it is.
    if (liveId && (!live || hasFacts(facts, key))) continue;
    const id = trainingIds.session(program.id, key);
    if (prescriptions[id]) {
      delete superseded[id];
    } else {
      if (program.status !== 'active') continue;
      if (!templates.has(program.id)) templates.set(program.id, versionTemplates(program));
      const base = templates.get(program.id)![sessionIndex];
      if (!base) continue;
      const { template, adjustmentId } = shaped(base, program, input.structure?.(date));
      prescriptions[id] = prescribeSession({
        sessionId: id,
        program,
        template,
        date,
        sessionIndex,
        prescribedAt: input.prescribedAt,
        loads: proposedLoads({ template, records, facts, date, today: input.today }),
        ids: (variant, position) => trainingIds.planned(id, variant, position),
        adjustmentId,
      });
    }
    if (live) superseded[live.id] = true;
    sessionIds[key] = id;
    changed = true;
  }

  // From today on, a not-started session the schedule no longer holds is superseded.
  for (const [key, id] of Object.entries(sessionIds)) {
    const p = prescriptions[id];
    if (!p || p.date < input.today || p.date < input.weekStart || p.date > weekEnd) continue;
    if (wanted.has(key) || hasFacts(facts, key) || input.rescheduled[p.date]) continue;
    superseded[id] = true;
    delete sessionIds[key];
    changed = true;
  }

  return changed ? { programs: records.programs, prescriptions, superseded, sessionIds } : null;
}

/**
 * What a prescription proposes per exercise, in a stable order (its fingerprint). A prescription
 * shaped by a structural decision (W-5) adds the decision and its exercises and sets, so the end
 * of the change (or its revert) brings the normal prescription back.
 */
function proposalsOf(p: PrescribedSession): string {
  const full = p.exercises.filter((e) => e.variant === 'full').sort((a, b) => a.position - b.position);
  const progression = JSON.stringify(
    full
      .filter((e) => e.progressionAction !== null)
      .map((e) => [
        e.exerciseId,
        e.targetLoadKg,
        e.progressionAction,
        e.progressionReason,
        e.targetReps,
        e.progressionConfidence,
        e.progressionParams,
      ]),
  );
  if (!p.adjustmentId) return progression;
  return `${progression}|${p.adjustmentId}|${full.map((e) => `${e.exerciseId}:${e.sets}`).join(',')}`;
}

/** A template under the structures of its day, with the version's equipment and exclusions. */
function shaped(template: WorkoutTemplate, program: ProgramVersion, day: StructureOfDay | undefined) {
  if (!day || !program.params) return { template, adjustmentId: null };
  return shapeTemplate(template, day, {
    equipment: program.params.equipment,
    excluded: program.params.excludedExerciseIds,
  });
}

/**
 * Brings the progression to the sessions of the week not started yet (W-4, D-035): Monday's
 * session done, Friday's prescription follows. A session is re-prescribed only when:
 * - it is today or later, of the active version, and nothing was recorded in it (not even opened);
 * - it has no adaptation of the day and is not a moved copy;
 * - what the engine proposes now (with today's context) differs from what it holds.
 * The new prescription is a new row (its id derives from what it proposes); the previous one is
 * superseded, never edited, never deleted. No new program version: the parameters did not change.
 */
export function refreshWeek(input: {
  records: TrainingRecords;
  facts: TrainingFacts;
  rescheduled: Record<IsoDate, IsoDate>;
  today: IsoDate;
  weekStart: IsoDate;
  gate?: ProgressionGate;
  prescribedAt: string;
  /** Structural changes the user accepted, in force on a date (W-5, `structure.ts`). */
  structure?: (date: IsoDate) => StructureOfDay;
}): TrainingRecords | null {
  const { records, facts } = input;
  const program = activeProgram(records.programs);
  if (!program) return null;
  const weekEnd = addDays(input.weekStart, 6);
  const moved = new Set(Object.values(input.rescheduled));
  const prescriptions = { ...records.prescriptions };
  const superseded = { ...records.superseded };
  const sessionIds = { ...records.sessionIds };
  let templates: WorkoutTemplate[] | null = null;
  let changed = false;

  for (const [key, liveId] of Object.entries(records.sessionIds)) {
    const live = records.prescriptions[liveId];
    if (!live || live.programId !== program.id || live.date < input.today || live.date > weekEnd) continue;
    if (live.date < input.weekStart || live.adaptationReason !== null || moved.has(live.date)) continue;
    if (hasFacts(facts, key)) continue;
    templates ??= versionTemplates(program);
    const generated = templates[live.sessionIndex];
    if (!generated) continue;
    const { template, adjustmentId } = shaped(generated, program, input.structure?.(live.date));
    const prescribe = (id: string) =>
      prescribeSession({
        sessionId: id,
        program,
        template,
        date: live.date,
        sessionIndex: live.sessionIndex,
        prescribedAt: input.prescribedAt,
        loads: proposedLoads({ template, records, facts, date: live.date, today: input.today, gate: input.gate }),
        ids: (variant, position) => trainingIds.planned(id, variant, position),
        adjustmentId,
      });
    const probe = prescribe(liveId);
    const wanted = proposalsOf(probe);
    if (wanted === proposalsOf(live)) continue;
    const base = trainingIds.session(program.id, key);
    const revision = trainingIds.revision(program.id, key, wanted);
    const id = prescriptions[base] && proposalsOf(prescriptions[base]) === wanted ? base : revision;
    // An earlier prescription with the same proposals is revived, never copied.
    if (!prescriptions[id]) prescriptions[id] = prescribe(id);
    delete superseded[id];
    superseded[liveId] = true;
    sessionIds[key] = id;
    changed = true;
  }
  return changed ? { programs: records.programs, prescriptions, superseded, sessionIds } : null;
}

/**
 * Exercises of the program whose own history shows a plateau or a downward trend, for the
 * Adaptation Engine (D-035). Each read on its own history, today's sets included.
 */
export function progressionSignals(input: {
  records: Pick<TrainingRecords, 'prescriptions' | 'sessionIds'>;
  facts: HistoryFacts;
  today: IsoDate;
}): ProgressionSignals {
  const { records, today } = input;
  const from = addDays(today, -PROGRESSION.windowDays);
  const rows = new Map<string, PrescribedSession['exercises'][number]>();
  const live = Object.values(records.sessionIds)
    .map((id) => records.prescriptions[id])
    .filter((p): p is PrescribedSession => !!p && p.date >= from && p.date <= addDays(today, 6))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const p of live) for (const e of p.exercises) if (e.variant === 'full') rows.set(e.exerciseId, e);
  const out: ProgressionSignals = { stagnating: [], down: [], persistent: [], hard: [], struggling: [] };
  for (const [exerciseId, e] of [...rows.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const history = exerciseHistory({ exerciseId, records, facts: input.facts, before: addDays(today, 1), today });
    const range = { sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, unit: e.unit };
    const rec = recommendProgression({
      exerciseId,
      range,
      exposures: history.exposures,
      notDone: history.notDone,
      adherence: history.adherence,
    });
    const decisive = history.exposures
      .map((x) => readExposure(x, range))
      .filter((r) => r.neutral === null && r.values.length > 0);
    const stuck = rec.signals.stagnation;
    if (stuck.active) {
      out.stagnating.push(exerciseId);
      if ((stuck.days ?? 0) >= STRUCTURE.persistentStagnationDays) out.persistent.push(exerciseId);
      // Most of the plateau's sessions felt very hard: a lighter week may help more than waiting.
      const recent = decisive.slice(-PROGRESSION.plateauSessions);
      if (recent.filter((r) => r.hard).length * 2 >= recent.length) out.hard.push(exerciseId);
    }
    if (rec.signals.trend === 'down') out.down.push(exerciseId);
    const last = decisive.slice(-STRUCTURE.strugglingWindow);
    const misses = last.filter((r) => r.miss).length;
    if (last.length >= STRUCTURE.strugglingWindow && misses >= STRUCTURE.strugglingMisses) {
      out.struggling.push({ exerciseId, misses, sessions: last.length });
    }
  }
  return out;
}

/**
 * What the exercises' own histories say, for the Adaptation Engine (D-035, D-037): a plateau (and
 * whether it lasts or felt very hard), a downward trend, and repeated sessions under the range.
 */
export interface ProgressionSignals {
  stagnating: string[];
  down: string[];
  /** Plateau with no better session for `STRUCTURE.persistentStagnationDays` or more. */
  persistent: string[];
  /** Plateau whose recent sessions mostly felt very hard. */
  hard: string[];
  /** Under the range in most of the last full sessions of the exercise. */
  struggling: { exerciseId: string; misses: number; sessions: number }[];
}

/** The live prescription of a day, if the session was prescribed. */
export function prescriptionFor(
  records: Pick<TrainingRecords, 'prescriptions' | 'sessionIds'>,
  key: SessionKey,
): PrescribedSession | null {
  const id = records.sessionIds[key];
  return id ? (records.prescriptions[id] ?? null) : null;
}

function toPrescribed(e: PrescribedSession['exercises'][number]): PrescribedExercise {
  return {
    exerciseId: e.exerciseId,
    sets: e.sets,
    repsMin: e.repsMin,
    repsMax: e.repsMax,
    unit: e.unit,
    restSeconds: e.restSeconds,
    targetRpe: e.targetRpe ?? 7,
    alternatives: [],
  };
}

/** The persisted prescription of one variant, in the shape the screens already render. */
export function variantTemplate(p: PrescribedSession, variant: SessionVariant = 'full'): WorkoutTemplate | null {
  const rows = p.exercises.filter((e) => e.variant === variant).sort((a, b) => a.position - b.position);
  if (rows.length === 0) return null;
  const exercises = rows.map(toPrescribed);
  return { index: p.sessionIndex, focus: p.focus, estimatedMinutes: variantMinutes(p, variant), exercises };
}

/**
 * Duration of a variant as prescribed (D-034), the one every screen shows: the full session's
 * planned minutes; for the adaptation of the day, the minutes it was built for (the Daily Coach's);
 * otherwise the estimate of its own rows.
 */
export function variantMinutes(p: PrescribedSession, variant: SessionVariant): number {
  if (variant === 'full') return p.plannedMinutes;
  if (p.adaptationReason === `workout.variant.${variant}` && p.adaptedMinutes) return p.adaptedMinutes;
  const rows = p.exercises.filter((e) => e.variant === variant);
  return variant === 'short' ? estimateMinutes(rows, SESSION_DURATION.shortWarmUpMinutes) : estimateMinutes(rows);
}

/**
 * Duration a variant will have before it is stored (what the Daily Coach announces): short = the
 * minutes asked; light = the estimate of the light rows it will build; full = planned.
 */
export function plannedVariantMinutes(p: PrescribedSession, variant: SessionVariant, requested: number): number {
  if (variant === 'full' || p.exercises.some((e) => e.variant === variant)) return variantMinutes(p, variant);
  if (variant === 'short') return shortMinutes(requested, p.plannedMinutes);
  const full = variantTemplate(p, 'full');
  return full ? lightSession(full).estimatedMinutes : requested;
}

/**
 * The variant of the day as persisted rows: computed once from the frozen full prescription, then
 * read. Choosing a variant adds its rows; the full variant is never touched (D-031 A). Null when
 * there is nothing to add (already there, full, or the session is over).
 */
export function adaptSession(input: {
  session: PrescribedSession;
  program: Pick<ProgramVersion, 'params'> | null;
  variant: SessionVariant;
  /** Minutes of a short version (the Daily Coach's, D-034). Ignored for light. */
  minutes?: number;
  /** Equipment, level and refusals of the moment of the choice (the adaptation is of the day). */
  training: Pick<TrainingProfile, 'equipment' | 'hasGym' | 'level' | 'refusedExerciseIds'>;
  done: boolean;
  prescribedAt: string;
  /** Why the variant is chosen when it is not the user's choice of the day (an accepted light week). */
  reasonKey?: string;
}): PrescribedSession | null {
  const { session, variant } = input;
  if (variant === 'full' || input.done || session.exercises.some((e) => e.variant === variant)) return null;
  const full = variantTemplate(session, 'full');
  if (!full) return null;
  const minutes = shortMinutes(input.minutes, session.plannedMinutes);
  const adapted =
    variant === 'short'
      ? shortSession(full, {
          minutes,
          // Same rule as before W-2: at the gym the short version is a bodyweight circuit.
          equipment: input.training.hasGym ? ['bodyweight'] : input.training.equipment,
          level: input.training.level,
          refusedExerciseIds: input.training.refusedExerciseIds,
        })
      : lightSession(full);
  if (adapted.exercises.length === 0) return null;
  return adaptPrescription({
    session,
    program: input.program,
    adapted,
    minutes: variant === 'short' ? minutes : adapted.estimatedMinutes,
    reasonKey: input.reasonKey ?? `workout.variant.${variant}`,
    prescribedAt: input.prescribedAt,
    ids: (v, position) => trainingIds.planned(session.id, v, position),
    loads: variantLoads(session, variant),
  });
}

/**
 * Loads a variant keeps from the full prescription, for the same exercise (D-034, D-035): short
 * keeps them with their goal (same stimulus, fewer sets); light keeps the load but never an
 * increase (a lighter day is never the day to add load or repetitions). A replacement exercise
 * gets none (never guessed).
 */
function variantLoads(session: PrescribedSession, variant: SessionVariant): Record<string, ProposedLoad> {
  const out: Record<string, ProposedLoad> = {};
  for (const e of session.exercises.filter((x) => x.variant === 'full')) {
    if (e.targetLoadKg === null || e.progressionAction === null) continue;
    if (variant === 'light' && e.progressionAction === 'increase_load') continue;
    if (variant === 'light' && e.progressionAction === 'increase_reps') {
      out[e.exerciseId] = { loadKg: e.targetLoadKg, action: 'maintain', reasonKey: 'progression.reason.light_day' };
      continue;
    }
    out[e.exerciseId] = {
      loadKg: e.targetLoadKg,
      action: e.progressionAction,
      reasonKey: e.progressionReason ?? 'progression.carried',
      ...(variant === 'short' && e.targetReps !== null ? { targetReps: e.targetReps } : {}),
      ...(e.progressionConfidence ? { confidence: e.progressionConfidence } : {}),
      ...(e.progressionParams ? { params: e.progressionParams } : {}),
    };
  }
  return out;
}

/**
 * Moves a planned session (D-032, lifts A9): the original keeps its row (status `rescheduled`,
 * `rescheduled_to`), the new day gets a session with the same prescription, linked by a
 * deterministic id. A copy is necessary because the constraint keeps `rescheduled_to` only on a
 * `rescheduled` row while the new day records its own facts. Null when the day has no prescription,
 * was already started, or the new day already holds a session.
 */
export function rescheduleSession(
  records: TrainingRecords,
  facts: TrainingFacts,
  from: IsoDate,
  to: IsoDate,
): TrainingRecords | null {
  const entry = Object.entries(records.sessionIds).find(
    ([k, id]) => parseSessionKey(k).date === from && records.prescriptions[id],
  );
  if (!entry || from === to) return null;
  const [key, id] = entry;
  // Opening a session does not prevent moving it: the copy keeps the same prescription.
  if (hasRecords(facts, key)) return null;
  const original = records.prescriptions[id];
  const toKey = sessionKey(to, original.sessionIndex);
  if (records.sessionIds[toKey]) return null;
  const copyId = trainingIds.moved(id, to);
  const copy = deepFreeze({
    ...original,
    id: copyId,
    date: to,
    exercises: original.exercises.map((e) => ({
      ...e,
      id: trainingIds.planned(copyId, e.variant, e.position),
      sessionId: copyId,
    })),
  });
  return {
    ...records,
    prescriptions: { ...records.prescriptions, [copyId]: copy },
    sessionIds: { ...records.sessionIds, [toKey]: copyId },
  };
}

/**
 * A version that lost a sync conflict (same id, other content on the server) but under which the
 * user already used a session (D-033): kept for history under its own lineage, closed, never
 * active again. The server's version stays the one in force for the future.
 */
export function archivedVersion(lost: ProgramVersion, winner: ProgramVersion): ProgramVersion {
  const lineageId = trainingIds.archivedLineage(lost);
  const to = addDays(winner.effectiveFrom, -1);
  return deepFreeze({
    ...lost,
    id: trainingIds.version(lineageId, lost.version),
    lineageId,
    status: lost.status === 'active' ? 'superseded' : lost.status,
    effectiveTo: lost.effectiveTo ?? (to < lost.effectiveFrom ? lost.effectiveFrom : to),
  });
}

/**
 * A used session whose id the server holds with another prescription (D-033): the same content
 * (exercises, loads, variants, time of prescription) under new ids, so the sets stay linked to
 * what the user actually saw. `programId` is the archived version when the session's version lost.
 */
export function keptSession(p: PrescribedSession, programId: string, key: SessionKey): PrescribedSession {
  const id = programId === p.programId ? trainingIds.kept(p.id, p.prescribedAt) : trainingIds.session(programId, key);
  return deepFreeze({
    ...p,
    id,
    programId,
    exercises: p.exercises.map((e) => ({ ...e, id: trainingIds.planned(id, e.variant, e.position), sessionId: id })),
  });
}
