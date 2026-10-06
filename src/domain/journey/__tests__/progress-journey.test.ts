import { addDays } from '../../shared/dates';
import { adherence } from '../adherence';
import {
  checkpointPath,
  milestoneFacts,
  milestonesReached,
  milestoneToCelebrate,
  type MilestoneInput,
} from '../milestones';
import { exerciseTrends, personalRecords, weekStreak, type ProgressData } from '../progress-facts';
import { bodyOrder, buildProgressJourney, type ProgressJourneyInput } from '../progress-journey';

const START = '2026-08-03'; // a Monday
const TODAY = '2026-09-30';

function empty(): ProgressData {
  return {
    completedSessions: [],
    setLogs: {},
    weights: [],
    waist: [],
    measurements: [],
    dayLogs: [],
    meals: [],
    weeklyCheckins: [],
  };
}

/** Sessions on Monday and Thursday of every week from `from` for `weeks` weeks. */
function twicePerWeek(from: string, weeks: number): ProgressData['completedSessions'] {
  return Array.from({ length: weeks }, (_, w) => [addDays(from, 7 * w), addDays(from, 7 * w + 3)])
    .flat()
    .map((date) => ({ date, sessionIndex: 0, variant: 'full' as const }));
}

function input(data: Partial<ProgressData>, extra: Partial<ProgressJourneyInput> = {}): ProgressJourneyInput {
  return {
    today: TODAY,
    startedOn: START,
    goal: 'fat_loss',
    plannedSessionsPerWeek: 3,
    noPush: false,
    data: { ...empty(), ...data },
    adherence: null,
    ...extra,
  };
}

describe('Progress Journey: since the start', () => {
  it('first day with nothing recorded is the empty state', () => {
    const p = buildProgressJourney(input({}, { today: START }));
    expect(p.empty).toBe(true);
    expect(p.sinceStart).toMatchObject({ days: 0, activeDays: 0, sessions: 0 });
    expect(p.milestones).toEqual([]);
  });

  it('counts days, active days (any recorded action), sessions and weekly regularity', () => {
    const p = buildProgressJourney(
      input({
        completedSessions: twicePerWeek(START, 3),
        weights: [{ date: '2026-09-29', weightKg: 80 }],
        dayLogs: [{ date: '2026-09-28', activity: 'walk', activityMinutes: 15 }],
        meals: [
          { date: '2026-09-27', status: 'skipped' },
          { date: '2026-09-26', status: 'planned' },
        ],
      }),
    );
    expect(p.sinceStart.days).toBe(58);
    expect(p.sinceStart.sessions).toBe(6);
    // 6 session days + weigh-in + walk + a marked meal; a meal left "planned" is not an action.
    expect(p.sinceStart.activeDays).toBe(9);
    expect(p.sinceStart.regularity).toEqual({ weeksWithSession: 3, weeks: 9, streakWeeks: 0 });
    expect(p.habits).toMatchObject({ trainingWeeks: 3, mealsLoggedDays: 1, activityDays: 1, weighInWeeks: 1 });
  });

  it('a week in progress never breaks the streak', () => {
    const data = { ...empty(), completedSessions: twicePerWeek('2026-09-07', 3) }; // weeks of 7, 14, 21 Sept
    expect(weekStreak(data, '2026-09-30')).toBe(3); // nothing yet this week (28 Sept)
    expect(weekStreak(data, '2026-10-06')).toBe(0); // the whole week of 28 Sept passed empty
  });
});

describe('Progress Journey: body', () => {
  it('weight is a 7-day average compared with the first week holding 2 weigh-ins', () => {
    const p = buildProgressJourney(
      input({
        weights: [
          { date: '2026-08-03', weightKg: 82 },
          { date: '2026-08-05', weightKg: 81.6 },
          { date: '2026-09-27', weightKg: 79.4 },
          { date: '2026-09-29', weightKg: 79 },
        ],
      }),
    );
    expect(p.body.weight).toEqual({ startAvgKg: 81.8, currentAvgKg: 79.2, changeKg: -2.6, entries: 4 });
  });

  it('a single weigh-in gives no change (said missing, not invented)', () => {
    const p = buildProgressJourney(input({ weights: [{ date: '2026-09-29', weightKg: 80 }] }));
    expect(p.body.weight).toMatchObject({ startAvgKg: null, changeKg: null });
  });

  it('missing data is named in notes', () => {
    const p = buildProgressJourney(input({ completedSessions: twicePerWeek(START, 1) }));
    expect(p.notes.map((n) => n.key)).toEqual([
      'progress.note.no_weight',
      'progress.note.no_waist',
      'progress.note.no_loads',
    ]);
  });

  it('other measurements are listed per kind', () => {
    const p = buildProgressJourney(
      input({
        measurements: [
          { date: '2026-08-10', kind: 'arm', cm: 33 },
          { date: '2026-09-28', kind: 'arm', cm: 34 },
          { date: '2026-09-28', kind: 'hips', cm: 98 },
        ],
      }),
    );
    expect(p.body.others).toEqual([
      { kind: 'arm', startCm: 33, currentCm: 34, changeCm: 1 },
      { kind: 'hips', startCm: 98, currentCm: 98, changeCm: null },
    ]);
  });
});

describe('Progress Journey: performance', () => {
  const logs = {
    '2026-08-03#0': { bench: [{ reps: 8, loadKg: 40 }] },
    '2026-08-06#0': { bench: [{ reps: 8, loadKg: 40 }] },
    '2026-08-10#0': { bench: [{ reps: 10, loadKg: 40 }] },
    '2026-09-28#0': {
      bench: [
        { reps: 8, loadKg: 47.5 },
        { reps: 6, loadKg: 45 },
      ],
    },
  };

  it('no record on the first try, then reps and load records', () => {
    const records = personalRecords({ ...empty(), setLogs: logs });
    expect(records).toEqual([
      { exerciseId: 'bench', date: '2026-08-10', loadKg: 40, reps: 10, kind: 'reps' },
      { exerciseId: 'bench', date: '2026-09-28', loadKg: 47.5, reps: 8, kind: 'load' },
    ]);
  });

  it('trend: best set of the first 14 days vs the last 14 days', () => {
    expect(exerciseTrends({ ...empty(), setLogs: logs })).toEqual([
      { exerciseId: 'bench', from: { loadKg: 40, reps: 10 }, to: { loadKg: 47.5, reps: 8 }, trend: 'up' },
    ]);
  });

  it('no trend under 14 days of history', () => {
    expect(
      exerciseTrends({
        ...empty(),
        setLogs: { '2026-09-20#0': logs['2026-08-03#0'], '2026-09-28#0': logs['2026-09-28#0'] },
      }),
    ).toEqual([]);
  });
});

describe('Progress Journey: performance (W-4)', () => {
  it('a hold has its own record: a longer time measured, never a reps or load record', () => {
    const hold = (seconds: number) => [{ reps: 0, seconds, loadKg: 0 }];
    const records = personalRecords({
      setLogs: {
        '2026-09-01#0': { plank: hold(30) },
        '2026-09-04#0': { plank: hold(30) },
        '2026-09-08#0': { plank: hold(40) },
      },
    });
    expect(records).toEqual([
      { exerciseId: 'plank', date: '2026-09-08', loadKg: 0, reps: 0, seconds: 40, kind: 'time' },
    ]);
  });

  it('light and short sessions never make a downward trend', () => {
    const setLogs = {
      '2026-09-01#0': { row: [{ reps: 10, loadKg: 50 }] },
      '2026-09-20#0': { row: [{ reps: 8, loadKg: 40 }] },
    };
    expect(exerciseTrends({ setLogs })[0].trend).toBe('down');
    for (const variant of ['light', 'short'] as const) {
      expect(
        exerciseTrends({ setLogs, completedSessions: [{ date: '2026-09-20', sessionIndex: 0, variant }] }),
      ).toEqual([]);
    }
  });
});

it('same load, more reps is up; load within 2.5 % and same reps is stable', () => {
  const at = (first: { reps: number; loadKg: number }, last: { reps: number; loadKg: number }) =>
    exerciseTrends({ ...empty(), setLogs: { '2026-09-01#0': { row: [first] }, '2026-09-20#0': { row: [last] } } })[0]
      .trend;
  expect(at({ reps: 8, loadKg: 40 }, { reps: 10, loadKg: 40 })).toBe('up');
  expect(at({ reps: 8, loadKg: 40 }, { reps: 8, loadKg: 40.5 })).toBe('stable');
  expect(at({ reps: 12, loadKg: 0 }, { reps: 15, loadKg: 0 })).toBe('up');
  expect(at({ reps: 8, loadKg: 50 }, { reps: 8, loadKg: 45 })).toBe('down');
});

describe('Progress Journey: recomposition', () => {
  const stableWeight = [
    { date: '2026-08-30', weightKg: 75 },
    { date: '2026-09-01', weightKg: 75.2 },
    { date: '2026-09-27', weightKg: 75.1 },
    { date: '2026-09-29', weightKg: 74.9 },
  ];

  it('puts weight last, waist first', () => {
    expect(bodyOrder('recomposition')).toEqual(['waist', 'performance', 'photos', 'consistency', 'weight']);
    expect(bodyOrder('recomposition')).not.toContain(undefined);
  });

  it('stable weight + waist down: the note cites the measured waist', () => {
    const p = buildProgressJourney(
      input(
        {
          weights: stableWeight,
          waist: [
            { date: '2026-08-03', cm: 84 },
            { date: '2026-09-28', cm: 81.5 },
          ],
        },
        { goal: 'recomposition' },
      ),
    );
    expect(p.notes).toContainEqual({ key: 'progress.note.recomposition_waist', params: { cm: 2.5 } });
  });

  it('stable weight and nothing measured: suggests measuring, claims no change', () => {
    const p = buildProgressJourney(input({ weights: stableWeight }, { goal: 'recomposition' }));
    expect(p.notes.map((n) => n.key)).toContain('progress.note.recomposition_measure');
    expect(p.notes.map((n) => n.key)).not.toContain('progress.note.recomposition_waist');
  });
});

describe('milestones', () => {
  const base = (data: Partial<ProgressData>, extra: Partial<MilestoneInput> = {}): MilestoneInput => ({
    today: TODAY,
    startedOn: START,
    goal: 'fat_loss',
    plannedSessionsPerWeek: 2,
    noPush: false,
    data: { ...empty(), ...data },
    ...extra,
  });

  it('session counts, first week, first month and streaks are dated by the session that proves them', () => {
    const reached = milestonesReached(base({ completedSessions: twicePerWeek(START, 8) }));
    const byId = Object.fromEntries(reached.map((m) => [m.id, m.reachedOn]));
    expect(byId).toMatchObject({
      first_session: '2026-08-03',
      first_week: '2026-08-10',
      sessions_10: '2026-09-03',
      first_month: '2026-08-24',
      weeks_streak_8: '2026-09-21',
      checkpoint_1: '2026-08-27',
      checkpoint_2: '2026-09-03',
    });
    expect(byId.sessions_25).toBeUndefined();
  });

  it('first measured improvement: waist −1 cm, or the 7-day average 1 kg towards the goal', () => {
    const waist = milestonesReached(
      base({
        waist: [
          { date: '2026-08-03', cm: 90 },
          { date: '2026-08-20', cm: 89.5 },
          { date: '2026-09-01', cm: 89 },
        ],
      }),
    );
    expect(waist.find((m) => m.id === 'first_measured_improvement')).toEqual({
      id: 'first_measured_improvement',
      reachedOn: '2026-09-01',
      sourceRef: 'waist:2026-09-01',
    });
  });

  it('protected profile: no milestone for getting lighter or smaller', () => {
    const data = {
      waist: [
        { date: '2026-08-03', cm: 70 },
        { date: '2026-09-01', cm: 68 },
      ],
      weights: [
        { date: '2026-08-03', weightKg: 50 },
        { date: '2026-08-04', weightKg: 50 },
        { date: '2026-09-01', weightKg: 48 },
        { date: '2026-09-02', weightKg: 48 },
      ],
    };
    const ids = milestonesReached(base(data, { noPush: true, targetWeightKg: 48 })).map((m) => m.id);
    expect(ids).not.toContain('first_measured_improvement');
    expect(ids).not.toContain('weight_goal_reached');
    const adult = milestonesReached(base(data, { targetWeightKg: 48 })).map((m) => m.id);
    expect(adult).toEqual(expect.arrayContaining(['first_measured_improvement', 'weight_goal_reached']));
  });

  it('celebrated once, within 7 days, never under safety', () => {
    const reached = [
      { id: 'first_session', reachedOn: '2026-09-28', sourceRef: 's' },
      { id: 'sessions_10', reachedOn: '2026-09-29', sourceRef: 's' },
      { id: 'first_month', reachedOn: '2026-09-29', sourceRef: 's' },
    ];
    expect(milestoneToCelebrate({ today: TODAY, reached, records: {}, safetyActive: false })?.id).toBe('sessions_10');
    const records = { sessions_10: { reachedOn: '2026-09-29', celebratedAt: '2026-09-29T19:00:00Z' } };
    expect(milestoneToCelebrate({ today: TODAY, reached, records, safetyActive: false })?.id).toBe('first_month');
    expect(milestoneToCelebrate({ today: TODAY, reached, records: {}, safetyActive: true })).toBeNull();
    expect(milestoneToCelebrate({ today: addDays(TODAY, 8), reached, records: {}, safetyActive: false })).toBeNull();
  });

  it('facts name the milestone with the real number', () => {
    expect(milestoneFacts('sessions_10')).toEqual({ sessions: '10' });
    expect(milestoneFacts('weeks_streak_8')).toEqual({ weeks: '8' });
    expect(milestoneFacts('first_month')).toEqual({ weeks: '4' });
    expect(milestoneFacts('checkpoint_3')).toEqual({ checkpoint: '3' });
  });

  it('the path: one current step, the rest upcoming, never missed', () => {
    const path = checkpointPath(base({ completedSessions: twicePerWeek(START, 2) }));
    expect(path.map((c) => c.status)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(path[4]).toMatchObject({ key: 'midway_review', dueOn: addDays(START, 84) });
  });

  it('midway review: half way to the target date, with the weekly check-in of that week', () => {
    const path = checkpointPath(
      base(
        { weeklyCheckins: [{ weekStart: '2026-09-28', answeredAt: '2026-10-04T18:00:00Z' }] },
        { today: '2026-10-05', targetDate: '2026-11-30' },
      ),
    );
    expect(path[4]).toMatchObject({ dueOn: '2026-10-01', reachedOn: '2026-10-04', status: 'reached' });
  });
});

describe('adherence', () => {
  it('short sessions count as done, a replaced one is adapted, a past empty day is "not logged"', () => {
    const a = adherence({
      today: '2026-09-30',
      plannedSessionDates: ['2026-09-21', '2026-09-24', '2026-09-28', '2026-09-30'],
      completedSessions: [
        { date: '2026-09-21', sessionIndex: 0 },
        { date: '2026-09-28', sessionIndex: 0 },
      ],
      sessionOutcomes: { '2026-09-24#0': { status: 'replaced', replacedBy: 'walk', at: '' } },
      meals: [],
    });
    // Today's session is not due yet: never counted as missed.
    expect(a.sessions).toEqual({ planned: 3, done: 2, adapted: 1, skipped: 0, notLogged: 0, ratio: 1 });
    expect(a.mealLogging).toBeNull();
  });

  it('3 planned, 2 done → 67 %; meals logged over past days only', () => {
    const a = adherence({
      today: '2026-09-30',
      plannedSessionDates: ['2026-09-22', '2026-09-24', '2026-09-26'],
      completedSessions: [
        { date: '2026-09-22', sessionIndex: 0 },
        { date: '2026-09-26', sessionIndex: 0 },
      ],
      sessionOutcomes: {},
      meals: [
        { date: '2026-09-29', status: 'eaten' },
        { date: '2026-09-29', status: 'planned' },
        { date: '2026-09-30', status: 'planned' },
      ],
    });
    expect(a.sessions.ratio).toBeCloseTo(0.667, 3);
    expect(a.sessions.notLogged).toBe(1);
    expect(a.mealLogging).toEqual({ planned: 2, logged: 1, ratio: 0.5 });
  });
});
