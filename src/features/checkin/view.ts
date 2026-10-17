/**
 * View model of the weekly check-in header (W-10 reference "Bilan de la semaine"): the week being
 * answered, as days and two counts. Only for the current week, whose plan and marks are on the
 * device; when the check-in is about the previous week (Monday, Tuesday) nothing is shown rather
 * than numbers from the wrong week.
 */
import type { PlannedMeal } from '@/domain/meals/planner';
import type { IsoDate } from '@/domain/shared/dates';

import type { TodayGlance } from '../today/view';

export interface CheckinOverview {
  week: NonNullable<TodayGlance['week']> | null;
  /** Meals marked eaten over the meals planned so far (today included); null without a plan. */
  meals: { eaten: number; planned: number } | null;
}

export function checkinOverview(input: {
  checkinWeek: IsoDate;
  currentWeek: IsoDate;
  today: IsoDate;
  week: TodayGlance['week'];
  mealDays: readonly { date: IsoDate; meals: readonly PlannedMeal[] }[] | null;
}): CheckinOverview | null {
  if (input.checkinWeek !== input.currentWeek) return null;
  const past = (input.mealDays ?? []).filter((d) => d.date <= input.today);
  const planned = past.reduce((n, d) => n + d.meals.length, 0);
  const eaten = past.reduce((n, d) => n + d.meals.filter((m) => m.status === 'eaten').length, 0);
  const meals = input.mealDays && planned > 0 ? { eaten, planned } : null;
  if (!input.week && !meals) return null;
  return { week: input.week, meals };
}
