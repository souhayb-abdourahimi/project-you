import type { PlannedMeal } from '@/domain/meals/planner';

import { checkinOverview } from '../view';

const meal = (status: PlannedMeal['status']) => ({ status }) as PlannedMeal;
const week = {
  done: 1,
  planned: 2,
  days: [{ date: '2026-09-28', state: 'done' as const, today: false }],
};

describe('checkinOverview', () => {
  it('counts the meals marked eaten so far, never the days ahead', () => {
    const overview = checkinOverview({
      checkinWeek: '2026-09-28',
      currentWeek: '2026-09-28',
      today: '2026-10-02',
      week,
      mealDays: [
        { date: '2026-10-01', meals: [meal('eaten'), meal('skipped'), meal('planned')] },
        { date: '2026-10-02', meals: [meal('eaten')] },
        { date: '2026-10-03', meals: [meal('eaten')] },
      ],
    });
    expect(overview?.meals).toEqual({ eaten: 2, planned: 4 });
    expect(overview?.week).toBe(week);
  });

  it('the previous week (Monday, Tuesday): nothing rather than this week’s numbers', () => {
    expect(
      checkinOverview({
        checkinWeek: '2026-09-21',
        currentWeek: '2026-09-28',
        today: '2026-09-29',
        week,
        mealDays: [],
      }),
    ).toBeNull();
  });

  it('no plan and no sessions: no overview', () => {
    expect(
      checkinOverview({
        checkinWeek: '2026-09-28',
        currentWeek: '2026-09-28',
        today: '2026-10-02',
        week: null,
        mealDays: null,
      }),
    ).toBeNull();
  });
});
