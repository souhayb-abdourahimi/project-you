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

  it('needs at least two weigh-ins in each week', () => {
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
