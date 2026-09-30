import { addDays, type IsoDate } from '../shared/dates';

export interface FoodExpense {
  id: string;
  amountCents: number;
  spentOn: IsoDate;
  note?: string;
}

export type BudgetStatus = 'on_track' | 'tight' | 'over';

export interface BudgetSummary {
  plannedCents: number;
  spentCents: number;
  remainingCents: number;
  /** Spent / planned, 0 when no budget is set. */
  ratio: number;
  status: BudgetStatus;
}

/** Weekly food budget: planned, spent, remaining ("34,70 € / 45 €"). */
export function summarizeWeek(weeklyBudgetCents: number, expenses: FoodExpense[], weekStart: IsoDate): BudgetSummary {
  const weekEnd = addDays(weekStart, 6);
  const spentCents = expenses
    .filter((e) => e.spentOn >= weekStart && e.spentOn <= weekEnd)
    .reduce((sum, e) => sum + e.amountCents, 0);
  const ratio = weeklyBudgetCents > 0 ? spentCents / weeklyBudgetCents : 0;
  return {
    plannedCents: weeklyBudgetCents,
    spentCents,
    remainingCents: weeklyBudgetCents - spentCents,
    ratio,
    status: ratio > 1 ? 'over' : ratio >= 0.85 ? 'tight' : 'on_track',
  };
}

/** Monthly equivalent of a weekly budget (52 weeks / 12 months). */
export function monthlyFromWeekly(weeklyCents: number): number {
  return Math.round((weeklyCents * 52) / 12);
}
