import { renderHook } from '@testing-library/react-native';

import { planWeek } from '@/domain/planning/engine';
import { SCENARIOS } from '@/domain/scenarios';
import { useCalendarStore } from '@/state/calendar';
import { useCalendarFeedStore } from '@/state/calendarFeed';

import { useWeekBusy, useWeekCalendar } from '../useWeekBusy';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const WEEK = '2026-09-28'; // a Monday
const local = (day: number, h: number) => new Date(2026, 8, day, h, 0).toISOString();

/** Busy every weekday evening 17:00–22:00 (an evening job), plus an all-day event. */
const evenings = [28, 29, 30, 1, 2]
  .map((d) => (d === 1 || d === 2 ? new Date(2026, 9, d) : new Date(2026, 8, d)))
  .map((d) => ({
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 17).toISOString(),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 22).toISOString(),
    allDay: false,
  }));

function link(enabled: boolean) {
  useCalendarFeedStore.getState().set({
    host: 'edt.example.fr',
    enabled,
    busy: [...evenings, { start: '2026-09-30', end: '2026-10-01', allDay: true }],
    eventCount: 6,
    syncedAt: '2026-09-27T08:00:00.000Z',
    issue: null,
  });
}

beforeEach(() => {
  useCalendarFeedStore.getState().reset();
  useCalendarStore.getState().reset();
});

describe('useWeekBusy', () => {
  it('turns the iCal busy times of the week into fixed slots (times only, all-day ignored)', async () => {
    link(true);
    const { result } = await renderHook(() => useWeekBusy(WEEK));
    expect(result.current).toHaveLength(5);
    expect(result.current[0]).toEqual({ day: 1, start: '17:00', end: '22:00', label: 'calendar' });
  });

  it('a switched-off link constrains nothing', async () => {
    link(false);
    const { result } = await renderHook(() => useWeekBusy(WEEK));
    expect(result.current).toEqual([]);
  });

  it('nothing before a plan exists', async () => {
    link(true);
    const { result } = await renderHook(() => useWeekBusy('' as typeof WEEK));
    expect(result.current).toEqual([]);
  });

  it('adds the device calendar of the same week only', async () => {
    link(true);
    useCalendarStore.setState({
      connected: true,
      readBusy: true,
      busy: {
        weekStart: WEEK,
        readAt: local(27, 9),
        slots: [{ day: 6, start: '09:00', end: '12:00', label: 'calendar' }],
      },
    } as never);
    const { result } = await renderHook(() => useWeekBusy(WEEK));
    expect(result.current).toHaveLength(6);
    const other = await renderHook(() => useWeekBusy('2026-10-05'));
    expect(other.result.current.some((s) => s.day === 6)).toBe(false);
  });

  it('planning places sessions outside the iCal busy times, inside the manual availability', async () => {
    link(true);
    const s = SCENARIOS.beginner;
    const { result } = await renderHook(() => useWeekBusy(WEEK));
    const schedule = { ...s.schedule, fixedConstraints: [...s.schedule.fixedConstraints, ...result.current] };
    const plan = planWeek({ weekStart: WEEK, schedule, training: s.training });
    const workouts = plan.days.flatMap((d) =>
      d.items.filter((i) => i.kind === 'workout' && i.start).map((i) => ({ day: d.weekday, ...i })),
    );
    // Without the link Monday 17:10 is used; the evening job now blocks it.
    const before = planWeek({ weekStart: WEEK, schedule: s.schedule, training: s.training });
    expect(before.days[0].items.some((i) => i.kind === 'workout')).toBe(true);
    expect(plan.days[0].items.some((i) => i.kind === 'workout')).toBe(false);
    expect(workouts.length).toBeGreaterThan(0);
    for (const w of workouts) {
      if (w.kind !== 'workout' || !w.start || !w.end) continue;
      for (const b of result.current.filter((b) => b.day === w.day))
        expect(w.end <= b.start || w.start >= b.end).toBe(true);
      expect(s.schedule.availability.some((a) => a.day === w.day && a.start <= w.start! && a.end >= w.end!)).toBe(true);
    }
  });
});

describe('useWeekCalendar (D-050)', () => {
  it('null without an active calendar: the planner keeps its former behaviour', async () => {
    const { result } = await renderHook(() => useWeekCalendar(WEEK));
    expect(result.current).toBeNull();
    link(false);
    const off = await renderHook(() => useWeekCalendar(WEEK));
    expect(off.result.current).toBeNull();
  });

  it('an enabled link is active, even on a week without events', async () => {
    useCalendarFeedStore.getState().set({
      host: 'edt.example.fr',
      enabled: true,
      busy: [],
      eventCount: 0,
      syncedAt: '2026-09-27T08:00:00.000Z',
      issue: null,
    });
    const { result } = await renderHook(() => useWeekCalendar(WEEK));
    expect(result.current).toEqual({ busy: [] });
  });

  it('no availability entered: sessions get real times between the iCal events', async () => {
    link(true);
    const s = SCENARIOS.beginner;
    const { result } = await renderHook(() => useWeekCalendar(WEEK));
    const plan = planWeek({
      weekStart: WEEK,
      schedule: { availability: [], fixedConstraints: [] },
      training: s.training,
      calendar: result.current!,
    });
    expect(plan.availability).toBe('calendar_auto');
    const workouts = plan.days.flatMap((d) =>
      d.items.flatMap((i) => (i.kind === 'workout' ? [{ day: d.weekday, start: i.start, end: i.end }] : [])),
    );
    expect(workouts).toHaveLength(s.training.sessionsPerWeek);
    for (const w of workouts) {
      expect(w.start).not.toBeNull();
      // The evening job (17:00–22:00 on weekdays) is never touched.
      if (w.day <= 5) expect(w.end! <= '17:00').toBe(true);
    }
  });

  it('switching the link off or refreshing it changes what the planner reads at once', async () => {
    link(true);
    const { result, rerender } = await renderHook(() => useWeekCalendar(WEEK));
    expect(result.current?.busy).toHaveLength(5);
    useCalendarFeedStore.getState().patch({ enabled: false });
    await rerender({});
    expect(result.current).toBeNull();
    useCalendarFeedStore.getState().patch({ enabled: true });
    await rerender({});
    expect(result.current?.busy).toHaveLength(5);
  });
});

