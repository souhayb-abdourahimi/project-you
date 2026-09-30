import { SCENARIOS, scenario } from '../../scenarios';
import { freeIntervals, planWeek, rescheduleOptions } from '../engine';

const WEEK = '2026-09-28'; // a Monday

describe('PlanningEngine', () => {
  it('computes free time as availability minus fixed constraints', () => {
    const free = freeIntervals(SCENARIOS.busySchedule.schedule, 1);
    // 07:00–08:00, 16:00–18:00, 21:00–22:00
    expect(free).toEqual([
      { start: 420, end: 480 },
      { start: 960, end: 1080 },
      { start: 1260, end: 1320 },
    ]);
  });

  it('places sessions around a real busy schedule (classes 8–16, work 18–21)', () => {
    const s = SCENARIOS.busySchedule;
    const plan = planWeek({ weekStart: WEEK, schedule: s.schedule, training: s.training });
    const workouts = plan.days.flatMap((d) => d.items.filter((i) => i.kind === 'workout').map((i) => ({ day: d.weekday, ...i })));
    expect(workouts).toHaveLength(3);
    for (const w of workouts) {
      if (w.kind !== 'workout' || !w.start || !w.end) throw new Error('expected timed workout');
      for (const c of s.schedule.fixedConstraints.filter((c) => c.day === w.day)) {
        expect(w.end <= c.start || w.start >= c.end).toBe(true);
      }
    }
    // Wednesday afternoon is the only long free window: it must be used.
    expect(workouts.some((w) => w.day === 3)).toBe(true);
    // No three consecutive days.
    expect(workouts.map((w) => w.day)).toEqual([1, 3, 5]);
  });

  it('falls back to home or short sessions when the gym does not fit', () => {
    const s = scenario({
      training: { gymTravelMinutes: 30, sessionMinutes: 60, sessionsPerWeek: 2 },
      schedule: {
        availability: [
          { day: 2, start: '18:00', end: '19:10' },
          { day: 4, start: '12:00', end: '12:20' },
        ],
        fixedConstraints: [],
      },
    });
    const plan = planWeek({ weekStart: WEEK, schedule: s.schedule, training: s.training });
    const items = plan.days.flatMap((d) => d.items).filter((i) => i.kind === 'workout');
    expect(items.map((i) => i.kind === 'workout' && `${i.location}:${i.variant}`)).toEqual(['home:full', 'home:short']);
    expect(plan.warnings).toContain('home_fallback_used');
  });

  it('warns instead of inventing slots when availability is missing', () => {
    const s = scenario({ schedule: { availability: [], fixedConstraints: [] } });
    const plan = planWeek({ weekStart: WEEK, schedule: s.schedule, training: s.training });
    expect(plan.warnings).toContain('needs_availability');
    const workouts = plan.days.flatMap((d) => d.items).filter((i) => i.kind === 'workout');
    expect(workouts).toHaveLength(3);
    for (const w of workouts) if (w.kind === 'workout') expect(w.start).toBeNull();
  });

  it('marks rest days and schedules meal prep', () => {
    const s = SCENARIOS.studentMediumBudget;
    const plan = planWeek({ weekStart: WEEK, schedule: s.schedule, training: s.training });
    expect(plan.days.filter((d) => d.items.some((i) => i.kind === 'rest'))).toHaveLength(4);
    expect(plan.days.some((d) => d.items.some((i) => i.kind === 'meal_prep'))).toBe(true);
  });

  it('proposes reschedule options on free days only', () => {
    const s = SCENARIOS.studentMediumBudget;
    const input = { weekStart: WEEK, schedule: s.schedule, training: s.training };
    const plan = planWeek(input);
    const options = rescheduleOptions(plan, '2026-09-28', input);
    for (const o of options) {
      const day = plan.days.find((d) => d.date === o.date)!;
      expect(day.items.some((i) => i.kind === 'workout')).toBe(false);
    }
  });
});
