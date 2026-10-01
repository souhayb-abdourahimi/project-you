/**
 * Snapshot-diff synchronisation (docs/DECISIONS.md D-015). Pure functions:
 * - `project` turns the local state into the rows the server should hold;
 * - `diff` compares them with the fingerprints of what was last synced;
 * - `applyRemote` merges rows pulled from the server into the local state.
 * Local changes not yet pushed win over the server; otherwise the server wins.
 */
import { z } from 'zod';

import type { Adjustment } from '../journey/adjustments';
import {
  DAY_MODES,
  LIGHT_ACTIVITIES,
  MEAL_REASONS,
  MEASUREMENT_KINDS,
  SESSION_REASONS,
  type DayLog,
  type MealLogEntry,
  type MeasurementEntry,
  type MilestoneRecord,
  type SessionOutcome,
} from '../journey/outcomes';
import { MAIN_PROBLEMS, type WeeklyCheckin } from '../journey/weekly-checkin';
import type { FoodExpense } from '../meals/budget';
import type { InventoryItem, InventorySource, InventoryUnit } from '../meals/inventory';
import type { MealSlot } from '../meals/recipes';
import type { WeeklyMealPlan } from '../meals/planner';
import { UserContextSnapshot } from '../profile/schemas';
import type { WeightEntry } from '../progress/weight';
import type { IsoDate } from '../shared/dates';
import type { SessionVariant } from '../training/adapt';
import type { LoggedSet } from '../training/progression';
import type { ReplacementReason } from '../training/replacement';

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

/*
 * Remote rows are external input: each one is validated before it reaches the local state.
 * Numbers may arrive as strings (Postgres numeric), hence the coercion. Invalid rows are counted
 * in `rejected` and ignored, never patched.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const finite = z.coerce.number().finite();
const nullableFinite = z.union([z.null(), z.undefined(), finite]);
const deletedRow = z.object({ deleted_at: z.string() });
const REMOTE_ROWS = {
  inventory_items: z.object({
    id: z.string(),
    name: z.string().min(1),
    quantity: finite.nonnegative(),
    unit: z.enum(['g', 'ml', 'piece']),
    source: z.enum(['manual', 'barcode', 'receipt', 'photo']).nullish(),
    updated_at: z.string(),
  }),
  food_expenses: z.object({ id: z.string(), amount_cents: z.coerce.number().int().nonnegative(), spent_on: isoDate }),
  weight_logs: z.object({ id: z.string(), measured_on: isoDate, weight_kg: finite.positive() }),
  body_measurements: z.object({ id: z.string(), kind: z.string(), measured_on: isoDate, value_cm: finite.positive() }),
  workout_sessions: z.object({
    id: z.string(),
    scheduled_for: isoDate.nullish(),
    session_index: z.coerce.number().int().nonnegative().nullish(),
    variant: z.enum(['full', 'short', 'light']).nullish(),
    status: z.string(),
  }),
  exercise_logs: z.object({
    session_id: z.string(),
    exercise_id: z.string(),
    set_index: z.coerce.number().int().nonnegative(),
    reps: nullableFinite,
    load_kg: nullableFinite,
    rpe: nullableFinite,
  }),
  meal_plan_items: z.object({
    id: z.string(),
    date: isoDate,
    slot: z.enum(['breakfast', 'lunch', 'snack', 'dinner']),
    recipe_id: z.string(),
    status: z.string(),
    servings: finite.positive().nullish(),
    reason: z.enum(MEAL_REASONS).nullish(),
  }),
  daily_checkins: z.object({
    id: z.string(),
    date: isoDate,
    energy: nullableFinite,
    motivation: nullableFinite,
    fatigue: nullableFinite,
    available_minutes: nullableFinite,
    day_mode: z.enum(DAY_MODES).nullish(),
    activity: z.enum(['walk', 'mobility', 'rest']).nullish(),
    activity_minutes: nullableFinite,
  }),
  weekly_checkins: z.object({
    id: z.string(),
    week_start: isoDate,
    week_rating: z.coerce.number().int().min(1).max(5),
    main_problem: z.enum(MAIN_PROBLEMS).nullish(),
    answered_at: z.string(),
  }),
  exercise_substitutions: z.object({
    session_id: z.string(),
    from_exercise_id: z.string(),
    to_exercise_id: z.string(),
    reason: z.enum(['dislike', 'cant_do', 'no_equipment', 'easier', 'harder']).nullish(),
  }),
  journey_milestones: z.object({ milestone_id: z.string(), reached_on: isoDate, celebrated_at: z.string().nullish() }),
  adjustments: z.object({
    id: z.string(),
    kind: z.string(),
    change_key: z.string(),
    reason_key: z.string(),
    status: z.enum(['proposed', 'applied', 'declined', 'reverted']),
    effective_from: isoDate,
    decided_at: z.string(),
  }),
} satisfies Partial<Record<string, z.ZodType>>;

export interface SyncableState {
  snapshot: UserContextSnapshot | null;
  inventory: InventoryItem[];
  weights: (WeightEntry & { id: string })[];
  waist: (WaistEntry & { id: string })[];
  expenses: FoodExpense[];
  mealPlan: WeeklyMealPlan | null;
  completedSessions: CompletedSession[];
  setLogs: Record<SessionKey, Record<string, LoggedSet[]>>;
  /** Server id of each workout session the user started or completed. */
  sessionIds: Record<SessionKey, string>;
  // Journey history (D-028). Optional so older callers and exports stay valid.
  sessionOutcomes?: Record<SessionKey, SessionOutcome>;
  exerciseSwaps?: Record<SessionKey, Record<string, string>>;
  swapReasons?: Record<SessionKey, Record<string, ReplacementReason>>;
  dayLogs?: DayLog[];
  mealLog?: MealLogEntry[];
  measurements?: MeasurementEntry[];
  weeklyCheckins?: WeeklyCheckin[];
  milestones?: Record<string, MilestoneRecord>;
  adjustments?: Adjustment[];
}

export type SyncTable =
  | 'profiles'
  | 'goals'
  | 'motivations'
  | 'user_preferences'
  | 'inventory_items'
  | 'meal_plan_items'
  | 'food_expenses'
  | 'workout_sessions'
  | 'exercise_logs'
  | 'weight_logs'
  | 'body_measurements'
  | 'daily_checkins'
  | 'weekly_checkins'
  | 'exercise_substitutions'
  | 'journey_milestones'
  | 'adjustments';

export type Row = Record<string, unknown>;

interface TableSpec {
  /** Primary key used to address a row. */
  key: 'id' | 'user_id';
  /** A row that disappears locally is soft-deleted on the server (user deletions). History tables keep it. */
  deleteOnMissing: boolean;
}

/** Push order matters: parents before children (sessions before their sets). */
export const SYNC_TABLES: Record<SyncTable, TableSpec> = {
  profiles: { key: 'user_id', deleteOnMissing: false },
  goals: { key: 'id', deleteOnMissing: false },
  motivations: { key: 'user_id', deleteOnMissing: false },
  user_preferences: { key: 'user_id', deleteOnMissing: false },
  inventory_items: { key: 'id', deleteOnMissing: true },
  meal_plan_items: { key: 'id', deleteOnMissing: false },
  food_expenses: { key: 'id', deleteOnMissing: true },
  workout_sessions: { key: 'id', deleteOnMissing: false },
  exercise_logs: { key: 'id', deleteOnMissing: false },
  weight_logs: { key: 'id', deleteOnMissing: true },
  body_measurements: { key: 'id', deleteOnMissing: true },
  daily_checkins: { key: 'id', deleteOnMissing: false },
  weekly_checkins: { key: 'id', deleteOnMissing: true },
  exercise_substitutions: { key: 'id', deleteOnMissing: false },
  journey_milestones: { key: 'id', deleteOnMissing: false },
  adjustments: { key: 'id', deleteOnMissing: false },
};

export const SYNC_TABLE_ORDER = Object.keys(SYNC_TABLES) as SyncTable[];

/** `${table}:${key}` → fingerprint of the row as last synced. */
export type SyncedHashes = Record<string, string>;

export const rowRef = (table: SyncTable, key: string) => `${table}:${key}`;

/** Deterministic, non-cryptographic 128-bit hash formatted as a UUID (cyrb128). */
export function stableUuid(text: string): string {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1]
    .map((h) => (h >>> 0).toString(16).padStart(8, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Stable JSON (sorted keys) used to fingerprint rows. */
export function hashRow(row: Row): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, sort((v as Row)[k])]),
          )
        : v;
  return JSON.stringify(sort(row));
}

const goalId = (userId: string) => stableUuid(`${userId}:goal`);
const mealRowId = (userId: string, mealId: string) => stableUuid(`${userId}:meal:${mealId}`);
const setRowId = (sessionId: string, exerciseId: string, index: number) =>
  stableUuid(`${sessionId}:${exerciseId}:${index}`);
const dayRowId = (userId: string, date: IsoDate) => stableUuid(`${userId}:day:${date}`);
const weekRowId = (userId: string, weekStart: IsoDate) => stableUuid(`${userId}:week:${weekStart}`);
const swapRowId = (sessionId: string, fromId: string) => stableUuid(`${sessionId}:swap:${fromId}`);
const milestoneRowId = (userId: string, id: string) => stableUuid(`${userId}:milestone:${id}`);

export function sessionKey(date: IsoDate, sessionIndex: number): SessionKey {
  return `${date}#${sessionIndex}`;
}

function parseSessionKey(key: SessionKey): { date: IsoDate; sessionIndex: number } {
  const [date, index] = key.split('#');
  return { date, sessionIndex: Number(index) };
}

const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

/** Rows the server should hold for this user, per table and key. Never includes `updated_at` (server-owned). */
export function project(state: SyncableState, userId: string): Record<SyncTable, Map<string, Row>> {
  const out = Object.fromEntries(SYNC_TABLE_ORDER.map((t) => [t, new Map<string, Row>()])) as Record<
    SyncTable,
    Map<string, Row>
  >;
  const put = (table: SyncTable, fields: Row) => {
    const row: Row = { ...fields, user_id: userId };
    out[table].set(String(row[SYNC_TABLES[table].key]), row);
  };

  const s = state.snapshot;
  if (s) {
    put('profiles', {
      display_name: s.user.displayName,
      birth_year: s.user.birthYear,
      height_cm: s.user.heightCm,
      sex: s.user.sex,
      activity_level: s.user.activityLevel,
      life_status: s.lifestyle.lifeStatus,
      locale: s.preferences.locale,
      onboarding_completed_at: s.createdAt,
    });
    put('goals', {
      id: goalId(userId),
      type: s.goal.type,
      start_weight_kg: s.user.weightKg,
      target_weight_kg: orNull(s.goal.targetWeightKg),
      target_date: orNull(s.goal.targetDate),
      priorities: s.goal.priorities,
      status: 'active',
    });
    put('motivations', {
      why: orNull(s.motivation.why),
      change: orNull(s.motivation.change),
      feel: orNull(s.motivation.feel),
      quit_risk: orNull(s.motivation.quitRisk),
      proud_of: orNull(s.motivation.proudOf),
    });
    put('user_preferences', {
      nutrition: s.nutrition,
      training: s.training,
      schedule: s.schedule,
      kitchen: s.lifestyle.kitchen,
      weekly_food_budget_cents: s.budget.weeklyFoodBudgetCents,
      currency: s.budget.currency,
      motivation_style: s.preferences.motivationStyle,
    });
  }

  for (const i of state.inventory) {
    put('inventory_items', {
      id: i.id,
      food_id: i.foodId,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      category: i.category,
      expires_on: i.expiresOn,
      source: i.source,
      deleted_at: null,
    });
  }
  for (const e of state.expenses) {
    put('food_expenses', {
      id: e.id,
      amount_cents: e.amountCents,
      spent_on: e.spentOn,
      note: orNull(e.note),
      deleted_at: null,
    });
  }
  for (const w of state.weights) {
    put('weight_logs', { id: w.id, measured_on: w.date, weight_kg: w.weightKg, deleted_at: null });
  }
  for (const w of state.waist) {
    put('body_measurements', { id: w.id, measured_on: w.date, kind: 'waist', value_cm: w.cm, deleted_at: null });
  }
  // Meals: only what the user marked, eaten, skipped or replaced (the plan itself is recomputed
  // from the profile). Past weeks come from the journal; the current plan wins for its own days.
  for (const m of state.mealLog ?? []) {
    put('meal_plan_items', {
      id: m.rowId ?? mealRowId(userId, m.id),
      date: m.date,
      slot: m.slot,
      recipe_id: m.recipeId,
      servings: m.servings,
      ingredients: [],
      status: m.status,
      reason: orNull(m.reason),
      deleted_at: null,
    });
  }
  for (const day of state.mealPlan?.days ?? []) {
    for (const m of day.meals) {
      if (m.status === 'planned') continue;
      put('meal_plan_items', {
        id: mealRowId(userId, m.id),
        date: m.date,
        slot: m.slot,
        recipe_id: m.recipeId,
        servings: m.servings,
        ingredients: m.ingredients,
        status: m.status,
        reason: orNull(m.reason),
        deleted_at: null,
      });
    }
  }
  for (const m of state.measurements ?? []) {
    put('body_measurements', { id: m.id, measured_on: m.date, kind: m.kind, value_cm: m.cm, deleted_at: null });
  }
  for (const d of state.dayLogs ?? []) {
    put('daily_checkins', {
      id: dayRowId(userId, d.date),
      date: d.date,
      energy: orNull(d.energy),
      motivation: orNull(d.motivation),
      fatigue: orNull(d.fatigue),
      available_minutes: orNull(d.availableMinutes),
      day_mode: orNull(d.mode),
      activity: orNull(d.activity),
      activity_minutes: orNull(d.activityMinutes),
      deleted_at: null,
    });
  }
  for (const c of state.weeklyCheckins ?? []) {
    put('weekly_checkins', {
      id: weekRowId(userId, c.weekStart),
      week_start: c.weekStart,
      week_rating: c.weekRating,
      energy: orNull(c.energy),
      motivation: orNull(c.motivation),
      fatigue: orNull(c.fatigue),
      nutrition: orNull(c.nutrition),
      training: orNull(c.training),
      difficulty: orNull(c.difficulty),
      main_problem: orNull(c.mainProblem),
      answered_at: c.answeredAt,
      deleted_at: null,
    });
  }
  for (const [id, m] of Object.entries(state.milestones ?? {})) {
    put('journey_milestones', {
      id: milestoneRowId(userId, id),
      milestone_id: id,
      reached_on: m.reachedOn,
      celebrated_at: m.celebratedAt,
      deleted_at: null,
    });
  }
  for (const a of state.adjustments ?? []) {
    put('adjustments', {
      id: a.id,
      kind: a.kind,
      change_key: a.changeKey,
      from_value: a.from,
      to_value: a.to,
      reason_key: a.reasonKey,
      evidence: a.evidence,
      status: a.status,
      effective_from: a.effectiveFrom,
      decided_at: a.decidedAt,
      deleted_at: null,
    });
  }
  const completed = new Map(state.completedSessions.map((c) => [sessionKey(c.date, c.sessionIndex), c]));
  for (const [key, id] of Object.entries(state.sessionIds)) {
    const { date, sessionIndex } = parseSessionKey(key);
    const done = completed.get(key);
    const outcome = done ? undefined : state.sessionOutcomes?.[key];
    put('workout_sessions', {
      id,
      session_index: sessionIndex,
      scheduled_for: date,
      variant: done?.variant ?? 'full',
      completed_at: done?.completedAt ?? null,
      status: done ? 'completed' : (outcome?.status ?? 'in_progress'),
      outcome_reason: orNull(outcome?.reason),
      replaced_by: outcome?.status === 'replaced' ? orNull(outcome.replacedBy) : null,
      deleted_at: null,
    });
    for (const [fromId, toId] of Object.entries(state.exerciseSwaps?.[key] ?? {})) {
      put('exercise_substitutions', {
        id: swapRowId(id, fromId),
        session_id: id,
        from_exercise_id: fromId,
        to_exercise_id: toId,
        reason: orNull(state.swapReasons?.[key]?.[fromId]),
        deleted_at: null,
      });
    }
    for (const [exerciseId, sets] of Object.entries(state.setLogs[key] ?? {})) {
      sets.forEach((set, index) =>
        put('exercise_logs', {
          id: setRowId(id, exerciseId, index),
          session_id: id,
          exercise_id: exerciseId,
          set_index: index,
          reps: set.reps,
          load_kg: set.loadKg,
          rpe: orNull(set.rpe),
          deleted_at: null,
        }),
      );
    }
  }
  return out;
}

export interface SyncPlan {
  upserts: { table: SyncTable; key: string; row: Row; hash: string }[];
  deletes: { table: SyncTable; key: string }[];
}

/** What to push: changed rows, and deletions of rows that were synced and are gone locally. */
export function diff(projected: Record<SyncTable, Map<string, Row>>, synced: SyncedHashes): SyncPlan {
  const plan: SyncPlan = { upserts: [], deletes: [] };
  for (const table of SYNC_TABLE_ORDER) {
    for (const [key, row] of projected[table]) {
      const hash = hashRow(row);
      if (synced[rowRef(table, key)] !== hash) plan.upserts.push({ table, key, row, hash });
    }
  }
  for (const ref of Object.keys(synced)) {
    const [table, key] = ref.split(/:(.*)/s) as [SyncTable, string];
    if (SYNC_TABLES[table]?.deleteOnMissing && !projected[table]?.has(key)) plan.deletes.push({ table, key });
  }
  return plan;
}

/** True when the local row has changes not yet pushed (they win over the server). */
function isPending(
  table: SyncTable,
  key: string,
  projected: Record<SyncTable, Map<string, Row>>,
  synced: SyncedHashes,
) {
  const local = projected[table].get(key);
  const ref = rowRef(table, key);
  // Deleted locally but still on the server: the deletion is pending.
  if (!local) return ref in synced && SYNC_TABLES[table].deleteOnMissing;
  return synced[ref] !== hashRow(local);
}

export interface MergeResult {
  state: SyncableState;
  synced: SyncedHashes;
  /** Rows ignored because they failed validation. */
  rejected: number;
}

const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v));

/**
 * Merges rows pulled from the server. `serverWins` is used when a device first attaches local
 * data to an existing account: the account's data wins, local-only rows are uploaded afterwards.
 */
export function applyRemote(
  state: SyncableState,
  remote: Partial<Record<SyncTable, Row[]>>,
  userId: string,
  synced: SyncedHashes,
  options: { serverWins?: boolean } = {},
): MergeResult {
  const before = project(state, userId);
  const pending = (table: SyncTable, key: string) => !options.serverWins && isPending(table, key, before, synced);
  const next: SyncableState = {
    ...state,
    inventory: [...state.inventory],
    weights: [...state.weights],
    waist: [...state.waist],
    expenses: [...state.expenses],
    completedSessions: [...state.completedSessions],
    setLogs: { ...state.setLogs },
    sessionIds: { ...state.sessionIds },
    sessionOutcomes: { ...state.sessionOutcomes },
    exerciseSwaps: { ...state.exerciseSwaps },
    swapReasons: { ...state.swapReasons },
    dayLogs: [...(state.dayLogs ?? [])],
    mealLog: [...(state.mealLog ?? [])],
    measurements: [...(state.measurements ?? [])],
    weeklyCheckins: [...(state.weeklyCheckins ?? [])],
    milestones: { ...state.milestones },
    adjustments: [...(state.adjustments ?? [])],
  };
  let rejected = 0;
  const upsertBy = <T extends { id: string }>(list: T[], item: T | null, deleted: boolean, id: string) => {
    const rest = list.filter((x) => x.id !== id);
    return deleted || !item ? rest : [...rest, item];
  };
  const rows = (table: SyncTable) =>
    (remote[table] ?? []).filter((r) => {
      const key = String(r[SYNC_TABLES[table].key]);
      if (pending(table, key)) return false;
      const schema = REMOTE_ROWS[table as keyof typeof REMOTE_ROWS];
      if (!schema || schema.safeParse(r).success) return true;
      // A deleted row only needs its key to be applied.
      if (r.deleted_at != null && deletedRow.safeParse(r).success && r[SYNC_TABLES[table].key] != null) return true;
      rejected += 1;
      return false;
    });

  for (const r of rows('inventory_items')) {
    const id = String(r.id);
    next.inventory = upsertBy(
      next.inventory,
      {
        id,
        foodId: str(r.food_id) ?? null,
        name: String(r.name),
        quantity: Number(r.quantity),
        unit: r.unit as InventoryUnit,
        category: String(r.category ?? 'other'),
        expiresOn: str(r.expires_on) ?? null,
        source: (r.source as InventorySource) ?? 'manual',
        addedAt: String(r.created_at ?? r.updated_at),
        updatedAt: String(r.updated_at),
      },
      r.deleted_at != null,
      id,
    );
  }
  for (const r of rows('food_expenses')) {
    const id = String(r.id);
    next.expenses = upsertBy(
      next.expenses,
      { id, amountCents: Number(r.amount_cents), spentOn: String(r.spent_on), note: str(r.note) },
      r.deleted_at != null,
      id,
    );
  }
  for (const r of rows('weight_logs')) {
    const id = String(r.id);
    const date = String(r.measured_on);
    next.weights = upsertBy(
      next.weights.filter((w) => w.id === id || w.date !== date || pending('weight_logs', w.id)),
      { id, date, weightKg: Number(r.weight_kg) },
      r.deleted_at != null,
      id,
    );
  }
  for (const r of rows('body_measurements')) {
    if (r.kind !== 'waist') {
      const kind = MEASUREMENT_KINDS.find((k) => k === r.kind);
      if (!kind) continue;
      const id = String(r.id);
      const date = String(r.measured_on);
      const rest = next.measurements!.filter(
        (m) => m.id !== id && !(m.date === date && m.kind === kind && !pending('body_measurements', m.id)),
      );
      next.measurements = r.deleted_at != null ? rest : [...rest, { id, date, kind, cm: Number(r.value_cm) }];
      continue;
    }
    const id = String(r.id);
    const date = String(r.measured_on);
    next.waist = upsertBy(
      next.waist.filter((w) => w.id === id || w.date !== date || pending('body_measurements', w.id)),
      { id, date, cm: Number(r.value_cm) },
      r.deleted_at != null,
      id,
    );
  }

  const keyById = new Map(Object.entries(next.sessionIds).map(([k, id]) => [id, k]));
  for (const r of rows('workout_sessions')) {
    if (r.deleted_at != null || r.scheduled_for == null || r.session_index == null) continue;
    const key = sessionKey(String(r.scheduled_for), Number(r.session_index));
    const id = String(r.id);
    next.sessionIds[key] = id;
    keyById.set(id, key);
    next.completedSessions = next.completedSessions.filter((c) => sessionKey(c.date, c.sessionIndex) !== key);
    delete next.sessionOutcomes![key];
    if (r.status === 'skipped' || r.status === 'replaced') {
      const reason = SESSION_REASONS.find((x) => x === r.outcome_reason);
      const by = LIGHT_ACTIVITIES.find((x) => x === r.replaced_by);
      next.sessionOutcomes![key] = {
        status: r.status,
        ...(reason ? { reason } : {}),
        ...(r.status === 'replaced' && by ? { replacedBy: by } : {}),
        at: String(r.updated_at ?? ''),
      };
    }
    if (r.status === 'completed') {
      next.completedSessions.push({
        date: String(r.scheduled_for),
        sessionIndex: Number(r.session_index),
        variant: (r.variant as SessionVariant) ?? 'full',
        completedAt: String(r.completed_at ?? r.updated_at),
      });
    }
  }
  for (const r of rows('exercise_logs')) {
    const key = keyById.get(String(r.session_id));
    if (!key || r.deleted_at != null) continue;
    const exerciseId = String(r.exercise_id);
    const sets = [...(next.setLogs[key]?.[exerciseId] ?? [])];
    sets[Number(r.set_index)] = { reps: Number(r.reps ?? 0), loadKg: Number(r.load_kg ?? 0), rpe: num(r.rpe) };
    next.setLogs[key] = { ...next.setLogs[key], [exerciseId]: sets.filter(Boolean) };
  }

  for (const r of rows('exercise_substitutions')) {
    const key = keyById.get(String(r.session_id));
    if (!key || r.deleted_at != null) continue;
    const from = String(r.from_exercise_id);
    next.exerciseSwaps![key] = { ...next.exerciseSwaps![key], [from]: String(r.to_exercise_id) };
    const reason = r.reason as ReplacementReason | null | undefined;
    if (reason) next.swapReasons![key] = { ...next.swapReasons![key], [from]: reason };
  }

  // Meals marked on another device: the current week's plan takes their status, older weeks go to
  // the journal of the journey.
  const marked = rows('meal_plan_items').filter(
    (r) => r.deleted_at == null && (r.status === 'eaten' || r.status === 'skipped' || r.status === 'replaced'),
  );
  const planDays = new Set(next.mealPlan?.days.map((d) => d.date) ?? []);
  if (next.mealPlan) {
    const byKey = new Map(marked.map((r) => [`${r.date}|${r.slot as MealSlot}|${r.recipe_id}`, r]));
    if (byKey.size > 0) {
      next.mealPlan = {
        ...next.mealPlan,
        days: next.mealPlan.days.map((d) => ({
          ...d,
          meals: d.meals.map((m) => {
            const r = byKey.get(`${m.date}|${m.slot}|${m.recipeId}`);
            if (!r) return m;
            const reason = MEAL_REASONS.find((x) => x === r.reason);
            const { reason: _old, ...rest } = m;
            return { ...rest, status: r.status as 'eaten' | 'skipped' | 'replaced', ...(reason ? { reason } : {}) };
          }),
        })),
      };
    }
  }
  const ownRowIds = new Set((next.mealLog ?? []).map((m) => m.rowId ?? mealRowId(userId, m.id)));
  for (const r of marked) {
    if (planDays.has(String(r.date)) || ownRowIds.has(String(r.id))) continue;
    const reason = MEAL_REASONS.find((x) => x === r.reason);
    next.mealLog!.push({
      id: String(r.id),
      rowId: String(r.id),
      date: String(r.date),
      slot: r.slot as MealSlot,
      recipeId: String(r.recipe_id),
      servings: Number(r.servings ?? 1),
      status: r.status as 'eaten' | 'skipped' | 'replaced',
      ...(reason ? { reason } : {}),
      // Energy is recomputed from the recipe by the journey when needed; 0 = unknown here.
      kcal: 0,
    });
  }

  for (const r of rows('daily_checkins')) {
    const date = String(r.date);
    const rest = next.dayLogs!.filter((d) => d.date !== date);
    if (r.deleted_at != null) {
      next.dayLogs = rest;
      continue;
    }
    const mode = DAY_MODES.find((x) => x === r.day_mode);
    const activity = (['walk', 'mobility', 'rest'] as const).find((x) => x === r.activity);
    const entry: DayLog = { date };
    if (r.energy != null) entry.energy = Number(r.energy);
    if (r.motivation != null) entry.motivation = Number(r.motivation);
    if (r.fatigue != null) entry.fatigue = Number(r.fatigue);
    if (r.available_minutes != null) entry.availableMinutes = Number(r.available_minutes);
    if (mode) entry.mode = mode;
    if (activity) entry.activity = activity;
    if (r.activity_minutes != null) entry.activityMinutes = Number(r.activity_minutes);
    next.dayLogs = [...rest, entry].sort((a, b) => a.date.localeCompare(b.date));
  }
  for (const r of rows('weekly_checkins')) {
    const weekStart = String(r.week_start);
    const rest = next.weeklyCheckins!.filter((c) => c.weekStart !== weekStart);
    if (r.deleted_at != null) {
      next.weeklyCheckins = rest;
      continue;
    }
    const level = (v: unknown) => (v == null ? undefined : Number(v));
    const mainProblem = MAIN_PROBLEMS.find((x) => x === r.main_problem);
    const entry: WeeklyCheckin = {
      weekStart,
      weekRating: Number(r.week_rating),
      answeredAt: new Date(String(r.answered_at)).toISOString(),
    };
    for (const k of ['energy', 'motivation', 'fatigue', 'nutrition', 'training', 'difficulty'] as const) {
      const v = level(r[k]);
      if (v !== undefined) entry[k] = v;
    }
    if (mainProblem) entry.mainProblem = mainProblem;
    next.weeklyCheckins = [...rest, entry];
  }
  for (const r of rows('journey_milestones')) {
    if (r.deleted_at != null) continue;
    const id = String(r.milestone_id);
    const old = next.milestones![id];
    next.milestones![id] = {
      reachedOn: old && old.reachedOn < String(r.reached_on) ? old.reachedOn : String(r.reached_on),
      // Celebrated on any device = celebrated.
      celebratedAt: old?.celebratedAt ?? str(r.celebrated_at) ?? null,
    };
  }
  for (const r of rows('adjustments')) {
    if (r.deleted_at != null) continue;
    const id = String(r.id);
    const value = (v: unknown) => (typeof v === 'number' || typeof v === 'string' ? v : null);
    next.adjustments = [
      ...next.adjustments!.filter((a) => a.id !== id),
      {
        id,
        kind: r.kind as Adjustment['kind'],
        changeKey: String(r.change_key),
        from: value(r.from_value),
        to: value(r.to_value),
        reasonKey: String(r.reason_key),
        evidence: (r.evidence && typeof r.evidence === 'object' ? r.evidence : {}) as Adjustment['evidence'],
        status: r.status as Adjustment['status'],
        effectiveFrom: String(r.effective_from),
        decidedAt: String(r.decided_at),
      },
    ];
  }

  const profile = (remote.profiles ?? [])[0];
  const prefs = (remote.user_preferences ?? [])[0];
  const goal = (remote.goals ?? []).find((g) => g.status === 'active');
  const motivation = (remote.motivations ?? [])[0] ?? {};
  const profilePending = ['profiles', 'goals', 'motivations', 'user_preferences'].some((t) =>
    pending(t as SyncTable, t === 'goals' ? goalId(userId) : userId),
  );
  if (profile && prefs && goal && !profilePending) {
    const parsed = UserContextSnapshot.safeParse({
      version: 1,
      createdAt: new Date(String(profile.onboarding_completed_at ?? profile.created_at)).toISOString(),
      user: {
        displayName: profile.display_name,
        birthYear: Number(profile.birth_year),
        heightCm: Number(profile.height_cm),
        weightKg: Number(goal.start_weight_kg),
        sex: profile.sex,
        activityLevel: profile.activity_level,
      },
      goal: {
        type: goal.type,
        targetWeightKg: num(goal.target_weight_kg),
        targetDate: str(goal.target_date),
        priorities: goal.priorities,
      },
      motivation: {
        why: str(motivation.why),
        change: str(motivation.change),
        feel: str(motivation.feel),
        quitRisk: str(motivation.quit_risk),
        proudOf: str(motivation.proud_of),
      },
      nutrition: prefs.nutrition,
      training: prefs.training,
      lifestyle: { lifeStatus: profile.life_status ?? 'other', kitchen: prefs.kitchen ?? [] },
      budget: { weeklyFoodBudgetCents: Number(prefs.weekly_food_budget_cents ?? 0), currency: prefs.currency ?? 'EUR' },
      schedule: prefs.schedule,
      preferences: { locale: profile.locale ?? 'fr', motivationStyle: prefs.motivation_style ?? 'gentle' },
    });
    if (parsed.success) next.snapshot = parsed.data;
    else rejected += 1;
  }

  // Everything now local matches what the server holds, except pending local changes.
  const after = project(next, userId);
  const nextSynced: SyncedHashes = { ...synced };
  for (const table of SYNC_TABLE_ORDER) {
    for (const r of remote[table] ?? []) {
      const key = String(r[SYNC_TABLES[table].key]);
      if (pending(table, key)) continue;
      const local = after[table].get(key);
      if (local) nextSynced[rowRef(table, key)] = hashRow(local);
      else delete nextSynced[rowRef(table, key)];
    }
  }
  return { state: next, synced: nextSynced, rejected };
}
