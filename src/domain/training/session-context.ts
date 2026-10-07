/**
 * The context a session was done in, and what it may say about the level (W-7.1). One matrix for
 * every reader of trends: the progression engine (plateau, downward trend, PERFORMANCE_DOWN), the
 * Progress Journey trends, the records and the first-record milestone. A session made lighter on
 * purpose (light day or week, restart, reduced volume) is never read as a plateau or a decline,
 * and a lighter day never sets the reference a "record" is measured against.
 *
 * | context  | level (plateau, decline, trend)      | records |
 * |----------|--------------------------------------|---------|
 * | full     | yes                                  | yes     |
 * | off_plan | yes                                  | yes     |
 * | short    | only when the top of the range is met | yes     |
 * | reduced  | no (fewer sets on purpose)           | yes     |
 * | light    | no                                   | no      |
 * | restart  | no (lower loads and effort on purpose) | no    |
 *
 * An easier variant is its own exercise with its own history: it is read as `full` there, and the
 * exercise it stands for keeps its own history untouched.
 */
import type { Adjustment } from '../journey/adjustments';
import type { SessionKey } from '../shared/ids';
import type { IsoDate } from '../shared/dates';
import type { SessionVariant } from './adapt';
import type { PrescribedSession } from './program';
import { structureKey } from './structure';

export type SessionContext = 'full' | 'off_plan' | 'short' | 'reduced' | 'light' | 'restart';

export const SESSION_CONTEXT: Record<SessionContext, { level: 'yes' | 'if_top' | 'no'; records: boolean }> = {
  full: { level: 'yes', records: true },
  off_plan: { level: 'yes', records: true },
  short: { level: 'if_top', records: true },
  reduced: { level: 'no', records: true },
  light: { level: 'no', records: false },
  restart: { level: 'no', records: false },
};

/**
 * The context of one session, from the variant done and the structural change its prescription
 * followed (normalised: an end-of-cycle light week is a light week). The lighter reading wins.
 */
export function sessionContext(input: {
  variant: SessionVariant | 'off_plan' | null | undefined;
  structure?: Pick<Adjustment, 'changeKey' | 'to'> | null;
}): SessionContext {
  const structure = input.structure ? structureKey(input.structure) : null;
  if (input.variant === 'light' || structure === 'light_week') return 'light';
  if (structure === 'restart') return 'restart';
  if (structure === 'reduce_volume') return 'reduced';
  if (input.variant === 'short') return 'short';
  return input.variant === 'off_plan' ? 'off_plan' : 'full';
}

/** The facts the contexts are read from (the data store passes itself). */
export interface ContextFacts {
  completedSessions: readonly { date: IsoDate; sessionIndex: number; variant?: SessionVariant }[];
  sessionVariants?: Record<SessionKey, SessionVariant>;
  prescriptions?: Record<string, PrescribedSession>;
  sessionIds?: Record<SessionKey, string>;
  adjustments?: readonly Adjustment[];
}

/** The context of every session with a record (logged sets, completion or prescription). */
export function sessionContexts(facts: ContextFacts): Record<SessionKey, SessionContext> {
  const completed = new Map(facts.completedSessions.map((c) => [`${c.date}#${c.sessionIndex}`, c.variant]));
  const decisions = new Map((facts.adjustments ?? []).map((a) => [a.id, a]));
  const keys = new Set<SessionKey>([
    ...completed.keys(),
    ...Object.keys(facts.sessionVariants ?? {}),
    ...Object.keys(facts.sessionIds ?? {}),
  ]);
  const out: Record<SessionKey, SessionContext> = {};
  for (const key of keys) {
    const id = facts.sessionIds?.[key];
    const prescription = id ? facts.prescriptions?.[id] : undefined;
    // The variant done (a light or short day off plan is still light or short), as the history reads it.
    const declared = completed.get(key) ?? facts.sessionVariants?.[key];
    const variant = declared && declared !== 'full' ? declared : prescription ? 'full' : 'off_plan';
    const structure = prescription?.adjustmentId ? (decisions.get(prescription.adjustmentId) ?? null) : null;
    out[key] = sessionContext({ variant, structure });
  }
  return out;
}
