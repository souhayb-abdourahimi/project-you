/**
 * Weekly review (RecommendationEngine for the week): what worked, what was hard, what can be
 * adapted, and the plan for next week. Deterministic; every statement comes from logged data,
 * and missing data is said to be missing instead of guessed.
 */
import { summarizeWeek, type FoodExpense } from '../meals/budget';
import type { WeeklyMealPlan } from '../meals/planner';
import type { GoalType } from '../profile/schemas';
import type { WeeklyPlan } from '../planning/engine';
import { addDays, type IsoDate } from '../shared/dates';
import type { LoggedSet } from '../training/progression';
import { weightTrend, type WeightEntry } from './weight';

export interface WeeklyReviewInput {
  weekStart: IsoDate;
  /** Days after today are still ahead: they are never counted as missed. */
  today: IsoDate;
  goal: GoalType;
  schedule: WeeklyPlan;
  completedSessions: { date: IsoDate; sessionIndex: number; variant: 'full' | 'short' | 'light' }[];
  setLogs: Record<string, Record<string, LoggedSet[]>>;
  mealPlan: WeeklyMealPlan | null;
  weights: WeightEntry[];
  waist: { date: IsoDate; cm: number }[];
  expenses: FoodExpense[];
  weeklyBudgetCents: number;
}

export type ReviewPoint = { key: string; params?: Record<string, string | number> };

export interface WeeklyReview {
  weekStart: IsoDate;
  sessions: { planned: number; done: number; shortOrLight: number };
  meals: { planned: number; eaten: number; proteinDaysMet: number; daysPlanned: number } | null;
  weight: { averageKg: number | null; changeKg: number | null; entries: number };
  waistChangeCm: number | null;
  budget: { plannedCents: number; spentCents: number } | null;
  /** Average RPE of logged sets, null without RPE data. */
  averageRpe: number | null;
  worked: ReviewPoint[];
  hard: ReviewPoint[];
  adapt: ReviewPoint[];
  nextWeek: ReviewPoint[];
}

const inWeek = (date: IsoDate, weekStart: IsoDate) => date >= weekStart && date <= addDays(weekStart, 6);

export function weeklyReview(input: WeeklyReviewInput): WeeklyReview {
  const { weekStart } = input;
  const workoutDays = input.schedule.days.filter((d) => d.items.some((i) => i.kind === 'workout'));
  const planned = workoutDays.length;
  const plannedSoFar = workoutDays.filter((d) => d.date <= input.today).length;
  const done = input.completedSessions.filter((c) => inWeek(c.date, weekStart));
  const shortOrLight = done.filter((c) => c.variant !== 'full').length;

  const weekKeys = Object.keys(input.setLogs).filter((k) => inWeek(k.split('#')[0], weekStart));
  const rpes = weekKeys.flatMap((k) =>
    Object.values(input.setLogs[k]).flatMap((sets) =>
      sets.map((s) => s.rpe).filter((r): r is number => r !== undefined),
    ),
  );
  const averageRpe = rpes.length > 0 ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;

  const days = input.mealPlan?.weekStart === weekStart ? input.mealPlan.days : null;
  const meals = days
    ? {
        planned: days.reduce((n, d) => n + d.meals.length, 0),
        eaten: days.reduce((n, d) => n + d.meals.filter((m) => m.status === 'eaten').length, 0),
        proteinDaysMet: days.filter((d) => d.date <= input.today && d.protein?.met).length,
        daysPlanned: days.filter((d) => d.date <= input.today).length,
      }
    : null;

  const weekWeights = input.weights.filter((w) => w.date <= addDays(weekStart, 6));
  const trend = weightTrend(weekWeights);
  const waistSorted = [...input.waist]
    .filter((w) => w.date <= addDays(weekStart, 6))
    .sort((a, b) => a.date.localeCompare(b.date));
  const waistThisWeek = waistSorted.filter((w) => inWeek(w.date, weekStart)).at(-1);
  const waistBefore = waistSorted.filter((w) => w.date < weekStart).at(-1);
  const waistChangeCm = waistThisWeek && waistBefore ? Math.round((waistThisWeek.cm - waistBefore.cm) * 10) / 10 : null;

  const budget = input.weeklyBudgetCents > 0 ? summarizeWeek(input.weeklyBudgetCents, input.expenses, weekStart) : null;

  const worked: ReviewPoint[] = [];
  const hard: ReviewPoint[] = [];
  const adapt: ReviewPoint[] = [];
  const nextWeek: ReviewPoint[] = [];

  // Sessions: any session is a win, never a failure.
  if (done.length > 0) worked.push({ key: 'review.worked.sessions', params: { count: done.length } });
  if (shortOrLight > 0) worked.push({ key: 'review.worked.short_counts', params: { count: shortOrLight } });
  if (plannedSoFar > 0 && done.length < plannedSoFar) {
    hard.push({ key: 'review.hard.sessions', params: { done: done.length, planned: plannedSoFar } });
    adapt.push({ key: done.length === 0 ? 'review.adapt.start_small' : 'review.adapt.shorter_sessions' });
  }
  if (averageRpe !== null && averageRpe >= 9) {
    hard.push({ key: 'review.hard.effort', params: { rpe: averageRpe } });
    adapt.push({ key: 'review.adapt.lighter_week' });
  }

  if (meals) {
    if (meals.eaten > 0) worked.push({ key: 'review.worked.meals', params: { count: meals.eaten } });
    if (meals.proteinDaysMet < meals.daysPlanned) {
      hard.push({ key: 'review.hard.protein', params: { days: meals.daysPlanned - meals.proteinDaysMet } });
      adapt.push({ key: 'review.adapt.protein_sources' });
    }
  }

  // Body: for recomposition the waist and performance matter more than the scale.
  const recomposition = input.goal === 'recomposition';
  if (trend.entriesUsed === 0) hard.push({ key: 'review.hard.no_weight' });
  else if (trend.weeklyChangeKg !== null && !recomposition && trendMatchesGoal(input.goal, trend.weeklyChangeKg)) {
    // A trend against the goal is shown in the stats only: weekly weight is noisy, not a verdict.
    worked.push({ key: 'review.worked.weight_trend', params: { change: trend.weeklyChangeKg } });
  }
  if (waistChangeCm !== null) worked.push({ key: 'review.worked.waist', params: { change: waistChangeCm } });
  else if (recomposition) adapt.push({ key: 'review.adapt.measure_waist' });

  if (budget) {
    if (budget.status === 'over') {
      hard.push({ key: 'review.hard.budget' });
      adapt.push({ key: 'review.adapt.use_inventory' });
    } else if (budget.spentCents > 0) worked.push({ key: 'review.worked.budget' });
  }

  nextWeek.push({ key: 'review.next.sessions', params: { count: Math.max(1, planned) } });
  if (adapt.length === 0) nextWeek.push({ key: 'review.next.keep_going' });

  return {
    weekStart,
    sessions: { planned, done: done.length, shortOrLight },
    meals,
    weight: { averageKg: trend.currentAverageKg, changeKg: trend.weeklyChangeKg, entries: trend.entriesUsed },
    waistChangeCm,
    budget: budget ? { plannedCents: budget.plannedCents, spentCents: budget.spentCents } : null,
    averageRpe,
    worked,
    hard,
    adapt,
    nextWeek,
  };
}

/** Maintenance tolerates normal day-to-day noise (±0.3 kg/week). */
function trendMatchesGoal(goal: GoalType, weeklyChangeKg: number): boolean {
  if (goal === 'fat_loss') return weeklyChangeKg < 0;
  if (goal === 'muscle_gain') return weeklyChangeKg > 0;
  return Math.abs(weeklyChangeKg) <= 0.3;
}
