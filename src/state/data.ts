import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { FoodExpense } from '@/domain/meals/budget';
import { consume, type InventoryItem } from '@/domain/meals/inventory';
import type { PlannedMeal, WeeklyMealPlan } from '@/domain/meals/planner';
import type { WeightEntry } from '@/domain/progress/weight';
import type { IsoDate } from '@/domain/shared/dates';
import { enqueue, markDone, markFailed, type OutboxOp, type SyncTable } from '@/domain/sync/outbox';
import type { LoggedSet } from '@/domain/training/progression';
import type { SessionVariant } from '@/domain/training/adapt';
import { newId } from '@/lib/id';

import { persistStorage } from './storage';

export interface CompletedSession {
  date: IsoDate;
  sessionIndex: number;
  variant: SessionVariant;
  completedAt: string;
}

export interface WaistEntry {
  date: IsoDate;
  cm: number;
}

/** `${date}#${sessionIndex}` */
export type SessionKey = string;

interface DataState {
  inventory: InventoryItem[];
  mealPlan: WeeklyMealPlan | null;
  expenses: FoodExpense[];
  weights: (WeightEntry & { id: string })[];
  waist: (WaistEntry & { id: string })[];
  setLogs: Record<SessionKey, Record<string, LoggedSet[]>>;
  exerciseSwaps: Record<SessionKey, Record<string, string>>;
  completedSessions: CompletedSession[];
  /** Planned date → new date for rescheduled sessions. */
  rescheduled: Record<IsoDate, IsoDate>;
  outbox: OutboxOp[];

  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'addedAt' | 'updatedAt'>) => void;
  updateInventoryItem: (id: string, patch: Partial<InventoryItem>) => void;
  removeInventoryItem: (id: string) => void;
  setMealPlan: (plan: WeeklyMealPlan) => void;
  replaceMeal: (meal: PlannedMeal) => void;
  markMealEaten: (mealId: string) => void;
  addExpense: (amountCents: number, spentOn: IsoDate) => void;
  logWeight: (date: IsoDate, weightKg: number) => void;
  logWaist: (date: IsoDate, cm: number) => void;
  logSet: (session: SessionKey, exerciseId: string, set: LoggedSet) => void;
  swapExercise: (session: SessionKey, fromId: string, toId: string) => void;
  completeSession: (session: Omit<CompletedSession, 'completedAt'>) => void;
  reschedule: (from: IsoDate, to: IsoDate) => void;
  outboxDone: (ids: string[]) => void;
  outboxFailed: (id: string) => void;
  reset: () => void;
}

const now = () => new Date().toISOString();

const initial = {
  inventory: [],
  mealPlan: null,
  expenses: [],
  weights: [],
  waist: [],
  setLogs: {},
  exerciseSwaps: {},
  completedSessions: [],
  rescheduled: {},
  outbox: [],
};

function queue(
  outbox: OutboxOp[],
  table: SyncTable,
  rowId: string,
  kind: 'upsert' | 'delete',
  payload: Record<string, unknown>,
) {
  return enqueue(outbox, { id: newId(), table, rowId, kind, payload, changedAt: now() });
}

function inventoryRow(i: InventoryItem) {
  return {
    id: i.id,
    food_id: i.foodId,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    category: i.category,
    expires_on: i.expiresOn,
    source: i.source,
    updated_at: i.updatedAt,
  };
}

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      ...initial,
      addInventoryItem: (input) =>
        set((s) => {
          const item: InventoryItem = { ...input, id: newId(), addedAt: now(), updatedAt: now() };
          return {
            inventory: [...s.inventory, item],
            outbox: queue(s.outbox, 'inventory_items', item.id, 'upsert', inventoryRow(item)),
          };
        }),
      updateInventoryItem: (id, patch) =>
        set((s) => {
          const inventory = s.inventory.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now() } : i));
          const item = inventory.find((i) => i.id === id);
          return {
            inventory,
            outbox: item ? queue(s.outbox, 'inventory_items', id, 'upsert', inventoryRow(item)) : s.outbox,
          };
        }),
      removeInventoryItem: (id) =>
        set((s) => ({
          inventory: s.inventory.filter((i) => i.id !== id),
          outbox: queue(s.outbox, 'inventory_items', id, 'delete', { id, deleted_at: now() }),
        })),
      setMealPlan: (mealPlan) => set({ mealPlan }),
      replaceMeal: (meal) =>
        set((s) => ({
          mealPlan: s.mealPlan && {
            ...s.mealPlan,
            days: s.mealPlan.days.map((d) => ({ ...d, meals: d.meals.map((m) => (m.id === meal.id ? meal : m)) })),
          },
        })),
      markMealEaten: (mealId) =>
        set((s) => {
          const meal = s.mealPlan?.days.flatMap((d) => d.meals).find((m) => m.id === mealId);
          if (!meal || !s.mealPlan) return {};
          // Eating a planned meal consumes its ingredients from the inventory when available.
          const inventory = meal.ingredients.reduce((inv, i) => consume(inv, i.foodId, i.grams, now()), s.inventory);
          return {
            inventory,
            mealPlan: {
              ...s.mealPlan,
              days: s.mealPlan.days.map((d) => ({
                ...d,
                meals: d.meals.map((m) => (m.id === mealId ? { ...m, status: 'eaten' as const } : m)),
              })),
            },
          };
        }),
      addExpense: (amountCents, spentOn) =>
        set((s) => {
          const expense = { id: newId(), amountCents, spentOn };
          return {
            expenses: [...s.expenses, expense],
            outbox: queue(s.outbox, 'food_expenses', expense.id, 'upsert', {
              id: expense.id,
              amount_cents: amountCents,
              spent_on: spentOn,
              updated_at: now(),
            }),
          };
        }),
      logWeight: (date, weightKg) =>
        set((s) => {
          const existing = s.weights.find((w) => w.date === date);
          const entry = { id: existing?.id ?? newId(), date, weightKg };
          return {
            weights: [...s.weights.filter((w) => w.date !== date), entry],
            outbox: queue(s.outbox, 'weight_logs', entry.id, 'upsert', {
              id: entry.id,
              measured_on: date,
              weight_kg: weightKg,
              updated_at: now(),
            }),
          };
        }),
      logWaist: (date, cm) =>
        set((s) => {
          const existing = s.waist.find((w) => w.date === date);
          const entry = { id: existing?.id ?? newId(), date, cm };
          return {
            waist: [...s.waist.filter((w) => w.date !== date), entry],
            outbox: queue(s.outbox, 'body_measurements', entry.id, 'upsert', {
              id: entry.id,
              measured_on: date,
              kind: 'waist',
              value_cm: cm,
              updated_at: now(),
            }),
          };
        }),
      logSet: (session, exerciseId, loggedSet) =>
        set((s) => ({
          setLogs: {
            ...s.setLogs,
            [session]: {
              ...s.setLogs[session],
              [exerciseId]: [...(s.setLogs[session]?.[exerciseId] ?? []), loggedSet],
            },
          },
        })),
      swapExercise: (session, fromId, toId) =>
        set((s) => ({
          exerciseSwaps: { ...s.exerciseSwaps, [session]: { ...s.exerciseSwaps[session], [fromId]: toId } },
        })),
      completeSession: (session) =>
        set((s) => ({
          completedSessions: [
            ...s.completedSessions.filter((c) => !(c.date === session.date && c.sessionIndex === session.sessionIndex)),
            { ...session, completedAt: now() },
          ],
        })),
      reschedule: (from, to) => set((s) => ({ rescheduled: { ...s.rescheduled, [from]: to } })),
      outboxDone: (ids) => set((s) => ({ outbox: markDone(s.outbox, ids) })),
      outboxFailed: (id) => set((s) => ({ outbox: markFailed(s.outbox, id, now()) })),
      reset: () => set(initial),
    }),
    { name: 'py.data.v1', storage: persistStorage, version: 1 },
  ),
);
