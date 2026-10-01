import { planWeek } from '../../planning/engine';
import { SCENARIOS } from '../../scenarios';
import {
  busyFromEvents,
  desiredAppEvents,
  eventHash,
  planCalendarChanges,
  specDates,
  type WrittenEvents,
} from '../calendar';

const WEEK = '2026-09-28'; // Monday
const local = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
};

describe('busyFromEvents', () => {
  it('maps timed events to weekday slots, ignores all-day events and other weeks', () => {
    const slots = busyFromEvents(
      [
        { start: local('2026-09-29', '18:00'), end: local('2026-09-29', '19:30'), allDay: false },
        { start: local('2026-09-30', '00:00'), end: local('2026-10-01', '00:00'), allDay: true },
        { start: local('2026-10-06', '10:00'), end: local('2026-10-06', '11:00'), allDay: false },
      ],
      WEEK,
    );
    expect(slots).toEqual([{ day: 2, start: '18:00', end: '19:30', label: 'calendar' }]);
  });

  it('splits an event crossing midnight and ignores invalid ones', () => {
    const slots = busyFromEvents(
      [
        { start: local('2026-10-02', '22:00'), end: local('2026-10-03', '01:00'), allDay: false },
        { start: 'not a date', end: local('2026-10-03', '01:00'), allDay: false },
        { start: local('2026-10-02', '10:00'), end: local('2026-10-02', '09:00'), allDay: false },
      ],
      WEEK,
    );
    expect(slots).toEqual([
      { day: 5, start: '22:00', end: '23:59', label: 'calendar' },
      { day: 6, start: '00:00', end: '01:00', label: 'calendar' },
    ]);
  });

  it('makes the planner avoid busy slots', () => {
    const s = SCENARIOS.studentMediumBudget;
    const base = planWeek({ weekStart: WEEK, schedule: s.schedule, training: s.training });
    const first = base.days
      .flatMap((d) => d.items.map((i) => ({ d, i })))
      .find(({ i }) => i.kind === 'workout' && i.start);
    if (!first || first.i.kind !== 'workout' || !first.i.start || !first.i.end)
      throw new Error('expected a timed workout');
    const busy = busyFromEvents(
      [{ start: local(first.d.date, first.i.start), end: local(first.d.date, first.i.end), allDay: false }],
      WEEK,
    );
    const replanned = planWeek({
      weekStart: WEEK,
      schedule: { ...s.schedule, fixedConstraints: [...s.schedule.fixedConstraints, ...busy] },
      training: s.training,
    });
    const sameDay = replanned.days.find((d) => d.date === first.d.date)!;
    for (const item of sameDay.items) {
      if (item.kind === 'workout' && item.start) expect(item.start).not.toBe(first.i.start);
    }
  });
});

describe('app events', () => {
  const s = SCENARIOS.studentMediumBudget;
  const plan = planWeek({ weekStart: WEEK, schedule: s.schedule, training: s.training });

  it('lists upcoming timed workouts, skipping completed and past ones', () => {
    const all = desiredAppEvents(plan, { from: WEEK });
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((e) => e.kind === 'workout')).toBe(true);
    const [first] = all;
    const done = desiredAppEvents(plan, { from: WEEK, completed: [first.key.replace('workout:', '')] });
    expect(done.map((e) => e.key)).not.toContain(first.key);
    expect(desiredAppEvents(plan, { from: '2026-10-05' })).toEqual([]);
  });

  it('creates, updates and removes only what changed, never past events', () => {
    const desired = desiredAppEvents(plan, { from: WEEK });
    const [a, b] = desired;
    const written: WrittenEvents = {
      [a.key]: { eventId: 'e1', hash: eventHash(a), date: a.date },
      [b.key]: { eventId: 'e2', hash: 'old', date: b.date },
      'workout:2026-09-28#9': { eventId: 'e3', hash: 'x', date: '2026-09-28' },
      'workout:2026-09-21#0': { eventId: 'e4', hash: 'x', date: '2026-09-21' },
    };
    const changes = planCalendarChanges(desired, written, WEEK);
    expect(changes.create.map((c) => c.key)).toEqual(desired.slice(2).map((d) => d.key));
    expect(changes.update).toEqual([{ spec: b, eventId: 'e2' }]);
    expect(changes.remove).toEqual([{ key: 'workout:2026-09-28#9', eventId: 'e3' }]);
  });

  it('converts a spec to local dates', () => {
    const { start, end } = specDates({
      key: 'k',
      kind: 'workout',
      titleKey: 't',
      date: '2026-09-29',
      start: '07:30',
      end: '08:15',
    });
    expect([start.getHours(), start.getMinutes(), end.getHours(), end.getMinutes()]).toEqual([7, 30, 8, 15]);
    expect(start.getDate()).toBe(29);
  });
});
