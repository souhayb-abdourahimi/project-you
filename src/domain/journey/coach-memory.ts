/**
 * What the coach asked and what the user answered (W-7, D-039): the cause the user picked for
 * sessions that did not happen, and the preferences the user confirmed. Nothing is inferred:
 * an observation leads to a question, only the answer is kept, and a confirmed preference is
 * visible and can be forgotten at any time.
 *
 * Storage (no migration): each answer is a row of the `adjustments` journal (append-only, synced,
 * owner-only RLS, exported and deleted with the account), with a `coach.` change key and its own
 * proposal id. Forgetting is a `reverted` row on the same proposal; the latest gesture wins on
 * every device, as for the adaptation decisions (D-037). These rows are not adaptation
 * decisions: `effectiveDecisions` leaves them out, and they never change a target, a load or a
 * program. The `coach_memory` table stays unused (D-039).
 */
import { addDays, daysBetween, startOfWeek, weekdayOf, type IsoDate, type Weekday } from '../shared/dates';
import type { Adjustment } from './adjustments';
import type { DayLog, SessionOutcome } from './outcomes';
import type { WeeklyCheckin } from './weekly-checkin';

/** Change keys of the coach's own entries in the journal. */
export const COACH_PREFIX = 'coach.';
export const isCoachEntry = (a: Pick<Adjustment, 'changeKey'>) => a.changeKey.startsWith(COACH_PREFIX);

/** "Qu'est-ce qui t'a le plus bloqué ?" — closed answers only, never free text. */
export const BLOCKERS = ['time', 'fatigue', 'pain', 'motivation', 'schedule', 'equipment', 'other'] as const;
export type Blocker = (typeof BLOCKERS)[number];

/**
 * Delays of the coach, in one place (§29). Urgent (safety) and today's action have no delay; an
 * observation waits a few days between two showings; a review is weekly; a structural change needs
 * a persistent signal (the Adaptation Engine's own windows).
 */
export const CADENCE = {
  /** Days read to notice that planned sessions did not happen. */
  observationDays: 14,
  /** Planned sessions without any record in that window before the question is asked. */
  minNotHappened: 2,
  /** A cause the user gave stays "recent" this long: the question is not asked again. */
  causeValidDays: 14,
  /** An observation shown without an answer waits this long before it is shown again. */
  observationPauseDays: 3,
  /** At most this many showings of the same question in `observationDays`. */
  maxShowings: 2,
  /** "Pas maintenant" on a question. */
  postponeDays: 7,
  /** Weeks read for a habit (short sessions on the same weekday). */
  habitWeeks: 6,
  /** "Non merci" or "Oublier": asked again only after this many new occurrences. */
  habitRepeat: 2,
  /** Days after an adaptation ends during which its follow-up can be said (once). */
  followUpDays: 7,
  /** Planned sessions needed after a change before anything is said about it. */
  minHindsightSessions: 2,
  /** The weekly review (bilan) cadence. */
  reviewDays: 7,
} as const;

/** A coach entry in force, by proposal: the latest gesture. */
export function coachEntries(adjustments: readonly Adjustment[]): Adjustment[] {
  const latest = new Map<string, Adjustment>();
  for (const a of [...adjustments]
    .filter(isCoachEntry)
    .sort((x, y) => x.decidedAt.localeCompare(y.decidedAt) || x.id.localeCompare(y.id))) {
    latest.set(a.proposalId ?? a.id, a);
  }
  return [...latest.values()];
}

// ---------------------------------------------------------------------------------------------
// Cause of sessions that did not happen
// ---------------------------------------------------------------------------------------------

const BLOCKER_KEY = 'coach.blocker';

/** The answer to the cause question, as a journal row (pure: id and time come from the caller). */
export function blockerAnswer(input: {
  id: string;
  cause: Blocker | null;
  /** `postponed`: "Pas maintenant", the question waits. */
  status: 'applied' | 'postponed';
  notHappened: number;
  today: IsoDate;
  decidedAt: string;
}): Adjustment {
  return {
    id: input.id,
    kind: 'planning',
    changeKey: BLOCKER_KEY,
    from: null,
    to: input.status === 'applied' ? input.cause : null,
    reasonKey: 'coach.question.blocker',
    evidence: { sessions: input.notHappened, days: CADENCE.observationDays },
    status: input.status,
    effectiveFrom: input.today,
    decidedAt: input.decidedAt,
    // One question per day at most: a second answer the same day replaces the first.
    proposalId: `coach:blocker:${input.today}`,
    scope: null,
    effectiveTo: null,
    sessionCount: null,
  };
}

const FROM_SESSION_REASON: Partial<Record<NonNullable<SessionOutcome['reason']>, Blocker>> = {
  no_time: 'time',
  tired: 'fatigue',
  pain: 'pain',
  no_motivation: 'motivation',
  schedule: 'schedule',
  other: 'other',
};
const FROM_MAIN_PROBLEM: Partial<Record<NonNullable<WeeklyCheckin['mainProblem']>, Blocker>> = {
  time: 'time',
  fatigue: 'fatigue',
  pain: 'pain',
  motivation: 'motivation',
  schedule: 'schedule',
  other: 'other',
};

export interface DeclaredCause {
  /** Null: a cause the coach has no action for (sleep, budget…), still a reason not to ask. */
  cause: Blocker | null;
  on: IsoDate;
  source: 'question' | 'session' | 'weekly_checkin';
}

export interface BlockerSignal {
  /** Planned sessions in the window with nothing recorded (no session, no declared outcome). */
  notHappened: number;
  /** The latest cause the user gave in the window, wherever they gave it. */
  recent: DeclaredCause | null;
  /** Answered today through the question: today's action follows it. */
  answeredToday: Blocker | null;
  /** Ask today (before the screen's own anti-repetition). */
  ask: boolean;
}

/**
 * Should the coach ask what got in the way? Only from facts: planned sessions of the last days
 * with nothing recorded. Never when the user already said why recently (the question, a session
 * outcome or the weekly check-in), never right after "Pas maintenant".
 */
export function blockerSignal(input: {
  today: IsoDate;
  /** First day of the journey: nothing planned before it counts. */
  startedOn?: IsoDate;
  plannedDates: readonly IsoDate[];
  doneDates: readonly IsoDate[];
  /** Keyed `${date}#${sessionIndex}`. */
  outcomes: Record<string, SessionOutcome>;
  weeklyCheckins: readonly Pick<WeeklyCheckin, 'weekStart' | 'mainProblem' | 'answeredAt'>[];
  adjustments: readonly Adjustment[];
}): BlockerSignal {
  const { today } = input;
  const from = addDays(today, -CADENCE.observationDays);
  const inWindow = (d: IsoDate) => d >= from && d < today;
  const started = (d: IsoDate) => !input.startedOn || d >= input.startedOn;
  const declared = new Set(Object.keys(input.outcomes).map((k) => k.split('#')[0]));
  const done = new Set(input.doneDates);
  // A day counts once (two sessions the same day are rare and counted as one observation).
  const notHappened = [...new Set(input.plannedDates.filter((d) => inWindow(d) && started(d)))].filter(
    (d) => !done.has(d) && !declared.has(d),
  ).length;

  const causes: DeclaredCause[] = [];
  const answers = coachEntries(input.adjustments).filter((a) => a.changeKey === BLOCKER_KEY);
  for (const a of answers) {
    if (a.status === 'applied' && daysBetween(a.effectiveFrom, today) < CADENCE.causeValidDays)
      causes.push({ cause: (a.to as Blocker | null) ?? null, on: a.effectiveFrom, source: 'question' });
  }
  for (const [key, o] of Object.entries(input.outcomes)) {
    const date = key.split('#')[0];
    if (o.reason && inWindow(date))
      causes.push({ cause: FROM_SESSION_REASON[o.reason] ?? null, on: date, source: 'session' });
  }
  for (const c of input.weeklyCheckins) {
    const on = c.answeredAt.slice(0, 10);
    if (c.mainProblem && c.mainProblem !== 'none' && on >= from && on <= today)
      causes.push({ cause: FROM_MAIN_PROBLEM[c.mainProblem] ?? null, on, source: 'weekly_checkin' });
  }
  const recent = causes.sort((a, b) => a.on.localeCompare(b.on)).at(-1) ?? null;
  const answer = answers.find((a) => a.effectiveFrom === today && a.status === 'applied');
  const postponed = answers.some(
    (a) => a.status === 'postponed' && daysBetween(a.effectiveFrom, today) < CADENCE.postponeDays,
  );
  return {
    notHappened,
    recent,
    answeredToday: (answer?.to as Blocker | undefined) ?? null,
    ask: notHappened >= CADENCE.minNotHappened && !recent && !postponed,
  };
}

// ---------------------------------------------------------------------------------------------
// Confirmed preferences: short sessions on a given weekday
// ---------------------------------------------------------------------------------------------

const SHORT_DAY_KEY = 'coach.memory.short_day';
const shortDayProposal = (weekday: Weekday) => `coach:memory:short_day.${weekday}`;

/** A preference the user confirmed, shown in "Ce que le coach retient" with "Oublier". */
export interface CoachMemoryItem {
  kind: 'short_day';
  weekday: Weekday;
  since: IsoDate;
  /** The row in force: "Oublier" records a revert of it. */
  decision: Adjustment;
}

export interface ShortDayMemory {
  /** Weekdays where the user asked the coach to keep the short format in mind. */
  remembered: Weekday[];
  /** An observation worth a question: short chosen this many times on this weekday. */
  question: { weekday: Weekday; count: number } | null;
  confirmed: CoachMemoryItem[];
}

/** The answer to "Tu veux que je garde ce format en tête pour ce jour ?" (or "Oublier"). */
export function shortDayAnswer(input: {
  id: string;
  weekday: Weekday;
  count: number;
  status: 'applied' | 'declined' | 'postponed';
  today: IsoDate;
  decidedAt: string;
}): Adjustment {
  return {
    id: input.id,
    kind: 'planning',
    changeKey: SHORT_DAY_KEY,
    from: input.weekday,
    to: input.status === 'applied' ? 'short' : null,
    reasonKey: 'coach.question.short_day',
    evidence: { times: input.count, weeks: CADENCE.habitWeeks },
    status: input.status,
    effectiveFrom: input.today,
    decidedAt: input.decidedAt,
    proposalId: shortDayProposal(input.weekday),
    scope: input.status === 'applied' ? 'durable' : null,
    effectiveTo: null,
    sessionCount: null,
  };
}

/**
 * Short sessions the user chose ("J'ai 15 minutes") on the same weekday, several weeks: a question,
 * never a rule. Only the user's own choice counts (a short session decided by the coach on a
 * comeback or a difficult day is not a preference).
 */
export function shortDayMemory(input: {
  today: IsoDate;
  dayLogs: readonly Pick<DayLog, 'date' | 'mode'>[];
  adjustments: readonly Adjustment[];
}): ShortDayMemory {
  const { today } = input;
  const from = addDays(startOfWeek(today), -7 * CADENCE.habitWeeks);
  const chosen = input.dayLogs.filter((d) => d.mode === 'short' && d.date >= from && d.date < today);
  const entries = coachEntries(input.adjustments).filter((a) => a.changeKey === SHORT_DAY_KEY);
  const confirmed: CoachMemoryItem[] = entries
    .filter((a) => a.status === 'applied')
    .map((a) => ({
      kind: 'short_day' as const,
      weekday: Number(a.from) as Weekday,
      since: a.effectiveFrom,
      decision: a,
    }))
    .sort((a, b) => a.weekday - b.weekday);
  const byDay = new Map<Weekday, IsoDate[]>();
  for (const d of chosen) byDay.set(weekdayOf(d.date), [...(byDay.get(weekdayOf(d.date)) ?? []), d.date]);

  let question: ShortDayMemory['question'] = null;
  for (const [weekday, dates] of [...byDay.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])) {
    const entry = entries.find((a) => Number(a.from) === weekday);
    if (entry?.status === 'applied') continue;
    if (entry?.status === 'postponed' && daysBetween(entry.effectiveFrom, today) < CADENCE.postponeDays) continue;
    // After "Non merci" or "Oublier": only new occurrences can bring the question back.
    const counted = entry && entry.status !== 'postponed' ? dates.filter((d) => d > entry.effectiveFrom) : dates;
    if (counted.length >= CADENCE.habitRepeat) {
      question = { weekday, count: counted.length };
      break;
    }
  }
  return { remembered: confirmed.map((c) => c.weekday), question, confirmed };
}
