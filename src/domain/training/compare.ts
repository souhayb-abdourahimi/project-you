/**
 * Planned vs done (W-6, D-038). Derived, never stored (D-031 B), and never a recomputation of the
 * past (D-031 E): the plan is the prescription stored for the session, the done part is what the
 * user recorded. Facts only ("3 séries sur 3", "remplacé : machine prise", "non fait : manque de
 * temps"); a past session without any record is "not recorded", never "missed" or "failed".
 */
import type { SessionOutcome } from '../journey/outcomes';
import { addDays, type IsoDate } from '../shared/dates';
import { parseSessionKey, sessionKey, type SessionKey } from '../shared/ids';
import type { SessionVariant } from './adapt';
import type { SetUnit } from './engine';
import type { HistoryFacts } from './history';
import type { PrescribedSession } from './program';
import type { LoggedSet } from './progression';
import type { ReplacementReason } from './replacement';
import { exerciseStatus, sessionExercises, sessionResult, type SessionResult } from './session';
import { prescriptionFor, variantMinutes, type SessionSource, type TrainingRecords } from './week';

/** What the comparison reads: the history facts plus where each session comes from. */
export interface CompareFacts extends HistoryFacts {
  sessionOutcomes?: Record<SessionKey, SessionOutcome>;
  sessionSources?: Record<SessionKey, SessionSource>;
  /** Local slot → real session (D-033): a second real session of the same day. */
  sessionSlots?: Record<SessionKey, SessionKey>;
  /** Day moved → new day (D-032). */
  rescheduled?: Record<IsoDate, IsoDate>;
}

/**
 * One exercise: `done` (all planned sets), `partial` (some), `not_performed` (declared, with its
 * reason), `not_recorded` (session over, nothing noted for it), `pending` (session not over).
 */
export type ExerciseOutcome = 'done' | 'partial' | 'not_performed' | 'not_recorded' | 'pending';

export interface ExerciseComparison {
  /** The prescribed exercise; for a session without prescription, the exercise done. */
  prescribedId: string;
  /** The exercise actually done (the replacement when there is one). */
  exerciseId: string;
  replaced: boolean;
  replacedReason: ReplacementReason | null;
  notPerformedReason: ReplacementReason | null;
  outcome: ExerciseOutcome;
  unit: SetUnit;
  /** Null when no prescription was stored (off plan, before W-1): nothing planned to compare with. */
  setsPlanned: number | null;
  setsDone: number;
  /** The sets as recorded, in order. */
  sets: LoggedSet[];
}

/** `moved`: rescheduled to `movedTo`. `not_recorded`: a past planned session with no record. */
export type SessionStatus = SessionResult | 'moved' | 'not_recorded';

export interface SessionComparison {
  key: SessionKey;
  date: IsoDate;
  sessionIndex: number;
  /** A second real session of the same day (D-033), shown as an extra session. */
  extra: boolean;
  /** `engine`: prescribed by a program version · `off_plan` · `unknown` (before W-1). */
  source: 'engine' | 'off_plan' | 'unknown';
  programId: string | null;
  /** The structural decision the prescription followed (W-5), if any. */
  adjustmentId: string | null;
  focus: string | null;
  variant: SessionVariant;
  /** Minutes of the variant as prescribed (the duration every screen announced). */
  minutes: number | null;
  status: SessionStatus;
  movedTo: IsoDate | null;
  /** Declared reason: stopped early, skipped, or the activity done instead. */
  reason: string | null;
  replacedBy: string | null;
  /** Felt difficulty, 1 very easy … 5 very hard (USER_REPORTED). */
  difficulty: number | null;
  exercises: ExerciseComparison[];
  /** Sets planned and done; `setsPlanned` null without a prescription. */
  setsPlanned: number | null;
  setsDone: number;
}

const OVER: readonly SessionStatus[] = ['completed', 'partial', 'stopped'];

/** The session was done (in full, in part, or ended early): its sets count. */
export function isDone(status: SessionStatus): boolean {
  return OVER.includes(status);
}

function unitOf(sets: readonly LoggedSet[]): SetUnit {
  return sets.some((s) => s.seconds !== undefined) ? 'seconds' : 'reps';
}

/** Planned vs done for one session, from its stored prescription and its records. */
export function compareSession(input: {
  records: Pick<TrainingRecords, 'prescriptions' | 'sessionIds'>;
  facts: CompareFacts;
  key: SessionKey;
  today: IsoDate;
}): SessionComparison {
  const { records, facts, key, today } = input;
  const { date, sessionIndex } = parseSessionKey(key);
  const p: PrescribedSession | null = prescriptionFor(records, key);
  const done = facts.completedSessions.find((c) => c.date === date && c.sessionIndex === sessionIndex) ?? null;
  const outcome = done ? null : (facts.sessionOutcomes?.[key] ?? null);
  const variant: SessionVariant = done?.variant ?? facts.sessionVariants?.[key] ?? 'full';
  const sets = facts.setLogs[key] ?? {};
  const reports = facts.exerciseReports?.[key] ?? {};
  const swaps = facts.exerciseSwaps?.[key] ?? {};
  const swapReasons = facts.swapReasons?.[key] ?? {};

  // The rows of the variant actually used; the full ones when the variant was never stored.
  const variantRows = p?.exercises.filter((e) => e.variant === variant) ?? [];
  const rows = variantRows.length > 0 ? variantRows : (p?.exercises.filter((e) => e.variant === 'full') ?? []);
  const planned = p ? sessionExercises({ planned: rows }, swaps) : [];
  const result = sessionResult({ completed: done, outcome, exercises: planned, sets, reports });
  const movedTo = p && result === 'planned' && p.date === date ? (facts.rescheduled?.[date] ?? null) : null;
  const status: SessionStatus = movedTo ? 'moved' : result === 'planned' && date < today && p ? 'not_recorded' : result;
  const over = isDone(status);

  const exercises: ExerciseComparison[] = p
    ? planned.map((ex) => {
        const done_ = sets[ex.exerciseId] ?? [];
        const report = reports[ex.prescribedId];
        const st = exerciseStatus(ex, done_, report);
        const outcome_: ExerciseOutcome =
          st === 'not_performed'
            ? 'not_performed'
            : st === 'done'
              ? 'done'
              : st === 'in_progress'
                ? over
                  ? 'partial'
                  : 'pending'
                : over
                  ? 'not_recorded'
                  : 'pending';
        return {
          prescribedId: ex.prescribedId,
          exerciseId: ex.exerciseId,
          replaced: ex.replaced,
          replacedReason: ex.replaced ? (swapReasons[ex.prescribedId] ?? null) : null,
          notPerformedReason: st === 'not_performed' ? (report?.notPerformedReason ?? null) : null,
          outcome: outcome_,
          unit: ex.unit,
          setsPlanned: ex.sets,
          setsDone: Math.min(ex.sets, done_.length),
          sets: [...done_],
        };
      })
    : // No prescription stored: only what was recorded, nothing to compare with.
      Object.entries(sets)
        .filter(([, s]) => s.length > 0)
        .map(([exerciseId, s]) => ({
          prescribedId: exerciseId,
          exerciseId,
          replaced: false,
          replacedReason: null,
          notPerformedReason: null,
          outcome: 'done' as const,
          unit: unitOf(s),
          setsPlanned: null,
          setsDone: s.length,
          sets: [...s],
        }));

  return {
    key,
    date,
    sessionIndex,
    extra: facts.sessionSlots?.[key] !== undefined,
    source: p ? 'engine' : (facts.sessionSources?.[key]?.source ?? (done ? 'unknown' : 'off_plan')),
    programId: p?.programId ?? facts.sessionSources?.[key]?.programId ?? null,
    adjustmentId: p?.adjustmentId ?? null,
    focus: p?.focus ?? null,
    variant,
    minutes: p ? variantMinutes(p, variant) : null,
    status,
    movedTo,
    reason: done?.stopped ?? outcome?.reason ?? null,
    replacedBy: outcome?.status === 'replaced' ? (outcome.replacedBy ?? null) : null,
    difficulty: facts.sessionDifficulty?.[key] ?? null,
    exercises,
    setsPlanned: p ? exercises.reduce((n, e) => n + (e.setsPlanned ?? 0), 0) : null,
    setsDone: exercises.reduce((n, e) => n + e.setsDone, 0),
  };
}

/** Every session key of a period: prescribed (live), done, or declared skipped / replaced. */
export function sessionKeysBetween(
  records: Pick<TrainingRecords, 'sessionIds'>,
  facts: CompareFacts,
  from: IsoDate,
  to: IsoDate,
): SessionKey[] {
  const inRange = (k: SessionKey) => {
    const d = parseSessionKey(k).date;
    return d >= from && d <= to;
  };
  const keys = new Set<SessionKey>([
    ...Object.keys(records.sessionIds).filter(inRange),
    ...facts.completedSessions.map((c) => sessionKey(c.date, c.sessionIndex)).filter(inRange),
    ...Object.keys(facts.sessionOutcomes ?? {}).filter(inRange),
    ...Object.keys(facts.setLogs).filter((k) => inRange(k) && Object.values(facts.setLogs[k]).some((s) => s.length)),
  ]);
  return [...keys].sort();
}

/** One week, planned vs done, in facts (the Progress Journey line and the history header). */
export interface WeekComparison {
  weekStart: IsoDate;
  sessions: SessionComparison[];
  /** Sessions the program planned (a moved session counts once, on its new day). */
  planned: number;
  /** Planned sessions done, in any version (full, short, light, ended early). */
  done: number;
  /** Planned sessions replaced by a light activity: adapted, not missed. */
  adapted: number;
  /** Sessions done outside the program (off plan, or an extra session of a day). */
  extra: number;
  /** Planned sessions still ahead this week. */
  ahead: number;
  /** Sets of the sessions done that had a prescription: planned and done. */
  setsPlanned: number;
  setsDone: number;
}

export function compareWeek(input: {
  records: Pick<TrainingRecords, 'prescriptions' | 'sessionIds'>;
  facts: CompareFacts;
  weekStart: IsoDate;
  today: IsoDate;
}): WeekComparison {
  const { records, facts, weekStart, today } = input;
  const end = addDays(weekStart, 6);
  const sessions = sessionKeysBetween(records, facts, weekStart, end).map((key) =>
    compareSession({ records, facts, key, today }),
  );
  const programmed = sessions.filter((s) => s.source === 'engine' && !s.extra && s.status !== 'moved');
  const doneWithPlan = sessions.filter((s) => isDone(s.status) && s.setsPlanned !== null);
  return {
    weekStart,
    sessions,
    planned: programmed.length,
    done: programmed.filter((s) => isDone(s.status)).length,
    adapted: programmed.filter((s) => s.status === 'replaced').length,
    extra: sessions.filter((s) => (s.source !== 'engine' || s.extra) && isDone(s.status)).length,
    ahead: programmed.filter((s) => s.status === 'planned' && s.date >= today).length,
    setsPlanned: doneWithPlan.reduce((n, s) => n + (s.setsPlanned ?? 0), 0),
    setsDone: doneWithPlan.reduce((n, s) => n + s.setsDone, 0),
  };
}
