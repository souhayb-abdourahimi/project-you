/**
 * The history the progression engine reads (W-4, D-035): for one exercise, the sessions where it
 * was really done, with the prescription in force that day and what was declared around it. Built
 * from stored facts only; every missing piece stays missing.
 *
 * - The sets of a replacement belong to the replacement exercise (its own history); the exercise
 *   it replaced gets a "replaced" entry with the reason, never the sets of another movement.
 * - The prescription of a session is the one stored for it (D-033), never recomputed.
 */
import type { Adjustment } from '../journey/adjustments';
import { checkinSignals, declaredFatigue, type DayLog } from '../journey/outcomes';
import { addDays, type IsoDate } from '../shared/dates';
import { parseSessionKey, type SessionKey } from '../shared/ids';
import type { SessionVariant } from './adapt';
import type { PrescribedSession } from './program';
import { PROGRESSION, type Exposure, type LoggedSet, type NotDone } from './progression';
import type { ReplacementReason } from './replacement';
import type { ExerciseReport } from './session';

/** The facts the history reads (the data store passes itself). */
export interface HistoryFacts {
  setLogs: Record<SessionKey, Record<string, LoggedSet[]>>;
  completedSessions: readonly { date: IsoDate; sessionIndex: number; variant?: SessionVariant; stopped?: string }[];
  sessionVariants?: Record<SessionKey, SessionVariant>;
  sessionDifficulty?: Record<SessionKey, number>;
  exerciseSwaps?: Record<SessionKey, Record<string, string>>;
  swapReasons?: Record<SessionKey, Record<string, ReplacementReason>>;
  exerciseReports?: Record<SessionKey, Record<string, ExerciseReport>>;
  /** Daily check-ins: the fatigue declared around a session (journey definition). */
  dayLogs?: readonly DayLog[];
  /** Adaptation decisions: the structural change a prescription followed (W-5). */
  adjustments?: readonly Adjustment[];
}

export interface ExerciseHistory {
  exposures: Exposure[];
  notDone: NotDone[];
  /** Planned sessions with this exercise that were done, over the window; null when none was planned. */
  adherence: number | null;
}

type Records = { prescriptions: Record<string, PrescribedSession>; sessionIds: Record<SessionKey, string> };

/**
 * History of one exercise over the window before `before` (the date of the session being
 * prescribed). `today` bounds what counts as missed: a planned session still ahead is not missed.
 */
export function exerciseHistory(input: {
  exerciseId: string;
  records: Records;
  facts: HistoryFacts;
  before: IsoDate;
  today: IsoDate;
}): ExerciseHistory {
  const { exerciseId, records, facts, before } = input;
  const from = addDays(before, -PROGRESSION.windowDays);
  const inWindow = (date: IsoDate) => date >= from && date < before;
  const checkins = checkinSignals(facts.dayLogs ?? []);
  const exposures: Exposure[] = [];
  const notDone: NotDone[] = [];
  let planned = 0;
  let donePlanned = 0;

  const keys = new Set([...Object.keys(facts.setLogs), ...Object.keys(records.sessionIds)]);
  for (const key of [...keys].sort()) {
    const { date, sessionIndex } = parseSessionKey(key);
    if (!inWindow(date)) continue;
    const prescription = records.sessionIds[key] ? records.prescriptions[records.sessionIds[key]] : undefined;
    const completed = facts.completedSessions.find((c) => c.date === date && c.sessionIndex === sessionIndex);
    // The variant done (a light or short day off plan is still light or short).
    const declared = completed?.variant ?? facts.sessionVariants?.[key];
    const variant: Exposure['variant'] =
      declared && declared !== 'full' ? declared : prescription ? 'full' : 'off_plan';
    const swaps = facts.exerciseSwaps?.[key] ?? {};
    const replacedFrom = Object.entries(swaps).find(([, to]) => to === exerciseId)?.[0] ?? null;
    const rows = prescription?.exercises ?? [];
    const row =
      replacedFrom === null ? (rows.find((r) => r.variant === variant && r.exerciseId === exerciseId) ?? null) : null;
    const isPlanned = rows.some((r) => r.variant === 'full' && r.exerciseId === exerciseId);
    const sets = (facts.setLogs[key]?.[exerciseId] ?? []).filter((s) => (s.seconds ?? s.reps) >= 1);
    const report = facts.exerciseReports?.[key]?.[replacedFrom ?? exerciseId];

    if (isPlanned && (date < input.today || sets.length > 0)) planned++;
    if (sets.length > 0) {
      if (isPlanned) donePlanned++;
      exposures.push({
        key,
        date,
        variant,
        prescribed: row
          ? { sets: row.sets, repsMin: row.repsMin, repsMax: row.repsMax, loadKg: row.targetLoadKg }
          : null,
        sets,
        exerciseDifficulty: report?.difficulty ?? null,
        sessionDifficulty: facts.sessionDifficulty?.[key] ?? null,
        fatigueHigh: declaredFatigue(checkins, date) === 'high',
        stopped: completed?.stopped ?? null,
        ...(prescription?.adjustmentId
          ? { structure: facts.adjustments?.find((a) => a.id === prescription.adjustmentId)?.changeKey ?? null }
          : {}),
      });
      continue;
    }
    const own = facts.exerciseReports?.[key]?.[exerciseId];
    if (own?.notPerformed) {
      notDone.push({ key, date, kind: 'not_performed', reason: own.notPerformedReason ?? null });
    } else if (swaps[exerciseId] && swaps[exerciseId] !== exerciseId) {
      notDone.push({ key, date, kind: 'replaced', reason: facts.swapReasons?.[key]?.[exerciseId] ?? null });
    }
  }
  return { exposures, notDone, adherence: planned > 0 ? Math.min(1, donePlanned / planned) : null };
}
