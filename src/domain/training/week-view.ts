/**
 * The week as it was planned and lived (W-6, D-038). Past days are read from the prescriptions
 * stored for them (what was planned that day, D-033), never from the current schedule: a profile
 * changed on Wednesday no longer rewrites Monday. Today and the days ahead follow the current
 * schedule (after reschedules), which `ensureWeek` freezes.
 */
import type { PlannedDay, SessionLocation } from '../planning/engine';
import { addDays, type IsoDate } from '../shared/dates';
import { parseSessionKey, sessionKey, type SessionKey } from '../shared/ids';
import {
  compareSession,
  sessionKeysBetween,
  weekPrescriptionKnown,
  type CompareFacts,
  type SessionComparison,
} from './compare';
import type { TrainingRecords } from './week';

export interface ProgramSlot {
  location: SessionLocation;
  start: string | null;
  end: string | null;
  /** `short` when the schedule only had a short slot that day. */
  variant: 'full' | 'short';
}

export interface ProgramSession extends SessionComparison {
  /** Where and when the schedule placed it (today and ahead; past days when still the same slot). */
  slot: ProgramSlot | null;
}

export interface ProgramDay {
  date: IsoDate;
  when: 'past' | 'today' | 'future';
  /** A past day of a week without any stored prescription: its plan is unknown (W-7.1). */
  prescriptionUnknown: boolean;
  sessions: ProgramSession[];
}

type Records = Pick<TrainingRecords, 'prescriptions' | 'sessionIds'>;

function slotOf(day: PlannedDay | undefined, sessionIndex: number): ProgramSlot | null {
  const item = day?.items.find((i) => i.kind === 'workout' && i.sessionIndex === sessionIndex);
  return item?.kind === 'workout'
    ? { location: item.location, start: item.start, end: item.end, variant: item.variant }
    : null;
}

function scheduledKeys(day: PlannedDay | undefined): SessionKey[] {
  return (day?.items ?? []).flatMap((i) => (i.kind === 'workout' ? [sessionKey(day!.date, i.sessionIndex)] : []));
}

/** The seven days of a week: past days from their records, today and ahead from the schedule. */
export function programWeek(input: {
  weekStart: IsoDate;
  today: IsoDate;
  /** The current schedule of the week (after reschedules). */
  schedule: readonly PlannedDay[];
  records: Records;
  facts: CompareFacts;
}): ProgramDay[] {
  const { weekStart, today, schedule, records, facts } = input;
  const known = weekPrescriptionKnown(records, weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const day = schedule.find((d) => d.date === date);
    const recorded = sessionKeysBetween(records, facts, date, date);
    const keys = date < today ? recorded : [...new Set([...scheduledKeys(day), ...recorded])].sort();
    return {
      date,
      when: date < today ? 'past' : date === today ? 'today' : 'future',
      prescriptionUnknown: date < today && !known,
      sessions: keys.map((key) => ({
        ...compareSession({ records, facts, key, today }),
        slot: slotOf(day, parseSessionKey(key).sessionIndex),
      })),
    };
  });
}

/**
 * Days with a planned session over several weeks, for adherence (journey/adherence.ts). Past days
 * are read from their stored prescriptions (a moved session counts on its new day, an extra
 * session not at all). A week without any (before W-2, or the app not opened that week) gives no
 * planned day for its past: its plan is unknown, never rebuilt from today's profile (W-7.1, see
 * `unknownPrescriptionDates`). Today and ahead: the schedule.
 */
export function plannedSessionDates(input: {
  records: Records;
  facts: CompareFacts;
  today: IsoDate;
  weeks: readonly { weekStart: IsoDate; schedule: readonly PlannedDay[] }[];
}): IsoDate[] {
  const { records, facts, today } = input;
  const dates = new Set<IsoDate>();
  for (const { weekStart, schedule } of input.weeks) {
    const lastPast = addDays(today, -1);
    const end = addDays(weekStart, 6);
    const pastEnd = end < lastPast ? end : lastPast;
    const planned = (date: IsoDate) => schedule.some((d) => d.date === date && scheduledKeys(d).length > 0);
    const recorded =
      pastEnd >= weekStart
        ? Object.keys(records.sessionIds)
            .filter((k) => {
              const d = parseSessionKey(k).date;
              return d >= weekStart && d <= pastEnd && records.prescriptions[records.sessionIds[k]];
            })
            .map((key) => compareSession({ records, facts, key, today }))
            .filter((s) => !s.extra && s.status !== 'moved')
        : [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      if (date < today ? recorded.some((s) => s.date === date) : planned(date)) dates.add(date);
    }
  }
  return [...dates].sort();
}

/**
 * Past days whose plan is unknown: the days of weeks without any stored prescription (W-7.1).
 * Adherence leaves them out on both sides (no invented denominator, no session counted against
 * nothing); screens say « Prescription d'origine indisponible ».
 */
export function unknownPrescriptionDates(input: {
  records: Records;
  today: IsoDate;
  weeks: readonly { weekStart: IsoDate }[];
}): IsoDate[] {
  return input.weeks
    .filter((w) => !weekPrescriptionKnown(input.records, w.weekStart))
    .flatMap((w) => Array.from({ length: 7 }, (_, i) => addDays(w.weekStart, i)))
    .filter((d) => d < input.today)
    .sort();
}
