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
import { estimateMinutes, generateWorkoutPlan, type PrescribedExercise, type WorkoutTemplate } from './engine';
import { suggestProgression, type LoggedSet } from './progression';
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
export interface TrainingFacts {
  setLogs: Record<SessionKey, Record<string, LoggedSet[]>>;
  completedSessions: readonly { date: IsoDate; sessionIndex: number }[];
  sessionOutcomes?: Record<SessionKey, unknown>;
  exerciseSwaps?: Record<SessionKey, Record<string, string>>;
  sessionDifficulty?: Record<SessionKey, number>;
}

export function hasFacts(facts: TrainingFacts, key: SessionKey): boolean {
  const { date, sessionIndex } = parseSessionKey(key);
  return (
    Object.values(facts.setLogs[key] ?? {}).some((sets) => sets.length > 0) ||
    facts.completedSessions.some((c) => c.date === date && c.sessionIndex === sessionIndex) ||
    facts.sessionOutcomes?.[key] != null ||
    Object.keys(facts.exerciseSwaps?.[key] ?? {}).length > 0 ||
    facts.sessionDifficulty?.[key] != null
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
  adjustmentId: string | null,
): string | null {
  if (!previous) return 'program.reason.first';
  const same = <K extends keyof ProgramParams>(k: K) => JSON.stringify(previous[k]) === JSON.stringify(next[k]);
  if (!same('sessionsPerWeek')) return adjustmentId ? 'program.reason.adaptation' : 'program.reason.frequency';
  if (!same('equipment')) return 'program.reason.equipment';
  if (!same('goal')) return 'program.reason.goal';
  if (!same('level')) return 'program.reason.level';
  if (!same('sessionMinutes')) return 'program.reason.duration';
  if (!same('excludedExerciseIds')) return 'program.reason.exercises';
  if (!same('engineVersion') || !same('split')) return 'program.reason.engine';
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
  /** Applied adaptation that set the frequency, if any (linked to the version it produced). */
  adjustmentId: string | null;
}): ProgramVersion[] | null {
  const next = programParams(input.goal, input.training);
  const active = activeProgram(input.programs);
  const engine = input.programs.filter((p) => p.source === 'engine');
  const previous = active ?? [...engine].sort(byVersion)[0] ?? null;
  const reason = versionReason(previous?.params ?? null, next, input.adjustmentId);
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
    adjustmentId: reason === 'program.reason.adaptation' ? input.adjustmentId : null,
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
    },
  }).sessions;
}

/**
 * Load proposed for each exercise from the sets logged before the session (the existing
 * progression engine, fatigue unknown in advance = normal). No history → no entry: the load stays
 * null, it is never guessed.
 */
export function proposedLoads(
  template: Pick<WorkoutTemplate, 'exercises'>,
  setLogs: TrainingFacts['setLogs'],
  date: IsoDate,
): Record<string, ProposedLoad> {
  const out: Record<string, ProposedLoad> = {};
  for (const e of template.exercises) {
    const history = Object.entries(setLogs)
      .filter(([k, logs]) => parseSessionKey(k).date < date && (logs[e.exerciseId]?.length ?? 0) > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, logs]) => ({ date: parseSessionKey(k).date, sets: logs[e.exerciseId] }));
    if (history.length === 0) continue;
    const s = suggestProgression({
      exerciseId: e.exerciseId,
      repsMin: e.repsMin,
      repsMax: e.repsMax,
      history,
      fatigue: 'normal',
    });
    out[e.exerciseId] = { loadKg: s.loadKg > 0 ? s.loadKg : null, action: s.action, reasonKey: s.rationale.reason };
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
      const template = templates.get(program.id)![sessionIndex];
      if (!template) continue;
      prescriptions[id] = prescribeSession({
        sessionId: id,
        program,
        template,
        date,
        sessionIndex,
        prescribedAt: input.prescribedAt,
        loads: proposedLoads(template, facts.setLogs, date),
        ids: (variant, position) => trainingIds.planned(id, variant, position),
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

/** The live prescription of a day, if the session was prescribed. */
export function prescriptionFor(
  records: Pick<TrainingRecords, 'prescriptions' | 'sessionIds'>,
  key: SessionKey,
): PrescribedSession | null {
  const id = records.sessionIds[key];
  return id ? (records.prescriptions[id] ?? null) : null;
}

/** "J'ai 15 minutes" stays 15 minutes until W-3 uses the Daily Coach's duration. */
export const SHORT_SESSION_MINUTES = 15;

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
  const minutes =
    variant === 'full'
      ? p.plannedMinutes
      : variant === 'short'
        ? Math.min(SHORT_SESSION_MINUTES, estimateMinutes(exercises))
        : estimateMinutes(exercises);
  return { index: p.sessionIndex, focus: p.focus, estimatedMinutes: minutes, exercises };
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
  /** Equipment, level and refusals of the moment of the choice (the adaptation is of the day). */
  training: Pick<TrainingProfile, 'equipment' | 'hasGym' | 'level' | 'refusedExerciseIds'>;
  done: boolean;
  prescribedAt: string;
}): PrescribedSession | null {
  const { session, variant } = input;
  if (variant === 'full' || input.done || session.exercises.some((e) => e.variant === variant)) return null;
  const full = variantTemplate(session, 'full');
  if (!full) return null;
  const adapted =
    variant === 'short'
      ? shortSession(full, {
          minutes: SHORT_SESSION_MINUTES,
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
    minutes: variant === 'short' ? SHORT_SESSION_MINUTES : adapted.estimatedMinutes,
    reasonKey: `workout.variant.${variant}`,
    prescribedAt: input.prescribedAt,
    ids: (v, position) => trainingIds.planned(session.id, v, position),
  });
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
  if (hasFacts(facts, key)) return null;
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
