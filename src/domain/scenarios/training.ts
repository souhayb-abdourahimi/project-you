/**
 * MOCK training week for tests and demos (W-2): what the app publishes and freezes for a scenario,
 * through the same engines as the app (`ensureProgram`, `planWeek`, `ensureWeek`).
 */
import { planWeek } from '../planning/engine';
import type { UserContextSnapshot } from '../profile/schemas';
import type { IsoDate } from '../shared/dates';
import { ensureProgram, ensureWeek, type TrainingFacts, type TrainingRecords } from '../training/week';

export const EMPTY_FACTS: TrainingFacts = { setLogs: {}, completedSessions: [] };

export function emptyRecords(): TrainingRecords {
  return { programs: [], prescriptions: {}, superseded: {}, sessionIds: {} };
}

/** Workout slots the planning engine gives a scenario for a week. */
export function scheduledWeek(snapshot: UserContextSnapshot, weekStart: IsoDate) {
  return planWeek({ weekStart, schedule: snapshot.schedule, training: snapshot.training }).days.flatMap((d) =>
    d.items.flatMap((i) => (i.kind === 'workout' ? [{ date: d.date, sessionIndex: i.sessionIndex }] : [])),
  );
}

/** Publishes (if needed) and freezes the week, exactly like `usePlan` does on a device. */
export function publishWeek(
  snapshot: UserContextSnapshot,
  input: {
    records?: TrainingRecords;
    facts?: TrainingFacts;
    rescheduled?: Record<IsoDate, IsoDate>;
    today: IsoDate;
    weekStart: IsoDate;
    seed: string;
    at: string;
    adjustmentId?: string | null;
  },
): TrainingRecords {
  const records = input.records ?? emptyRecords();
  const programs =
    ensureProgram({
      programs: records.programs,
      goal: snapshot.goal.type,
      training: snapshot.training,
      today: input.today,
      weekStart: input.weekStart,
      seed: input.seed,
      publishedAt: input.at,
      adjustmentId: input.adjustmentId ?? null,
    }) ?? records.programs;
  const next = { ...records, programs };
  return (
    ensureWeek({
      records: next,
      facts: input.facts ?? EMPTY_FACTS,
      rescheduled: input.rescheduled ?? {},
      today: input.today,
      weekStart: input.weekStart,
      scheduled: scheduledWeek(snapshot, input.weekStart),
      prescribedAt: input.at,
    }) ?? next
  );
}
