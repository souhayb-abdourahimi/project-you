import { addDays } from '../../shared/dates';
import { SAFETY, evaluateSafety, type LoggedDay, type SafetyInput } from '../safety';

const today = '2026-10-01';
const base: SafetyInput = {
  today,
  loggedDays: [],
  floorKcal: 1400,
  weights: [],
  sessionDates: [],
  plannedSessionsPerWeek: 3,
  checkins: [],
};
const day = (date: string, kcal: number, complete = true, targetKcal = 2000): LoggedDay => ({
  date,
  kcal,
  complete,
  unmarkedMeals: complete ? 0 : 1,
  targetKcal,
});
/** One weigh-in every day from `from` for `days` days, losing `perDay` kg a day. */
const weighIns = (from: string, days: number, startKg: number, perDay: number) =>
  Array.from({ length: days }, (_, i) => ({ date: addDays(from, i), weightKg: startKg - perDay * i }));

describe('safety rule: low intake', () => {
  it('fires after 3 consecutive fully logged days well under the target', () => {
    const r = evaluateSafety({
      ...base,
      loggedDays: [day('2026-09-28', 1300), day('2026-09-29', 1350), day('2026-09-30', 1200)],
    });
    expect(r.active).toBe(true);
    expect(r.flags).toEqual(['low_intake']);
    expect(r.belowFloor).toBe(true);
    expect(r.evidence.lowIntakeDays).toBe('3');
  });

  it('fires under 70 % of the target even above the floor, without the floor flag', () => {
    const r = evaluateSafety({
      ...base,
      floorKcal: 1200,
      loggedDays: [day('2026-09-28', 1300), day('2026-09-29', 1350), day('2026-09-30', 1250)],
    });
    expect(r.flags).toEqual(['low_intake']);
    expect(r.belowFloor).toBe(false);
  });

  it('never counts a partially logged day, today, or a gap in the streak', () => {
    const low = (d: string, complete = true) => day(d, 900, complete);
    expect(
      evaluateSafety({ ...base, loggedDays: [low('2026-09-28'), low('2026-09-29', false), low('2026-09-30')] }).active,
    ).toBe(false);
    expect(evaluateSafety({ ...base, loggedDays: [low('2026-09-29'), low('2026-09-30'), low(today)] }).active).toBe(
      false,
    );
    expect(
      evaluateSafety({
        ...base,
        loggedDays: [low('2026-09-26'), low('2026-09-27'), low('2026-09-29'), low('2026-09-30')],
      }).active,
    ).toBe(false);
  });

  it('needs 3 days and a recent streak', () => {
    expect(evaluateSafety({ ...base, loggedDays: [day('2026-09-29', 900), day('2026-09-30', 900)] }).active).toBe(
      false,
    );
    const old = [day('2026-09-24', 900), day('2026-09-25', 900), day('2026-09-26', 900)];
    expect(evaluateSafety({ ...base, loggedDays: old }).active).toBe(false);
  });

  it('stays quiet when the logged days reach the target', () => {
    const r = evaluateSafety({
      ...base,
      loggedDays: [day('2026-09-28', 1900), day('2026-09-29', 2050), day('2026-09-30', 1450)],
    });
    expect(r.active).toBe(false);
    expect(SAFETY.lowIntakeRatio * 2000).toBe(1400);
  });
});

describe('safety rule: fast weight loss', () => {
  it('fires when the 7-day average drops more than 1 % a week, two weeks in a row', () => {
    // 0.2 kg a day ≈ 1.4 kg a week on ~80 kg ≈ 1.8 %/week.
    const r = evaluateSafety({ ...base, weights: weighIns('2026-09-11', 21, 82, 0.2) });
    expect(r.flags).toEqual(['fast_weight_loss']);
  });

  it('stays quiet at a steady pace, with a single fast week, with weight gain, or with old data', () => {
    expect(evaluateSafety({ ...base, weights: weighIns('2026-09-11', 21, 82, 0.08) }).active).toBe(false);
    const oneFastWeek = [...weighIns('2026-09-11', 14, 82, 0.02), ...weighIns('2026-09-25', 7, 81.7, 0.25)];
    expect(evaluateSafety({ ...base, weights: oneFastWeek }).active).toBe(false);
    expect(evaluateSafety({ ...base, weights: weighIns('2026-09-11', 21, 70, -0.2) }).active).toBe(false);
    expect(evaluateSafety({ ...base, today: '2026-10-20', weights: weighIns('2026-09-11', 21, 82, 0.2) }).active).toBe(
      false,
    );
  });

  it('with one weigh-in in some week, a trend just under twice the safe rate stays quiet', () => {
    // ≈ 1.95–1.99 %/week: above the regular threshold, below the degraded one (2 %/week).
    const sparse = [
      { date: '2026-09-12', weightKg: 82 },
      { date: '2026-09-19', weightKg: 80.5 },
      { date: '2026-09-20', weightKg: 80.3 },
      { date: '2026-09-27', weightKg: 79 },
      { date: '2026-09-30', weightKg: 78.6 },
    ];
    expect(evaluateSafety({ ...base, weights: sparse }).active).toBe(false);
  });
});

describe('safety rule: training load', () => {
  const sessions = ['2026-09-25', '2026-09-26', '2026-09-28', '2026-09-30'];
  const tired = [
    { date: '2026-09-29', energy: 3, fatigue: 4 },
    { date: '2026-09-30', energy: 2, fatigue: 3 },
  ];

  it('fires with more sessions than planned and high declared fatigue on 2 days', () => {
    const r = evaluateSafety({ ...base, sessionDates: sessions, checkins: tired });
    expect(r.flags).toEqual(['training_load']);
    expect(r.evidence).toMatchObject({ sessionsLast7Days: '4', plannedSessionsPerWeek: '3' });
  });

  it('needs both: extra sessions alone or fatigue alone is not excess', () => {
    expect(evaluateSafety({ ...base, sessionDates: sessions }).active).toBe(false);
    expect(evaluateSafety({ ...base, sessionDates: sessions.slice(1), checkins: tired }).active).toBe(false);
    expect(evaluateSafety({ ...base, sessionDates: sessions, checkins: tired.slice(0, 1) }).active).toBe(false);
  });
});

it('lists every flag, most important first', () => {
  const r = evaluateSafety({
    ...base,
    loggedDays: [day('2026-09-28', 900), day('2026-09-29', 900), day('2026-09-30', 900)],
    weights: weighIns('2026-09-11', 21, 82, 0.2),
    sessionDates: ['2026-09-25', '2026-09-26', '2026-09-28', '2026-09-30'],
    checkins: [
      { date: '2026-09-29', energy: 3, fatigue: 5 },
      { date: '2026-09-30', energy: 3, fatigue: 4 },
    ],
  });
  expect(r.flags).toEqual(['low_intake', 'fast_weight_loss', 'training_load']);
});

describe('safety rule: low logging (PR #3)', () => {
  /** A day with `unmarked` meals neither eaten nor skipped (0 = fully logged). */
  const logged = (date: string, unmarked = 0, kcal = 1900): LoggedDay => ({
    date,
    kcal,
    complete: unmarked === 0 && kcal > 0,
    unmarkedMeals: unmarked,
    targetKcal: 2000,
  });
  const before = ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'].map((d) => logged(d));

  it('fires after 3 recent days with unmarked meals, from someone who logged before', () => {
    const r = evaluateSafety({
      ...base,
      loggedDays: [...before, logged('2026-09-28', 3, 0), logged('2026-09-29', 2, 0), logged('2026-09-30', 1, 600)],
    });
    expect(r.lowLogging).toEqual({ since: '2026-09-28', days: 3 });
    // An engagement signal, not a danger one: the safety rule stays inactive (D-027).
    expect(r.active).toBe(false);
    expect(r.flags).toEqual([]);
  });

  it('counts a partly logged day: one skipped meal left unmarked is enough', () => {
    const partly = (d: string) => logged(d, 1, 1200);
    const r = evaluateSafety({
      ...base,
      loggedDays: [...before, partly('2026-09-28'), partly('2026-09-29'), partly('2026-09-30')],
    });
    expect(r.lowLogging?.days).toBe(3);
  });

  it('keeps the same episode start while the streak grows', () => {
    const days = [
      ...before.slice(0, 3),
      ...['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'].map((d) => logged(d, 3, 0)),
    ];
    expect(evaluateSafety({ ...base, loggedDays: days }).lowLogging?.since).toBe('2026-09-26');
    expect(evaluateSafety({ ...base, today: '2026-09-30', loggedDays: days }).lowLogging?.since).toBe('2026-09-26');
  });

  it('stays quiet for someone who never logged, a short streak, a streak that ended, or today', () => {
    const unlogged = (d: string) => logged(d, 3, 0);
    const streak = ['2026-09-28', '2026-09-29', '2026-09-30'].map(unlogged);
    // Never logged before: nothing to compare with, the absence messages handle it.
    expect(evaluateSafety({ ...base, loggedDays: streak }).lowLogging).toBeNull();
    expect(evaluateSafety({ ...base, loggedDays: [...before.slice(0, 2), ...streak] }).lowLogging).toBeNull();
    // Two days only.
    expect(
      evaluateSafety({ ...base, loggedDays: [...before, logged('2026-09-28'), ...streak.slice(1)] }).lowLogging,
    ).toBeNull();
    // Yesterday was fully logged: the episode is over.
    expect(
      evaluateSafety({ ...base, today: '2026-10-02', loggedDays: [...before, ...streak, logged(today)] }).lowLogging,
    ).toBeNull();
    // Today is never counted (meals may still be eaten later).
    expect(
      evaluateSafety({ ...base, loggedDays: [...before, logged('2026-09-28'), ...streak.slice(1), unlogged(today)] })
        .lowLogging,
    ).toBeNull();
  });

  it('sits next to a real signal without changing it', () => {
    const r = evaluateSafety({
      ...base,
      loggedDays: [...before, logged('2026-09-28', 3, 0), logged('2026-09-29', 3, 0), logged('2026-09-30', 3, 0)],
      weights: weighIns('2026-09-11', 21, 82, 0.2),
    });
    expect(r.flags).toEqual(['fast_weight_loss']);
    expect(r.lowLogging?.since).toBe('2026-09-28');
  });
});

describe('safety rule: fast weight loss with few weigh-ins (PR #3)', () => {
  const weekly = (kgs: number[]) => kgs.map((weightKg, i) => ({ date: addDays('2026-09-16', 7 * i), weightKg })); // 16, 23, 30 Sept.

  it('speaks with one weigh-in a week when the trend is clearly above the safe rate, flagged as imprecise', () => {
    // ≈ 2.5 %/week, two weeks in a row.
    const r = evaluateSafety({ ...base, weights: weekly([82, 80, 78]) });
    expect(r.flags).toEqual(['fast_weight_loss']);
    expect(r.weightPrecision).toBe('sparse');
    expect(r.evidence.weighInsPerWeek).toBe('one');
  });

  it('stays quiet with one weigh-in a week below twice the safe rate, with one fast week, or with old data', () => {
    // ≈ 1.5 %/week: would fire with regular weigh-ins, too uncertain with one a week.
    expect(evaluateSafety({ ...base, weights: weekly([82, 80.8, 79.6]) }).active).toBe(false);
    expect(evaluateSafety({ ...base, weights: weekly([82, 81.9, 79.5]) }).active).toBe(false);
    expect(evaluateSafety({ ...base, today: '2026-10-09', weights: weekly([82, 80, 78]) }).active).toBe(false);
    // A missing week: no trend at all.
    expect(
      evaluateSafety({
        ...base,
        weights: [
          { date: '2026-09-16', weightKg: 82 },
          { date: '2026-09-30', weightKg: 77 },
        ],
      }).active,
    ).toBe(false);
  });

  it('keeps the regular path and its threshold unchanged', () => {
    const r = evaluateSafety({ ...base, weights: weighIns('2026-09-11', 21, 82, 0.2) });
    expect(r.weightPrecision).toBe('regular');
    expect(SAFETY.fastLossWeeklyRatio).toBe(0.01);
    expect(SAFETY.minWeighInsPerWindow).toBe(2);
  });
});

describe('safety rule: training load on frequency alone (PR #3)', () => {
  /** `perWeek` sessions in each of the last `weeks` 7-day windows ending today. */
  const sessionsFor = (perWeek: number, weeks: number) =>
    Array.from({ length: weeks }, (_, w) =>
      Array.from({ length: perWeek }, (_, i) => addDays(today, -7 * w - i)),
    ).flat();

  it('proposes to slow down after 3 weeks far above the plan, without any check-in', () => {
    const r = evaluateSafety({ ...base, sessionDates: sessionsFor(5, 3) });
    expect(r.flags).toEqual(['training_load']);
    expect(r.trainingLoadBasis).toBe('frequency');
    expect(r.evidence).toMatchObject({ sessionsLast7Days: '5', plannedSessionsPerWeek: '3', loadWeeks: '3' });
  });

  it('needs several weeks and a large gap', () => {
    expect(evaluateSafety({ ...base, sessionDates: sessionsFor(5, 2) }).active).toBe(false);
    // planned + 1 is not "far above".
    expect(evaluateSafety({ ...base, sessionDates: sessionsFor(4, 3) }).active).toBe(false);
    // With 6 planned, far above means 9 a week (×1.5): 7 is not.
    expect(evaluateSafety({ ...base, plannedSessionsPerWeek: 6, sessionDates: sessionsFor(7, 3) }).active).toBe(false);
  });

  it('keeps the fatigue path first when fatigue is declared', () => {
    const r = evaluateSafety({
      ...base,
      sessionDates: sessionsFor(5, 3),
      checkins: [
        { date: '2026-09-29', energy: 3, fatigue: 4 },
        { date: '2026-09-30', energy: 2, fatigue: 3 },
      ],
    });
    expect(r.trainingLoadBasis).toBe('fatigue');
  });
});
