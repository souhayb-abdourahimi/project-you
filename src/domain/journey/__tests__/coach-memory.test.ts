import { addDays, weekdayOf } from '../../shared/dates';
import {
  appliedDecisions,
  effectiveDecisions,
  overriddenDecisions,
  revertDecision,
  type Adjustment,
} from '../adjustments';
import {
  blockerAnswer,
  blockerSignal,
  CADENCE,
  coachEntries,
  isCoachEntry,
  shortDayAnswer,
  shortDayMemory,
} from '../coach-memory';
import { journeyMemory } from '../memory';
import { decisionJournal } from '../training-history';

/** W-7 (D-039): causes and confirmed preferences, in the synced journal, never inferred. */

// 2026-09-30 is a Wednesday.
const TODAY = '2026-09-30';
const WED = weekdayOf(TODAY);
const at = (date: string, time = '09:00') => `${date}T${time}:00.000Z`;
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const signal = (patch: Partial<Parameters<typeof blockerSignal>[0]> = {}) =>
  blockerSignal({
    today: TODAY,
    plannedDates: [addDays(TODAY, -6), addDays(TODAY, -3)],
    doneDates: [],
    outcomes: {},
    weeklyCheckins: [],
    adjustments: [],
    ...patch,
  });

describe('blockerSignal: observe, then ask (§5, §7)', () => {
  it('two planned sessions with nothing recorded in the window: ask', () => {
    expect(signal()).toMatchObject({ notHappened: 2, recent: null, ask: true });
  });

  it('done, declared, or outside the window: not counted', () => {
    expect(signal({ doneDates: [addDays(TODAY, -6)] }).ask).toBe(false);
    expect(signal({ plannedDates: [addDays(TODAY, -20), addDays(TODAY, -3)] }).ask).toBe(false);
    // Before the journey started: nothing was planned for this person yet.
    expect(signal({ startedOn: addDays(TODAY, -4) }).notHappened).toBe(1);
    // Today is not over: never counted.
    expect(signal({ plannedDates: [TODAY, addDays(TODAY, -3)] }).notHappened).toBe(1);
  });

  it('a cause the user already gave recently: never asked again', () => {
    const skipped = {
      [`${addDays(TODAY, -3)}#0`]: { status: 'skipped' as const, reason: 'no_time' as const, at: at(TODAY) },
    };
    // The declared session is not counted either: the other one alone is not a pattern.
    expect(signal({ outcomes: skipped })).toMatchObject({ ask: false, recent: { cause: 'time', source: 'session' } });
    const weekly = [{ weekStart: '2026-09-21', mainProblem: 'sleep' as const, answeredAt: at(addDays(TODAY, -2)) }];
    expect(signal({ weeklyCheckins: weekly })).toMatchObject({
      ask: false,
      recent: { cause: null, source: 'weekly_checkin' },
    });
    const answer = blockerAnswer({
      id: id(),
      cause: 'fatigue',
      status: 'applied',
      notHappened: 2,
      today: addDays(TODAY, -5),
      decidedAt: at(addDays(TODAY, -5)),
    });
    expect(signal({ adjustments: [answer] })).toMatchObject({ ask: false, recent: { cause: 'fatigue' } });
    // Once the cause is old enough, the question can come back if the facts are still there.
    const later = addDays(TODAY, CADENCE.causeValidDays);
    expect(
      signal({ today: later, plannedDates: [addDays(later, -6), addDays(later, -3)], adjustments: [answer] }).ask,
    ).toBe(true);
  });

  it('answered today: the action of the day follows the answer; "Pas maintenant" waits', () => {
    const now = blockerAnswer({
      id: id(),
      cause: 'time',
      status: 'applied',
      notHappened: 2,
      today: TODAY,
      decidedAt: at(TODAY),
    });
    expect(signal({ adjustments: [now] })).toMatchObject({ answeredToday: 'time', ask: false });
    const later = blockerAnswer({
      id: id(),
      cause: null,
      status: 'postponed',
      notHappened: 2,
      today: TODAY,
      decidedAt: at(TODAY),
    });
    expect(signal({ adjustments: [later] }).ask).toBe(false);
    expect(
      signal({
        today: addDays(TODAY, CADENCE.postponeDays),
        plannedDates: [addDays(TODAY, 1), addDays(TODAY, 4)],
        adjustments: [later],
      }).ask,
    ).toBe(true);
  });

  it('a closed answer only, stored without any free text (§33, §41)', () => {
    const a = blockerAnswer({
      id: id(),
      cause: 'pain',
      status: 'applied',
      notHappened: 3,
      today: TODAY,
      decidedAt: at(TODAY),
    });
    expect(a).toMatchObject({
      kind: 'planning',
      changeKey: 'coach.blocker',
      to: 'pain',
      evidence: { sessions: 3, days: 14 },
    });
    // Fits the existing columns and their checks (no migration).
    expect(a.changeKey).toMatch(/^[a-z0-9_.]{1,60}$/);
    expect(a.reasonKey).toMatch(/^[a-z0-9_.]{1,80}$/);
    expect(a.proposalId).toMatch(/^[a-z0-9_.,:-]{1,160}$/);
  });
});

describe('short sessions on a weekday: observation → question → confirmation → memory (§8–11)', () => {
  const chosen = (...weeksAgo: number[]) =>
    weeksAgo.map((w) => ({ date: addDays(TODAY, -7 * w), mode: 'short' as const }));

  it('once is an event, not a habit: no question', () => {
    expect(shortDayMemory({ today: TODAY, dayLogs: chosen(1), adjustments: [] }).question).toBeNull();
  });

  it('twice the same weekday: a question; only "oui" makes it a memory', () => {
    const m = shortDayMemory({ today: TODAY, dayLogs: chosen(1, 2), adjustments: [] });
    expect(m.question).toEqual({ weekday: WED, count: 2 });
    expect(m.remembered).toEqual([]);
    // A short session the coach chose (comeback, difficult day) is not the user's choice.
    expect(
      shortDayMemory({
        today: TODAY,
        dayLogs: [{ date: addDays(TODAY, -7), mode: 'difficult' }, ...chosen(2)],
        adjustments: [],
      }).question,
    ).toBeNull();

    const yes = shortDayAnswer({
      id: id(),
      weekday: WED,
      count: 2,
      status: 'applied',
      today: TODAY,
      decidedAt: at(TODAY),
    });
    const after = shortDayMemory({ today: addDays(TODAY, 7), dayLogs: chosen(1, 2), adjustments: [yes] });
    expect(after.remembered).toEqual([WED]);
    expect(after.question).toBeNull();
    expect(after.confirmed).toEqual([{ kind: 'short_day', weekday: WED, since: TODAY, decision: yes }]);
  });

  it('"Non merci" or "Oublier": asked again only after new occurrences', () => {
    const no = shortDayAnswer({
      id: id(),
      weekday: WED,
      count: 2,
      status: 'declined',
      today: TODAY,
      decidedAt: at(TODAY),
    });
    expect(shortDayMemory({ today: addDays(TODAY, 7), dayLogs: chosen(1, 2), adjustments: [no] }).question).toBeNull();
    const newer = [
      ...chosen(1, 2),
      { date: addDays(TODAY, 7), mode: 'short' as const },
      { date: addDays(TODAY, 14), mode: 'short' as const },
    ];
    expect(shortDayMemory({ today: addDays(TODAY, 15), dayLogs: newer, adjustments: [no] }).question).toEqual({
      weekday: WED,
      count: 2,
    });

    const yes = shortDayAnswer({
      id: id(),
      weekday: WED,
      count: 2,
      status: 'applied',
      today: TODAY,
      decidedAt: at(TODAY),
    });
    const forget = revertDecision(yes, { id: id(), today: addDays(TODAY, 1), decidedAt: at(addDays(TODAY, 1)) });
    const m = shortDayMemory({ today: addDays(TODAY, 2), dayLogs: chosen(1, 2), adjustments: [yes, forget] });
    expect(m.remembered).toEqual([]);
    expect(m.question).toBeNull();
    // Both rows stay in the journal (append-only); the latest gesture is the one in force.
    expect(coachEntries([yes, forget])).toEqual([forget]);
  });
});

describe('the coach entries are not adaptation decisions (D-039)', () => {
  const answer = blockerAnswer({
    id: id(),
    cause: 'time',
    status: 'applied',
    notHappened: 2,
    today: TODAY,
    decidedAt: at(TODAY),
  });
  const yes = shortDayAnswer({
    id: id(),
    weekday: WED,
    count: 2,
    status: 'applied',
    today: TODAY,
    decidedAt: at(TODAY),
  });

  it('never in force as a plan change, a calorie offset, a history decision or a memory event', () => {
    const journal: Adjustment[] = [answer, yes];
    expect(journal.every(isCoachEntry)).toBe(true);
    expect(effectiveDecisions(journal).size).toBe(0);
    expect(appliedDecisions(journal)).toEqual([]);
    expect(overriddenDecisions(journal)).toEqual([]);
    expect(decisionJournal(journal)).toEqual([]);
    const memory = journeyMemory({
      completedDates: [],
      weighInDates: [],
      swapReasons: {},
      meals: [],
      milestones: {},
      adjustments: journal,
      confirmed: { refusedExerciseIds: [], dislikedRecipeIds: [], likedRecipeIds: [] },
    });
    expect(memory.events).toEqual([]);
  });

  it('multi-device: A confirms offline, B forgets later; after sync both rows exist, the later wins', () => {
    const onA = shortDayAnswer({
      id: id(),
      weekday: WED,
      count: 2,
      status: 'applied',
      today: TODAY,
      decidedAt: at(TODAY, '09:00'),
    });
    const onB = revertDecision(onA, { id: id(), today: TODAY, decidedAt: at(TODAY, '10:00') });
    for (const order of [
      [onA, onB],
      [onB, onA],
    ]) {
      const m = shortDayMemory({ today: addDays(TODAY, 1), dayLogs: [], adjustments: order });
      expect(m.remembered).toEqual([]);
    }
    // Two devices answering the cause question the same day: the later answer is the cause.
    const a1 = blockerAnswer({
      id: id(),
      cause: 'time',
      status: 'applied',
      notHappened: 2,
      today: TODAY,
      decidedAt: at(TODAY, '08:00'),
    });
    const b1 = blockerAnswer({
      id: id(),
      cause: 'fatigue',
      status: 'applied',
      notHappened: 2,
      today: TODAY,
      decidedAt: at(TODAY, '08:30'),
    });
    expect(signal({ adjustments: [b1, a1] }).answeredToday).toBe('fatigue');
    expect(signal({ adjustments: [a1, b1] }).answeredToday).toBe('fatigue');
  });
});
