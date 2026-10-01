import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { FoodExpense } from '@/domain/meals/budget';
import { consume, type InventoryItem } from '@/domain/meals/inventory';
import { replaceMealInPlan, type PlannedMeal, type WeeklyMealPlan } from '@/domain/meals/planner';
import type { WeightEntry } from '@/domain/progress/weight';
import type { IsoDate } from '@/domain/shared/dates';
import {
  sessionKey,
  type CompletedSession,
  type SessionKey,
  type SyncableState,
  type SyncedHashes,
  type WaistEntry,
} from '@/domain/sync/projection';
import type { LoggedSet } from '@/domain/training/progression';
import { newId } from '@/lib/id';

import { persistStorage } from './storage';

export type { CompletedSession, SessionKey, WaistEntry };

interface DataState {
  inventory: InventoryItem[];
  mealPlan: WeeklyMealPlan | null;
  /** Last week's plan, kept on this device so the safety rule sees the days before Monday (never synced). */
  previousMealPlan: WeeklyMealPlan | null;
  expenses: FoodExpense[];
  weights: (WeightEntry & { id: string })[];
  waist: (WaistEntry & { id: string })[];
  setLogs: Record<SessionKey, Record<string, LoggedSet[]>>;
  exerciseSwaps: Record<SessionKey, Record<string, string>>;
  completedSessions: CompletedSession[];
  /** Planned date → new date for rescheduled sessions. */
  rescheduled: Record<IsoDate, IsoDate>;
  sessionIds: Record<SessionKey, string>;
  /** Account the local data belongs to (null = local mode, not attached to an account yet). */
  ownerId: string | null;
  synced: SyncedHashes;
  lastPulledAt: string | null;

  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'addedAt' | 'updatedAt'>) => void;
  updateInventoryItem: (id: string, patch: Partial<InventoryItem>) => void;
  removeInventoryItem: (id: string) => void;
  setMealPlan: (plan: WeeklyMealPlan) => void;
  replaceMeal: (meal: PlannedMeal) => void;
  markMealEaten: (mealId: string) => void;
  /** The user did not eat this meal: the day counts as logged, with no energy for that meal. */
  markMealSkipped: (mealId: string) => void;
  addExpense: (amountCents: number, spentOn: IsoDate) => void;
  logWeight: (date: IsoDate, weightKg: number) => void;
  logWaist: (date: IsoDate, cm: number) => void;
  logSet: (session: SessionKey, exerciseId: string, set: LoggedSet) => void;
  swapExercise: (session: SessionKey, fromId: string, toId: string) => void;
  completeSession: (session: Omit<CompletedSession, 'completedAt'>) => void;
  reschedule: (from: IsoDate, to: IsoDate) => void;
  applySync: (patch: Partial<SyncableState> & { synced?: SyncedHashes; lastPulledAt?: string | null }) => void;
  setOwner: (ownerId: string | null) => void;
  /** Drops sync fingerprints of tables whose server rows were deleted outside the sync. */
  forgetSynced: (tables: string[]) => void;
  reset: () => void;
}

const now = () => new Date().toISOString();

const initial = {
  inventory: [],
  mealPlan: null,
  previousMealPlan: null,
  expenses: [],
  weights: [],
  waist: [],
  setLogs: {},
  exerciseSwaps: {},
  completedSessions: [],
  rescheduled: {},
  sessionIds: {},
  ownerId: null,
  synced: {},
  lastPulledAt: null,
};

/** Server id for a workout session, created the first time the session is touched. */
function withSessionId(ids: Record<SessionKey, string>, key: SessionKey) {
  return ids[key] ? ids : { ...ids, [key]: newId() };
}

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      ...initial,
      addInventoryItem: (input) =>
        set((s) => {
          const item: InventoryItem = { ...input, id: newId(), addedAt: now(), updatedAt: now() };
          return { inventory: [...s.inventory, item] };
        }),
      updateInventoryItem: (id, patch) =>
        set((s) => {
          return { inventory: s.inventory.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now() } : i)) };
        }),
      removeInventoryItem: (id) => set((s) => ({ inventory: s.inventory.filter((i) => i.id !== id) })),
      setMealPlan: (mealPlan) =>
        set((s) => ({
          mealPlan,
          previousMealPlan: s.mealPlan && s.mealPlan.weekStart < mealPlan.weekStart ? s.mealPlan : s.previousMealPlan,
        })),
      replaceMeal: (meal) =>
        set((s) => ({
          mealPlan: s.mealPlan && replaceMealInPlan(s.mealPlan, meal),
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
      markMealSkipped: (mealId) =>
        set((s) => {
          if (!s.mealPlan) return {};
          return {
            mealPlan: {
              ...s.mealPlan,
              days: s.mealPlan.days.map((d) => ({
                ...d,
                meals: d.meals.map((m) =>
                  m.id === mealId && m.status === 'planned' ? { ...m, status: 'skipped' as const } : m,
                ),
              })),
            },
          };
        }),
      addExpense: (amountCents, spentOn) =>
        set((s) => {
          const expense = { id: newId(), amountCents, spentOn };
          return { expenses: [...s.expenses, expense] };
        }),
      logWeight: (date, weightKg) =>
        set((s) => {
          const existing = s.weights.find((w) => w.date === date);
          const entry = { id: existing?.id ?? newId(), date, weightKg };
          return { weights: [...s.weights.filter((w) => w.date !== date), entry] };
        }),
      logWaist: (date, cm) =>
        set((s) => {
          const existing = s.waist.find((w) => w.date === date);
          const entry = { id: existing?.id ?? newId(), date, cm };
          return { waist: [...s.waist.filter((w) => w.date !== date), entry] };
        }),
      logSet: (session, exerciseId, loggedSet) =>
        set((s) => ({
          sessionIds: withSessionId(s.sessionIds, session),
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
          sessionIds: withSessionId(s.sessionIds, sessionKey(session.date, session.sessionIndex)),
          completedSessions: [
            ...s.completedSessions.filter((c) => !(c.date === session.date && c.sessionIndex === session.sessionIndex)),
            { ...session, completedAt: now() },
          ],
        })),
      reschedule: (from, to) => set((s) => ({ rescheduled: { ...s.rescheduled, [from]: to } })),
      applySync: (patch) => {
        const { snapshot: _snapshot, ...data } = patch;
        set(data);
      },
      setOwner: (ownerId) => set({ ownerId }),
      forgetSynced: (tables) =>
        set((s) => ({
          synced: Object.fromEntries(Object.entries(s.synced).filter(([ref]) => !tables.includes(ref.split(':')[0]))),
        })),
      reset: () => set(initial),
    }),
    {
      name: 'py.data.v1',
      storage: persistStorage,
      version: 2,
      // v1 had an outbox; v2 syncs by diff and needs the new fields.
      migrate: (persisted) => {
        const { outbox: _outbox, ...rest } = (persisted ?? {}) as Record<string, unknown>;
        return { ...initial, ...rest } as unknown as DataState;
      },
    },
  ),
);
