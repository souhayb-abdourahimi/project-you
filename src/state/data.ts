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
import type { Adjustment } from '@/domain/journey/adjustments';
import type {
  DayLog,
  MealLogEntry,
  MealReason,
  MeasurementEntry,
  MilestoneRecord,
  SessionOutcome,
} from '@/domain/journey/outcomes';
import type { WeeklyCheckin } from '@/domain/journey/weekly-checkin';
import type { SessionVariant } from '@/domain/training/adapt';
import type { PrescribedSession, ProgramVersion } from '@/domain/training/program';
import type { LoggedSet } from '@/domain/training/progression';
import type { ReplacementReason } from '@/domain/training/replacement';
import { rescheduleSession, type SessionSource, type TrainingRecords } from '@/domain/training/week';
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
  // Journey history (D-028): synced, so a second device sees the same story.
  /** Sessions skipped or replaced (done ones are in completedSessions). */
  sessionOutcomes: Record<SessionKey, SessionOutcome>;
  /** Reason picked when an exercise was swapped. */
  swapReasons: Record<SessionKey, Record<string, ReplacementReason>>;
  /** One row per day: declared state, mode of the day, light activity. */
  dayLogs: DayLog[];
  /** Meals marked in past weeks (the plan itself only holds the current week). */
  mealLog: MealLogEntry[];
  /** Measurements other than the waist. */
  measurements: MeasurementEntry[];
  weeklyCheckins: WeeklyCheckin[];
  milestones: Record<string, MilestoneRecord>;
  adjustments: Adjustment[];
  // Workout Coach (W-2, D-032): published versions and frozen prescriptions, synced.
  programs: ProgramVersion[];
  /** Prescribed sessions by id (live ones are in sessionIds; superseded ones are flagged). */
  prescriptions: Record<string, PrescribedSession>;
  superseded: Record<string, true>;
  /** Sessions without prescription: done off plan, or recorded before W-1. */
  sessionSources: Record<SessionKey, SessionSource>;
  /** Variant chosen for a session in progress. */
  sessionVariants: Record<SessionKey, SessionVariant>;
  /** Felt difficulty 1–5 (W-3 asks it; synced from W-2). */
  sessionDifficulty: Record<SessionKey, number>;
  /** When a prescribed session was opened: its prescription is then what the user saw (D-033). */
  sessionOpened: Record<SessionKey, string>;
  /** Local slot → own slot of a session moved aside by a sync conflict (D-033). */
  sessionSlots: Record<SessionKey, SessionKey>;
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
  markMealSkipped: (mealId: string, reason?: MealReason) => void;
  /** The user ate something else: logged, energy unknown (never counts for the low-intake rule). */
  markMealReplaced: (mealId: string, reason?: MealReason) => void;
  /** Back to "not marked" (a mistaken tap). */
  unmarkMeal: (mealId: string) => void;
  setSessionOutcome: (session: SessionKey, outcome: Omit<SessionOutcome, 'at'> | null) => void;
  /** Merges a patch into the day's row (check-in answers, mode, light activity). */
  logDay: (date: IsoDate, patch: Omit<DayLog, 'date'>) => void;
  logMeasurement: (date: IsoDate, kind: MeasurementEntry['kind'], cm: number) => void;
  saveWeeklyCheckin: (checkin: WeeklyCheckin) => void;
  /** Records milestones reached (derived by journey/milestones.ts); never forgets one. */
  recordMilestones: (reached: Record<string, IsoDate>) => void;
  markCelebrated: (ids: string[]) => void;
  saveAdjustment: (adjustment: Adjustment) => void;
  addExpense: (amountCents: number, spentOn: IsoDate) => void;
  logWeight: (date: IsoDate, weightKg: number) => void;
  logWaist: (date: IsoDate, cm: number) => void;
  logSet: (session: SessionKey, exerciseId: string, set: LoggedSet) => void;
  swapExercise: (session: SessionKey, fromId: string, toId: string, reason?: ReplacementReason) => void;
  completeSession: (session: Omit<CompletedSession, 'completedAt'>) => void;
  reschedule: (from: IsoDate, to: IsoDate) => void;
  /** Stores what `ensureProgram` / `ensureWeek` published or froze (never called with an unchanged week). */
  applyTraining: (records: TrainingRecords) => void;
  /** Variant of the day; its persisted rows come with it the first time it is chosen. */
  chooseVariant: (session: SessionKey, variant: SessionVariant, adapted: PrescribedSession | null) => void;
  rateSession: (session: SessionKey, difficulty: number) => void;
  /** The prescription of a session was shown to the user (first time only). */
  openSession: (session: SessionKey) => void;
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
  sessionOutcomes: {},
  swapReasons: {},
  dayLogs: [],
  mealLog: [],
  measurements: [],
  weeklyCheckins: [],
  milestones: {},
  adjustments: [],
  programs: [],
  prescriptions: {},
  superseded: {},
  sessionSources: {},
  sessionVariants: {},
  sessionDifficulty: {},
  sessionOpened: {},
  sessionSlots: {},
  ownerId: null,
  synced: {},
  lastPulledAt: null,
};

/** Day rows kept on the device (the server keeps them all). */
const MAX_DAY_LOGS = 400;
/** Meal journal kept on the device (the server keeps everything). */
const MAX_MEAL_LOG_DAYS = 400;

/** Adds a week's marked meals to the journal (one entry per meal id, newest wins). */
export function archiveMeals(log: MealLogEntry[], plan: WeeklyMealPlan): MealLogEntry[] {
  const marked = plan.days.flatMap((d) =>
    d.meals.flatMap((m): MealLogEntry[] =>
      m.status === 'planned'
        ? []
        : [
            {
              id: m.id,
              date: m.date,
              slot: m.slot,
              recipeId: m.recipeId,
              servings: m.servings,
              status: m.status,
              ...(m.reason ? { reason: m.reason } : {}),
              kcal: m.status === 'eaten' ? Math.round(m.nutrition.kcal) : 0,
            },
          ],
    ),
  );
  const ids = new Set(marked.map((m) => m.id));
  const all = [...log.filter((m) => !ids.has(m.id)), ...marked].sort((a, b) => a.date.localeCompare(b.date));
  const newest = all.at(-1)?.date;
  if (!newest) return all;
  const [y, mo, d] = newest.split('-').map(Number);
  const oldest = new Date(Date.UTC(y, mo - 1, d) - MAX_MEAL_LOG_DAYS * 86_400_000).toISOString().slice(0, 10);
  return all.filter((m) => m.date >= oldest);
}

function markMeal(
  s: { mealPlan: WeeklyMealPlan | null },
  mealId: string,
  status: 'planned' | 'skipped' | 'replaced',
  reason?: MealReason,
): Partial<DataState> {
  if (!s.mealPlan) return {};
  return {
    mealPlan: {
      ...s.mealPlan,
      days: s.mealPlan.days.map((d) => ({
        ...d,
        meals: d.meals.map((m) => {
          if (m.id !== mealId) return m;
          // Eating consumed the inventory: an eaten meal is not turned into another status here.
          if (m.status === 'eaten') return m;
          const { reason: _r, ...rest } = m;
          return status !== 'planned' && reason ? { ...rest, status, reason } : { ...rest, status };
        }),
      })),
    },
  };
}

/**
 * The session a fact is recorded on: the prescribed one when the day has one, otherwise a new
 * session marked `off_plan` (a real session with no invented prescription).
 */
function withSession(
  s: Pick<DataState, 'sessionIds' | 'sessionSources'>,
  key: SessionKey,
): Pick<DataState, 'sessionIds' | 'sessionSources'> {
  if (s.sessionIds[key]) return { sessionIds: s.sessionIds, sessionSources: s.sessionSources };
  return {
    sessionIds: { ...s.sessionIds, [key]: newId() },
    sessionSources: { ...s.sessionSources, [key]: { source: 'off_plan', programId: null } },
  };
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
        set((s) => {
          const leaving = s.mealPlan && s.mealPlan.weekStart < mealPlan.weekStart ? s.mealPlan : null;
          return {
            mealPlan,
            previousMealPlan: leaving ?? s.previousMealPlan,
            // The week leaving the plan keeps its marked meals in the journal of the journey.
            mealLog: leaving ? archiveMeals(s.mealLog, leaving) : s.mealLog,
          };
        }),
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
      markMealSkipped: (mealId, reason) => set((s) => markMeal(s, mealId, 'skipped', reason)),
      markMealReplaced: (mealId, reason) => set((s) => markMeal(s, mealId, 'replaced', reason)),
      unmarkMeal: (mealId) => set((s) => markMeal(s, mealId, 'planned')),
      setSessionOutcome: (session, outcome) =>
        set((s) => {
          const { [session]: _old, ...rest } = s.sessionOutcomes;
          return {
            ...(outcome ? withSession(s, session) : {}),
            sessionOutcomes: outcome ? { ...rest, [session]: { ...outcome, at: now() } } : rest,
          };
        }),
      logDay: (date, patch) =>
        set((s) => {
          const old = s.dayLogs.find((d) => d.date === date);
          const entry: DayLog = { ...old, ...patch, date };
          return {
            dayLogs: [...s.dayLogs.filter((d) => d.date !== date), entry]
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(-MAX_DAY_LOGS),
          };
        }),
      logMeasurement: (date, kind, cm) =>
        set((s) => {
          const existing = s.measurements.find((m) => m.date === date && m.kind === kind);
          const entry = { id: existing?.id ?? newId(), date, kind, cm };
          return { measurements: [...s.measurements.filter((m) => m !== existing), entry] };
        }),
      saveWeeklyCheckin: (checkin) =>
        set((s) => ({
          weeklyCheckins: [...s.weeklyCheckins.filter((c) => c.weekStart !== checkin.weekStart), checkin],
        })),
      recordMilestones: (reached) =>
        set((s) => {
          const added = Object.entries(reached).filter(([id]) => !s.milestones[id]);
          if (added.length === 0) return {};
          return {
            milestones: {
              ...s.milestones,
              ...Object.fromEntries(added.map(([id, reachedOn]) => [id, { reachedOn, celebratedAt: null }])),
            },
          };
        }),
      markCelebrated: (ids) =>
        set((s) => ({
          milestones: Object.fromEntries(
            Object.entries(s.milestones).map(([id, m]) => [
              id,
              ids.includes(id) && !m.celebratedAt ? { ...m, celebratedAt: now() } : m,
            ]),
          ),
        })),
      saveAdjustment: (adjustment) =>
        set((s) => ({ adjustments: [...s.adjustments.filter((a) => a.id !== adjustment.id), adjustment] })),
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
          ...withSession(s, session),
          setLogs: {
            ...s.setLogs,
            [session]: {
              ...s.setLogs[session],
              [exerciseId]: [...(s.setLogs[session]?.[exerciseId] ?? []), loggedSet],
            },
          },
        })),
      swapExercise: (session, fromId, toId, reason) =>
        set((s) => ({
          ...withSession(s, session),
          exerciseSwaps: { ...s.exerciseSwaps, [session]: { ...s.exerciseSwaps[session], [fromId]: toId } },
          swapReasons: reason
            ? { ...s.swapReasons, [session]: { ...s.swapReasons[session], [fromId]: reason } }
            : s.swapReasons,
        })),
      completeSession: (session) =>
        set((s) => ({
          ...withSession(s, sessionKey(session.date, session.sessionIndex)),
          completedSessions: [
            ...s.completedSessions.filter((c) => !(c.date === session.date && c.sessionIndex === session.sessionIndex)),
            { ...session, completedAt: now() },
          ],
        })),
      reschedule: (from, to) =>
        set((s) => {
          // A prescribed session keeps its row (rescheduled) and the new day gets the same prescription.
          const moved = rescheduleSession(s, s, from, to);
          return { ...(moved ?? {}), rescheduled: { ...s.rescheduled, [from]: to } };
        }),
      applyTraining: (records) =>
        set({
          programs: records.programs,
          prescriptions: records.prescriptions,
          superseded: records.superseded,
          sessionIds: records.sessionIds,
        }),
      chooseVariant: (session, variant, adapted) =>
        set((s) => {
          const { [session]: _old, ...rest } = s.sessionVariants;
          return {
            sessionVariants: variant === 'full' ? rest : { ...rest, [session]: variant },
            prescriptions: adapted ? { ...s.prescriptions, [adapted.id]: adapted } : s.prescriptions,
          };
        }),
      rateSession: (session, difficulty) =>
        set((s) =>
          Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5
            ? { ...withSession(s, session), sessionDifficulty: { ...s.sessionDifficulty, [session]: difficulty } }
            : {},
        ),
      openSession: (session) =>
        set((s) =>
          s.sessionOpened[session] || !s.sessionIds[session]
            ? {}
            : { sessionOpened: { ...s.sessionOpened, [session]: now() } },
        ),
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
      version: 4,
      // v1 had an outbox; v2 syncs by diff and needs the new fields; v3 adds the journey history;
      // v4 the Workout Coach (D-032): the next round re-reads the whole account once, so sessions
      // attached to the reconstructed program elsewhere come back with their program.
      migrate: (persisted, version) => {
        const { outbox: _outbox, ...rest } = (persisted ?? {}) as Record<string, unknown>;
        return { ...initial, ...rest, ...(version < 4 ? { lastPulledAt: null } : {}) } as unknown as DataState;
      },
    },
  ),
);
