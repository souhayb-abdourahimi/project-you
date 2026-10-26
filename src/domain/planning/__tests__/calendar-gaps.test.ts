/**
 * Sessions placed in the free times between calendar events (D-050): with an active calendar and
 * no availability entered, the planner works in 07:00–22:00, subtracts the busy times and gives
 * every session a real start and end. Manual availability always wins.
 */
import { busyFromEvents, type BusySlot } from '../../calendar/calendar';
import type { LabeledSlot } from '../../profile/schemas';
import { parseTime, type Weekday } from '../../shared/dates';
import { AUTO_WINDOW, effectiveAvailability, planWeek, rescheduleOptions, type PlanningInput } from '../engine';

const WEEK = '2026-09-28'; // a Monday

const training = { sessionsPerWeek: 3, sessionMinutes: 45, hasGym: true, gymTravelMinutes: 15 };

/** The same busy times every day of the week. */
const everyDay = (...ranges: [string, string][]): BusySlot[] =>
  ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).flatMap((day) =>
    ranges.map(([start, end]) => ({ day, start, end, label: 'calendar' as const })),
  );

function input(busy: LabeledSlot[] | null, patch: Partial<PlanningInput> = {}): PlanningInput {
  return {
    weekStart: WEEK,
    schedule: { availability: [], fixedConstraints: [] },
    training,
    ...(busy ? { calendar: { busy } } : {}),
    ...patch,
  };
}

function workouts(plan: ReturnType<typeof planWeek>) {
  return plan.days.flatMap((d) =>
    d.items.flatMap((i) => (i.kind === 'workout' ? [{ day: d.weekday, date: d.date, ...i }] : [])),
  );
}

/** Every session has a time, inside 07:00–22:00 with its travel, and overlaps no busy time. */
function expectRealSlots(plan: ReturnType<typeof planWeek>, busy: LabeledSlot[], travel = training.gymTravelMinutes) {
  for (const w of workouts(plan)) {
    if (!w.start || !w.end) throw new Error('session without a time');
    const t = w.location === 'gym' ? travel : 0;
    const leave = parseTime(w.start) - t;
    const back = parseTime(w.end) + t;
    expect(leave).toBeGreaterThanOrEqual(parseTime(AUTO_WINDOW.start));
    expect(back).toBeLessThanOrEqual(parseTime(AUTO_WINDOW.end));
    for (const b of busy.filter((b) => b.day === w.day)) {
      expect(back <= parseTime(b.start) || leave >= parseTime(b.end)).toBe(true);
    }
  }
}

describe('effectiveAvailability', () => {
  it('manual availability wins over the calendar window', () => {
    const availability = [{ day: 2 as Weekday, start: '18:00', end: '20:00' }];
    expect(effectiveAvailability({ availability }, true)).toEqual({ source: 'manual', availability });
  });

  it('an active calendar and no availability: 07:00–22:00 every day', () => {
    const { source, availability } = effectiveAvailability({ availability: [] }, true);
    expect(source).toBe('calendar_auto');
    expect(availability).toHaveLength(7);
    expect(availability.every((a) => a.start === '07:00' && a.end === '22:00')).toBe(true);
  });

  it('no calendar and no availability: nothing (the former behaviour)', () => {
    expect(effectiveAvailability({ availability: [] }, false)).toEqual({ source: 'none', availability: [] });
  });
});

describe('planWeek with calendar busy times', () => {
  it('a gap between two classes holds the session and its travel (08–12 and 14–17 busy)', () => {
    const busy = [
      { day: 1 as Weekday, start: '07:00', end: '08:00', label: 'calendar' as const },
      ...everyDay(['08:00', '12:00'], ['14:00', '17:00'], ['17:00', '22:00']),
    ];
    const plan = planWeek(input(busy, { training: { ...training, sessionsPerWeek: 1 } }));
    const [w] = workouts(plan);
    expect(plan.availability).toBe('calendar_auto');
    expect(w.location).toBe('gym');
    // 12:00–14:00: 15 min travel each way around 45 min, with room left on both sides.
    expect(parseTime(w.start!)).toBeGreaterThanOrEqual(parseTime('12:15'));
    expect(parseTime(w.end!)).toBeLessThanOrEqual(parseTime('13:45'));
    expect(parseTime(w.end!) - parseTime(w.start!)).toBe(45);
    expectRealSlots(plan, busy);
  });

  it('an event at the start of the day: the session comes after it, never before 07:00', () => {
    const busy = everyDay(['07:00', '09:30']);
    const plan = planWeek(input(busy));
    expect(workouts(plan)).toHaveLength(3);
    for (const w of workouts(plan)) expect(parseTime(w.start!) - 15).toBeGreaterThanOrEqual(parseTime('09:30'));
    expectRealSlots(plan, busy);
  });

  it('an event at the end of the day: the session ends (travel included) before it', () => {
    const busy = everyDay(['10:00', '23:59']);
    const plan = planWeek(input(busy));
    for (const w of workouts(plan)) expect(parseTime(w.end!) + 15).toBeLessThanOrEqual(parseTime('10:00'));
    expectRealSlots(plan, busy);
  });

  it('several events: only a gap long enough is used, the others are left alone', () => {
    const busy = everyDay(['07:00', '08:30'], ['09:00', '11:00'], ['11:30', '15:00'], ['16:00', '18:30'], ['20:00', '22:00']);
    const plan = planWeek(input(busy));
    // 08:30–09:00, 11:00–11:30 and 15:00–16:00 are too short for 45 + 2×15; 18:30–20:00 fits.
    for (const w of workouts(plan)) {
      expect(w.location).toBe('gym');
      expect(parseTime(w.start!)).toBeGreaterThanOrEqual(parseTime('18:45'));
    }
    expectRealSlots(plan, busy);
  });

  it('an event crossing midnight blocks the evening and the next morning', () => {
    const busy = busyFromEvents(
      [{ start: '2026-09-28T19:00:00', end: '2026-09-29T21:00:00', allDay: false }],
      WEEK,
    );
    const plan = planWeek(input(busy, { training: { ...training, sessionsPerWeek: 6 } }));
    const byDay = new Map(workouts(plan).map((w) => [w.day, w]));
    // Monday: before 19:00 only. Tuesday: busy until 21:00, too late for 45 + travel before 22:00.
    if (byDay.has(1)) expect(parseTime(byDay.get(1)!.end!) + 15).toBeLessThanOrEqual(parseTime('19:00'));
    expect(byDay.has(2)).toBe(false);
    expectRealSlots(plan, busy);
  });

  it('all-day events are ignored: the day stays free', () => {
    const busy = busyFromEvents([{ start: '2026-09-28', end: '2026-09-29', allDay: true }], WEEK);
    expect(busy).toEqual([]);
    const plan = planWeek(input(busy));
    expect(workouts(plan).map((w) => w.day)).toEqual([1, 3, 5]);
    expect(workouts(plan).every((w) => w.start && w.end)).toBe(true);
  });

  it('gym travel: the gym needs session + travel both ways, otherwise home', () => {
    // 60 min free: too short for 45 + 2×15 at the gym, enough for 45 at home.
    const busy = everyDay(['07:00', '12:00'], ['13:00', '22:00']);
    const plan = planWeek(input(busy));
    for (const w of workouts(plan)) {
      expect(w.location).toBe('home');
      expect(parseTime(w.start!)).toBeGreaterThanOrEqual(parseTime('12:00'));
      expect(parseTime(w.end!)).toBeLessThanOrEqual(parseTime('13:00'));
    }
    expect(plan.warnings).toContain('home_fallback_used');
  });

  it('prefers the full gym session, then room around it, over a tight fit', () => {
    // Monday: a tight 75 min gap at 09:00 and a roomy 3 h one at 15:00.
    const busy: BusySlot[] = [
      { day: 1, start: '07:00', end: '09:00', label: 'calendar' },
      { day: 1, start: '10:15', end: '15:00', label: 'calendar' },
      { day: 1, start: '18:00', end: '22:00', label: 'calendar' },
    ];
    const plan = planWeek(input(busy, { training: { ...training, sessionsPerWeek: 1 } }));
    const [w] = workouts(plan);
    expect(w.day).toBe(1);
    expect(parseTime(w.start!)).toBeGreaterThanOrEqual(parseTime('15:15'));
    expectRealSlots(plan, busy);
  });

  it('no gap long enough: no invented time, a clear warning, every day rests', () => {
    const busy = everyDay(['07:00', '10:00'], ['10:10', '22:00']);
    const plan = planWeek(input(busy));
    expect(workouts(plan)).toEqual([]);
    expect(plan.warnings).toContain('no_free_slot');
    expect(plan.days.every((d) => d.items.some((i) => i.kind === 'rest'))).toBe(true);
  });

  it('manual availability stays the frame: the automatic window is not used', () => {
    const busy = everyDay(['18:00', '18:30']);
    const plan = planWeek(
      input(busy, {
        schedule: { availability: [{ day: 2, start: '17:00', end: '20:00' }], fixedConstraints: [] },
        training: { ...training, sessionsPerWeek: 1 },
      }),
    );
    expect(plan.availability).toBe('manual');
    const [w] = workouts(plan);
    expect(w.day).toBe(2);
    // 18:30–20:00 is the only gap long enough; placed right after its start, as before.
    expect(w.start).toBe('18:45');
    expect(w.end).toBe('19:30');
  });

  it('no calendar and no availability keeps the former behaviour (days, no time)', () => {
    const plan = planWeek(input(null));
    expect(plan.availability).toBe('none');
    expect(plan.warnings).toEqual(['needs_availability']);
    expect(workouts(plan).map((w) => [w.day, w.start, w.end])).toEqual([
      [1, null, null],
      [3, null, null],
      [5, null, null],
    ]);
  });

  it('an active calendar with an empty week: real times, spread with rest days between', () => {
    const plan = planWeek(input([]));
    expect(plan.warnings).toEqual([]);
    expect(workouts(plan).map((w) => w.day)).toEqual([1, 3, 5]);
    expectRealSlots(plan, []);
  });

  it('is deterministic: the same week gives the same plan', () => {
    const busy = everyDay(['08:00', '12:00'], ['14:00', '17:00']);
    expect(planWeek(input(busy))).toEqual(planWeek(input(busy)));
  });

  it('rescheduling proposes real free times of the calendar', () => {
    const busy = everyDay(['07:00', '17:00']);
    const plan = planWeek(input(busy));
    const options = rescheduleOptions(plan, '2026-09-28', input(busy));
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) expect(parseTime(o.start)).toBeGreaterThanOrEqual(parseTime('17:15'));
  });
});
