/**
 * Snapshot-diff synchronisation (docs/DECISIONS.md D-015). Pure functions:
 * - `project` turns the local state into the rows the server should hold;
 * - `diff` compares them with the fingerprints of what was last synced;
 * - `applyRemote` merges rows pulled from the server into the local state.
 * Local changes not yet pushed win over the server; otherwise the server wins.
 */
import { z } from 'zod';

import { ADJUSTMENT_SCOPES, DECISION_STATUSES, type Adjustment } from '../journey/adjustments';
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
  type SessionReason,
} from '../journey/outcomes';
import { MAIN_PROBLEMS, type WeeklyCheckin } from '../journey/weekly-checkin';
import type { FoodExpense } from '../meals/budget';
import type { InventoryItem, InventorySource, InventoryUnit } from '../meals/inventory';
import type { MealSlot } from '../meals/recipes';
import type { WeeklyMealPlan } from '../meals/planner';
import { Equipment, GoalType, TrainingLevel, UserContextSnapshot } from '../profile/schemas';
import type { WeightEntry } from '../progress/weight';
import { addDays, type IsoDate } from '../shared/dates';
import { parseSessionKey, sessionKey, stableUuid, type SessionKey } from '../shared/ids';
import type { SessionVariant } from '../training/adapt';
import {
  deepFreeze,
  plannedExerciseFor,
  TRAINING_PURPOSES,
  type PlannedExercise,
  type PrescribedSession,
  type ProgramVersion,
  type TrainingPurpose,
} from '../training/program';
import {
  LEGACY_PROGRESSION_ACTIONS,
  PROGRESSION_ACTIONS,
  PROGRESSION_CONFIDENCES,
  type LoggedSet,
} from '../training/progression';
import { REPLACEMENT_REASONS, type ReplacementReason } from '../training/replacement';
import type { ExerciseReport } from '../training/session';
import { archivedVersion, hasFacts, keptSession, type SessionSource } from '../training/week';

export { sessionKey, stableUuid, type SessionKey };

export interface CompletedSession {
  date: IsoDate;
  sessionIndex: number;
  variant: SessionVariant;
  completedAt: string;
  /** Ended early on purpose (W-3, D-034): status `completed` with this `outcome_reason`. */
  stopped?: SessionReason;
}

export interface WaistEntry {
  date: IsoDate;
  cm: number;
}

/*
 * Remote rows are external input: each one is validated before it reaches the local state.
 * Numbers may arrive as strings (Postgres numeric), hence the coercion. Invalid rows are counted
 * in `rejected` and ignored, never patched.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const finite = z.coerce.number().finite();
const nullableFinite = z.union([z.null(), z.undefined(), finite]);
const deletedRow = z.object({ deleted_at: z.string() });
const FOCUSES = ['full_a', 'full_b', 'upper', 'lower'] as const;
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
  training_programs: z
    .object({
      id: z.string(),
      lineage_id: z.string(),
      version: z.coerce.number().int().min(1),
      source: z.enum(['engine', 'reconstructed']),
      status: z.enum(['active', 'superseded', 'ended']),
      reason_key: z.string().min(1),
      adjustment_id: z.string().nullish(),
      engine_version: z.coerce.number().int().min(1).nullish(),
      goal: GoalType.nullish(),
      split: z.array(z.enum(FOCUSES)).min(1).nullish(),
      sessions_per_week: z.coerce.number().int().min(1).max(6).nullish(),
      session_minutes: z.coerce.number().int().min(10).max(180).nullish(),
      level: TrainingLevel.nullish(),
      equipment: z.array(Equipment).nullish(),
      excluded_exercise_ids: z.array(z.string()).nullish(),
      rotated_exercise_ids: z.array(z.string()).nullish(),
      cycle_weeks: z.coerce.number().int().nullish(),
      effective_from: isoDate,
      effective_to: isoDate.nullish(),
      published_at: z.string(),
    })
    .refine(
      (r) =>
        r.source !== 'engine' ||
        (r.engine_version != null &&
          r.goal != null &&
          r.split != null &&
          r.sessions_per_week != null &&
          r.session_minutes != null &&
          r.level != null &&
          r.equipment != null &&
          r.excluded_exercise_ids != null),
    ),
  workout_sessions: z
    .object({
      id: z.string(),
      scheduled_for: isoDate.nullish(),
      session_index: z.coerce.number().int().nonnegative().nullish(),
      variant: z.enum(['full', 'short', 'light']).nullish(),
      status: z.string(),
      program_id: z.string().nullish(),
      focus: z.enum(FOCUSES).nullish(),
      planned_minutes: z.coerce.number().int().positive().nullish(),
      purpose: z.enum(TRAINING_PURPOSES).nullish(),
      prescription_source: z.enum(['engine', 'off_plan', 'unknown']).nullish(),
      prescribed_at: z.string().nullish(),
      adapted_minutes: z.coerce.number().int().positive().nullish(),
      adaptation_reason: z.string().nullish(),
      adjustment_id: z.string().nullish(),
      rescheduled_to: isoDate.nullish(),
      difficulty: z.coerce.number().int().min(1).max(5).nullish(),
      started_at: z.string().nullish(),
    })
    .refine(
      (r) =>
        r.prescription_source !== 'engine' ||
        (r.program_id != null &&
          r.prescribed_at != null &&
          r.focus != null &&
          r.planned_minutes != null &&
          r.purpose != null &&
          r.scheduled_for != null &&
          r.session_index != null),
    ),
  planned_exercises: z.object({
    id: z.string(),
    session_id: z.string(),
    variant: z.enum(['full', 'short', 'light']),
    position: z.coerce.number().int().min(0),
    exercise_id: z.string().min(1),
    sets: z.coerce.number().int().min(1),
    reps_min: z.coerce.number().int().min(1),
    reps_max: z.coerce.number().int().min(1),
    unit: z.enum(['reps', 'seconds']),
    rest_seconds: z.coerce.number().int().min(0),
    target_rpe: nullableFinite,
    target_load_kg: nullableFinite,
    progression_action: z.enum([...PROGRESSION_ACTIONS, ...LEGACY_PROGRESSION_ACTIONS]).nullish(),
    progression_reason: z.string().nullish(),
    target_reps: nullableFinite.optional(),
    progression_confidence: z.enum(PROGRESSION_CONFIDENCES).nullish(),
    progression_params: z.record(z.string(), z.union([z.number(), z.string()])).nullish(),
    purpose: z.enum(TRAINING_PURPOSES),
    purpose_target: z.string().nullish(),
    prescribed_at: z.string(),
  }),
  exercise_logs: z.object({
    session_id: z.string(),
    exercise_id: z.string(),
    set_index: z.coerce.number().int().nonnegative(),
    reps: nullableFinite,
    seconds: nullableFinite.optional(),
    load_kg: nullableFinite,
    rpe: nullableFinite,
  }),
  exercise_reports: z
    .object({
      session_id: z.string(),
      exercise_id: z.string().min(1),
      not_performed: z.boolean(),
      not_performed_reason: z.enum(REPLACEMENT_REASONS).nullish(),
      difficulty: z.coerce.number().int().min(1).max(5).nullish(),
    })
    .refine((r) => r.not_performed || r.difficulty != null),
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
    reason: z.enum(REPLACEMENT_REASONS).nullish(),
  }),
  journey_milestones: z.object({ milestone_id: z.string(), reached_on: isoDate, celebrated_at: z.string().nullish() }),
  adjustments: z.object({
    id: z.string(),
    kind: z.string(),
    change_key: z.string(),
    reason_key: z.string(),
    status: z.enum(DECISION_STATUSES),
    effective_from: isoDate,
    decided_at: z.string(),
    proposal_id: z.string().nullish(),
    scope: z.enum(ADJUSTMENT_SCOPES).nullish(),
    effective_to: isoDate.nullish(),
    session_count: z.coerce.number().int().min(1).nullish(),
    revision: z.coerce.number().int().min(0).nullish(),
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
  // Workout Coach (W-2, D-032). Optional so older callers and exports stay valid.
  /** Published program versions (server copy + local cache). */
  programs?: ProgramVersion[];
  /** Frozen prescriptions by session id, live and superseded. */
  prescriptions?: Record<string, PrescribedSession>;
  superseded?: Record<string, true>;
  /** Origin of sessions without prescription (off plan, history before W-1). */
  sessionSources?: Record<SessionKey, SessionSource>;
  /** Variant chosen for a session not finished yet (the finished one is in completedSessions). */
  sessionVariants?: Record<SessionKey, SessionVariant>;
  /** Felt difficulty, 1–5 (declared in words). */
  sessionDifficulty?: Record<SessionKey, number>;
  /** Planned date → new date (synced from W-2 through `workout_sessions.rescheduled_to`). */
  rescheduled?: Record<IsoDate, IsoDate>;
  /** When a prescribed session was opened (`workout_sessions.started_at`, D-033). */
  sessionOpened?: Record<SessionKey, string>;
  /**
   * Local slot → the session's own `date#index` on the server, for a session moved to a free slot of
   * its day because another real session holds that slot (D-033). Absent = same slot.
   */
  sessionSlots?: Record<SessionKey, SessionKey>;
  /** Per prescribed exercise: not performed (and why), felt difficulty (W-3, `exercise_reports`). */
  exerciseReports?: Record<SessionKey, Record<string, ExerciseReport>>;
}

export type SyncTable =
  | 'profiles'
  | 'goals'
  | 'motivations'
  | 'user_preferences'
  | 'inventory_items'
  | 'meal_plan_items'
  | 'food_expenses'
  | 'training_programs'
  | 'workout_sessions'
  | 'planned_exercises'
  | 'exercise_logs'
  | 'weight_logs'
  | 'body_measurements'
  | 'daily_checkins'
  | 'weekly_checkins'
  | 'exercise_substitutions'
  | 'exercise_reports'
  | 'journey_milestones'
  | 'adjustments';

export type Row = Record<string, unknown>;

interface TableSpec {
  /** Primary key used to address a row. */
  key: 'id' | 'user_id';
  /**
   * A row that disappears locally is soft-deleted on the server (user deletions). History tables keep
   * it. `with_session`: only while its session is still here (a set or report the user removed, W-3);
   * a session that leaves the device (moved by a conflict, reset) never takes its facts with it.
   */
  deleteOnMissing: boolean | 'with_session';
}

/**
 * Push order matters: parents before children (program versions before their sessions, sessions
 * before their prescriptions, prescriptions before the sets linked to them). Program versions and
 * prescriptions are never deleted by the sync (immutable; erasure goes through the Privacy Center).
 */
export const SYNC_TABLES: Record<SyncTable, TableSpec> = {
  profiles: { key: 'user_id', deleteOnMissing: false },
  goals: { key: 'id', deleteOnMissing: false },
  motivations: { key: 'user_id', deleteOnMissing: false },
  user_preferences: { key: 'user_id', deleteOnMissing: false },
  inventory_items: { key: 'id', deleteOnMissing: true },
  meal_plan_items: { key: 'id', deleteOnMissing: false },
  food_expenses: { key: 'id', deleteOnMissing: true },
  training_programs: { key: 'id', deleteOnMissing: false },
  workout_sessions: { key: 'id', deleteOnMissing: false },
  planned_exercises: { key: 'id', deleteOnMissing: false },
  // A set removed by a correction is soft-deleted (W-3); erasure still goes through the Privacy Center.
  exercise_logs: { key: 'id', deleteOnMissing: 'with_session' },
  weight_logs: { key: 'id', deleteOnMissing: true },
  body_measurements: { key: 'id', deleteOnMissing: true },
  daily_checkins: { key: 'id', deleteOnMissing: false },
  weekly_checkins: { key: 'id', deleteOnMissing: true },
  // An undone replacement is soft-deleted (W-7.1): it never comes back from the server.
  exercise_substitutions: { key: 'id', deleteOnMissing: 'with_session' },
  exercise_reports: { key: 'id', deleteOnMissing: 'with_session' },
  journey_milestones: { key: 'id', deleteOnMissing: false },
  adjustments: { key: 'id', deleteOnMissing: false },
};

export const SYNC_TABLE_ORDER = Object.keys(SYNC_TABLES) as SyncTable[];

/** `${table}:${key}` → fingerprint of the row as last synced. */
export type SyncedHashes = Record<string, string>;

export const rowRef = (table: SyncTable, key: string) => `${table}:${key}`;

/** Stable JSON (sorted keys) used to fingerprint rows; the JSON itself, so a pending deletion can read its session. */
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
const reportRowId = (sessionId: string, exerciseId: string) => stableUuid(`${sessionId}:report:${exerciseId}`);
const milestoneRowId = (userId: string, id: string) => stableUuid(`${userId}:milestone:${id}`);

const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

function programRow(p: ProgramVersion): Row {
  const k = p.params;
  return {
    id: p.id,
    lineage_id: p.lineageId,
    version: p.version,
    source: p.source,
    status: p.status,
    reason_key: p.reasonKey,
    adjustment_id: p.adjustmentId,
    engine_version: k?.engineVersion ?? null,
    goal: k?.goal ?? null,
    split: k ? [...k.split] : null,
    sessions_per_week: k?.sessionsPerWeek ?? null,
    session_minutes: k?.sessionMinutes ?? null,
    level: k?.level ?? null,
    equipment: k ? [...k.equipment] : null,
    excluded_exercise_ids: k ? [...k.excludedExerciseIds] : null,
    // W-5: only when the version rotated exercises (older versions keep the same content).
    ...(k?.rotatedExerciseIds?.length ? { rotated_exercise_ids: [...k.rotatedExerciseIds] } : {}),
    cycle_weeks: p.cycleWeeks,
    effective_from: p.effectiveFrom,
    effective_to: p.effectiveTo,
    published_at: p.publishedAt,
  };
}

function programFromRow(r: Row): ProgramVersion {
  const engine = r.source === 'engine' && r.engine_version != null;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return deepFreeze({
    id: String(r.id),
    lineageId: String(r.lineage_id),
    version: Number(r.version),
    source: r.source as ProgramVersion['source'],
    status: r.status as ProgramVersion['status'],
    reasonKey: String(r.reason_key),
    adjustmentId: str(r.adjustment_id) ?? null,
    // Same key order as `programParams`, so versions compare as JSON.
    params: engine
      ? {
          engineVersion: Number(r.engine_version),
          goal: r.goal as GoalType,
          split: list(r.split) as PrescribedSession['focus'][],
          sessionsPerWeek: Number(r.sessions_per_week),
          sessionMinutes: Number(r.session_minutes),
          level: r.level as TrainingLevel,
          equipment: list(r.equipment) as Equipment[],
          excludedExerciseIds: list(r.excluded_exercise_ids),
          ...(list(r.rotated_exercise_ids).length > 0 ? { rotatedExerciseIds: list(r.rotated_exercise_ids) } : {}),
        }
      : null,
    cycleWeeks: num(r.cycle_weeks) ?? null,
    effectiveFrom: String(r.effective_from),
    effectiveTo: str(r.effective_to) ?? null,
    publishedAt: String(r.published_at),
  });
}

/** Prescription columns of a session row; a session without prescription says where it comes from. */
function prescriptionColumns(p?: PrescribedSession, source?: SessionSource): Row {
  return p
    ? {
        program_id: p.programId,
        focus: p.focus,
        planned_minutes: p.plannedMinutes,
        purpose: p.purpose,
        prescription_source: 'engine',
        prescribed_at: p.prescribedAt,
        adapted_minutes: p.adaptedMinutes,
        adaptation_reason: p.adaptationReason,
        // W-5: only on a prescription shaped by a structural decision (others keep their content).
        ...(p.adjustmentId ? { adjustment_id: p.adjustmentId } : {}),
      }
    : {
        program_id: source?.programId ?? null,
        focus: null,
        planned_minutes: null,
        purpose: null,
        // Null = recorded before W-2 and not attached yet (`attach_reconstructed_training_history`).
        prescription_source: source?.source ?? null,
        prescribed_at: null,
        adapted_minutes: null,
        adaptation_reason: null,
      };
}

function plannedRow(e: PlannedExercise): Row {
  return {
    id: e.id,
    session_id: e.sessionId,
    variant: e.variant,
    position: e.position,
    exercise_id: e.exerciseId,
    sets: e.sets,
    reps_min: e.repsMin,
    reps_max: e.repsMax,
    unit: e.unit,
    rest_seconds: e.restSeconds,
    target_rpe: e.targetRpe,
    target_load_kg: e.targetLoadKg,
    progression_action: e.progressionAction,
    progression_reason: e.progressionReason,
    // W-4 columns only when set: rows prescribed before keep the same content (and hash).
    ...(e.targetReps !== null ? { target_reps: e.targetReps } : {}),
    ...(e.progressionConfidence !== null ? { progression_confidence: e.progressionConfidence } : {}),
    ...(e.progressionParams !== null ? { progression_params: e.progressionParams } : {}),
    purpose: e.purpose,
    purpose_target: e.purposeTarget,
    prescribed_at: e.prescribedAt,
  };
}

function plannedFromRow(r: Row): PlannedExercise {
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    variant: r.variant as SessionVariant,
    position: Number(r.position),
    exerciseId: String(r.exercise_id),
    sets: Number(r.sets),
    repsMin: Number(r.reps_min),
    repsMax: Number(r.reps_max),
    unit: r.unit as PlannedExercise['unit'],
    restSeconds: Number(r.rest_seconds),
    targetRpe: num(r.target_rpe) ?? null,
    targetLoadKg: num(r.target_load_kg) ?? null,
    progressionAction: (r.progression_action as PlannedExercise['progressionAction']) ?? null,
    progressionReason: str(r.progression_reason) ?? null,
    targetReps: num(r.target_reps) ?? null,
    progressionConfidence: (r.progression_confidence as PlannedExercise['progressionConfidence']) ?? null,
    progressionParams:
      r.progression_params && typeof r.progression_params === 'object'
        ? { ...(r.progression_params as Record<string, number | string>) }
        : null,
    purpose: r.purpose as TrainingPurpose,
    purposeTarget: str(r.purpose_target) ?? null,
    prescribedAt: String(r.prescribed_at),
  };
}

/** The planned rows of the variant done (the full prescription when the variant has none). */
function plannedOf(p: PrescribedSession, variant: SessionVariant): PlannedExercise[] {
  const rows = p.exercises.filter((e) => e.variant === variant);
  return rows.length > 0 ? rows : p.exercises.filter((e) => e.variant === 'full');
}

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
      // W-5 columns only when set: decisions recorded before keep the same content (and hash).
      ...(a.proposalId ? { proposal_id: a.proposalId } : {}),
      ...(a.scope ? { scope: a.scope } : {}),
      ...(a.effectiveTo ? { effective_to: a.effectiveTo } : {}),
      ...(a.sessionCount ? { session_count: a.sessionCount } : {}),
      // W-7.1 column only when set: rows recorded before keep the same content (and hash).
      ...(a.revision ? { revision: a.revision } : {}),
      deleted_at: null,
    });
  }
  // Program versions: closed ones first, so the "one active version" index never sees two.
  for (const p of [...(state.programs ?? [])].sort(
    (a, b) => Number(a.status === 'active') - Number(b.status === 'active'),
  )) {
    put('training_programs', programRow(p));
  }
  const prescriptions = state.prescriptions ?? {};
  const projected: PrescribedSession[] = [];
  const completed = new Map(state.completedSessions.map((c) => [sessionKey(c.date, c.sessionIndex), c]));
  for (const [key, id] of Object.entries(state.sessionIds)) {
    const { date, sessionIndex } = parseSessionKey(state.sessionSlots?.[key] ?? key);
    const p = prescriptions[id];
    const done = completed.get(key);
    const outcome = done ? undefined : state.sessionOutcomes?.[key];
    // The original of a reschedule keeps its row: status `rescheduled`, with the new date.
    const movedTo = p && p.date === date && !done && !outcome ? state.rescheduled?.[date] : undefined;
    const variant = done?.variant ?? state.sessionVariants?.[key] ?? 'full';
    put('workout_sessions', {
      id,
      session_index: sessionIndex,
      scheduled_for: date,
      variant,
      completed_at: done?.completedAt ?? null,
      status: done
        ? 'completed'
        : outcome
          ? outcome.status
          : movedTo
            ? 'rescheduled'
            : p && !hasFacts(state, key)
              ? 'planned'
              : 'in_progress',
      outcome_reason: orNull(done ? done.stopped : outcome?.reason),
      replaced_by: outcome?.status === 'replaced' ? orNull(outcome.replacedBy) : null,
      ...prescriptionColumns(p, state.sessionSources?.[key]),
      rescheduled_to: movedTo ?? null,
      difficulty: state.sessionDifficulty?.[key] ?? null,
      started_at: state.sessionOpened?.[key] ?? null,
      deleted_at: null,
    });
    if (p) projected.push(p);
    // Sets and replacements point to the exercise they answered in the prescription of the day.
    const planned = p ? plannedOf(p, variant) : [];
    const swaps = Object.entries(state.exerciseSwaps?.[key] ?? {}).map(([fromId, toId]) => ({ fromId, toId }));
    for (const { fromId, toId } of swaps) {
      put('exercise_substitutions', {
        id: swapRowId(id, fromId),
        session_id: id,
        from_exercise_id: fromId,
        to_exercise_id: toId,
        reason: orNull(state.swapReasons?.[key]?.[fromId]),
        planned_exercise_id: plannedExerciseFor(planned, fromId)?.id ?? null,
        deleted_at: null,
      });
    }
    for (const [exerciseId, sets] of Object.entries(state.setLogs[key] ?? {})) {
      const plannedId = plannedExerciseFor(planned, exerciseId, swaps)?.id ?? null;
      sets.forEach((set, index) =>
        put('exercise_logs', {
          id: setRowId(id, exerciseId, index),
          session_id: id,
          exercise_id: exerciseId,
          set_index: index,
          reps: set.reps,
          // A hold is stored in seconds (reps null, `exercise_logs_reps_or_seconds`).
          ...(set.seconds !== undefined ? { reps: null, seconds: set.seconds } : {}),
          load_kg: set.loadKg,
          rpe: orNull(set.rpe),
          planned_exercise_id: plannedId,
          deleted_at: null,
        }),
      );
    }
  }
  for (const [key, reports] of Object.entries(state.exerciseReports ?? {})) {
    const id = state.sessionIds[key];
    if (!id) continue;
    const variant = state.completedSessions.find((c) => sessionKey(c.date, c.sessionIndex) === key)?.variant;
    const planned = prescriptions[id]
      ? plannedOf(prescriptions[id], variant ?? state.sessionVariants?.[key] ?? 'full')
      : [];
    for (const [exerciseId, r] of Object.entries(reports)) {
      if (!r.notPerformed && r.difficulty === undefined) continue;
      put('exercise_reports', {
        id: reportRowId(id, exerciseId),
        session_id: id,
        exercise_id: exerciseId,
        planned_exercise_id: plannedExerciseFor(planned, exerciseId)?.id ?? null,
        not_performed: !!r.notPerformed,
        not_performed_reason: r.notPerformed ? orNull(r.notPerformedReason) : null,
        difficulty: orNull(r.difficulty),
        deleted_at: null,
      });
    }
  }
  // Prescriptions replaced before they started: kept on the server as `superseded`.
  const live = new Set(Object.values(state.sessionIds));
  for (const id of Object.keys(state.superseded ?? {})) {
    const p = prescriptions[id];
    if (!p || live.has(id)) continue;
    put('workout_sessions', {
      id,
      session_index: p.sessionIndex,
      scheduled_for: p.date,
      variant: 'full',
      completed_at: null,
      status: 'superseded',
      outcome_reason: null,
      replaced_by: null,
      ...prescriptionColumns(p),
      rescheduled_to: null,
      difficulty: null,
      started_at: null,
      deleted_at: null,
    });
    projected.push(p);
  }
  for (const p of projected) for (const e of p.exercises) put('planned_exercises', plannedRow(e));
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
    if (deletable(table, ref, projected, synced) && !projected[table]?.has(key)) plan.deletes.push({ table, key });
  }
  return plan;
}

/** A synced row missing locally is a deletion to push (see `TableSpec.deleteOnMissing`). */
function deletable(
  table: SyncTable,
  ref: string,
  projected: Record<SyncTable, Map<string, Row>>,
  synced: SyncedHashes,
): boolean {
  const rule = SYNC_TABLES[table]?.deleteOnMissing;
  if (rule !== 'with_session') return !!rule && ref in synced;
  if (!(ref in synced)) return false;
  // The fingerprint is the row's stable JSON: it still names the session the row belonged to.
  try {
    const sessionId = (JSON.parse(synced[ref]) as Row).session_id;
    return typeof sessionId === 'string' && projected.workout_sessions.has(sessionId);
  } catch {
    return false;
  }
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
  if (!local) return deletable(table, ref, projected, synced);
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
    programs: [...(state.programs ?? [])],
    prescriptions: { ...state.prescriptions },
    superseded: { ...state.superseded },
    sessionSources: { ...state.sessionSources },
    sessionVariants: { ...state.sessionVariants },
    sessionDifficulty: { ...state.sessionDifficulty },
    rescheduled: { ...state.rescheduled },
    sessionOpened: { ...state.sessionOpened },
    sessionSlots: { ...state.sessionSlots },
    exerciseReports: { ...state.exerciseReports },
  };
  let rejected = 0;
  /** Session ids whose local content was kept under new ids (D-033): their server rows apply as they are. */
  const forked = new Set<string>();
  const forkedChild = (table: SyncTable, r: Row) =>
    (table === 'exercise_logs' || table === 'exercise_substitutions' || table === 'exercise_reports') &&
    forked.has(String(r.session_id));
  /** Rows the merge changed on purpose (a server session superseded here): left to be pushed. */
  const toPush = new Set<string>();
  /** Rows taken from the server even though the local copy differed (immutable rows). */
  const adopted = new Set<string>();
  const upsertBy = <T extends { id: string }>(list: T[], item: T | null, deleted: boolean, id: string) => {
    const rest = list.filter((x) => x.id !== id);
    return deleted || !item ? rest : [...rest, item];
  };
  const valid = (table: SyncTable) =>
    (remote[table] ?? []).filter((r) => {
      const schema = REMOTE_ROWS[table as keyof typeof REMOTE_ROWS];
      if (!schema || schema.safeParse(r).success) return true;
      if (r.deleted_at != null && deletedRow.safeParse(r).success && r[SYNC_TABLES[table].key] != null) return true;
      rejected += 1;
      return false;
    });
  const rows = (table: SyncTable) =>
    (remote[table] ?? []).filter((r) => {
      const key = String(r[SYNC_TABLES[table].key]);
      if (pending(table, key) && !forkedChild(table, r)) return false;
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

  // --- Workout Coach (D-032) ---------------------------------------------------------------
  // Published versions are arbitrated by the server: its copy wins, except a lifecycle move made
  // here (closing a version) on a row the server has not changed since the last sync.
  const onServer = (table: SyncTable, id: string) =>
    rowRef(table, id) in synced || (remote[table] ?? []).some((r) => String(r.id) === id);
  const owned = (row: Row) => ({ ...row, user_id: userId });
  /** Versions whose local content lost against the server's (same id, other parameters). */
  const lost = new Set<string>();
  const lostLocal = new Map<string, ProgramVersion>();
  for (const r of valid('training_programs')) {
    const server = programFromRow(r);
    const ref = rowRef('training_programs', server.id);
    const local = next.programs!.find((p) => p.id === server.id);
    if (local && !options.serverWins) {
      const localChanged = synced[ref] !== hashRow(owned(programRow(local)));
      const serverUnchanged = synced[ref] === hashRow(owned(programRow(server)));
      if (localChanged && serverUnchanged) continue;
    }
    if (local && JSON.stringify(local.params) !== JSON.stringify(server.params)) {
      lost.add(server.id);
      lostLocal.set(server.id, local);
    }
    if (local) adopted.add(ref);
    next.programs = [...next.programs!.filter((p) => p.id !== server.id), server];
  }

  // Sessions. The prescription part of a row is immutable: the server's copy always wins, even
  // over local changes not pushed yet (those are facts: they keep winning on their own columns).
  const sessionRows = valid('workout_sessions').filter(
    (r) => r.deleted_at == null && r.scheduled_for != null && r.session_index != null,
  );
  // Historical truth (D-033): the server decides the version in force for the future; the
  // prescription a used session was shown (opened, a set, a replacement, an outcome, a difficulty)
  // stays the one its facts belong to. When the server holds another prescription for that session
  // id, or the session's version lost, the used one is kept under its own ids (and its version
  // archived, closed) instead of adopting the server's. Nothing is ever deleted.
  const remoteSessions = new Map(sessionRows.map((r) => [String(r.id), r]));
  for (const [key, id] of Object.entries(state.sessionIds)) {
    const p = state.prescriptions?.[id];
    if (!p || !hasFacts(state, key)) continue;
    const server = remoteSessions.get(id);
    const lostVersion = lostLocal.get(p.programId);
    const other =
      server?.prescription_source === 'engine' &&
      Date.parse(String(server.prescribed_at)) !== Date.parse(p.prescribedAt);
    // Same session and time, but another variant content (a short version computed on each
    // device, W-7.1): the rows used here are the history, never the other device's.
    const otherRows = valid('planned_exercises').some((r) => {
      if (String(r.session_id) !== id) return false;
      const mine = p.exercises.find((x) => x.id === String(r.id));
      if (!mine) return p.exercises.some((x) => x.variant === r.variant);
      return hashRow(plannedRow(mine)) !== hashRow(plannedRow(plannedFromRow(r)));
    });
    if (!lostVersion && !other && !otherRows) continue;
    let programId = p.programId;
    if (lostVersion) {
      const archived = archivedVersion(
        lostVersion,
        next.programs!.find((x) => x.id === p.programId)!,
      );
      if (!next.programs!.some((x) => x.id === archived.id)) next.programs = [...next.programs!, archived];
      programId = archived.id;
    }
    const kept = keptSession(p, programId, key);
    delete next.prescriptions![id];
    next.prescriptions![kept.id] = kept;
    next.sessionIds[key] = kept.id;
    forked.add(id);
  }

  const replaced = new Set<string>();
  for (const r of sessionRows) {
    const id = String(r.id);
    const key = sessionKey(String(r.scheduled_for), Number(r.session_index));
    if (r.prescription_source === 'engine') {
      const local = next.prescriptions![id];
      const server: PrescribedSession = {
        id,
        programId: String(r.program_id),
        date: String(r.scheduled_for),
        sessionIndex: Number(r.session_index),
        focus: r.focus as PrescribedSession['focus'],
        plannedMinutes: Number(r.planned_minutes),
        purpose: r.purpose as TrainingPurpose,
        prescriptionSource: 'engine',
        prescribedAt: String(r.prescribed_at),
        adaptedMinutes: num(r.adapted_minutes) ?? null,
        adaptationReason: str(r.adaptation_reason) ?? null,
        ...(str(r.adjustment_id) ? { adjustmentId: str(r.adjustment_id)! } : {}),
        exercises: local?.exercises ?? [],
      };
      if (local && Date.parse(local.prescribedAt) !== Date.parse(server.prescribedAt)) replaced.add(id);
      next.prescriptions![id] = deepFreeze(server);
    } else if (next.sessionIds[key] === id) {
      if (r.prescription_source === 'off_plan' || r.prescription_source === 'unknown') {
        next.sessionSources![key] = { source: r.prescription_source, programId: str(r.program_id) ?? null };
      }
    }
  }
  // Planned exercises: immutable, the server's rows win. When the session itself came from another
  // device (conflict), its rows replace the local ones variant by variant.
  const plannedRows = valid('planned_exercises');
  for (const r of plannedRows) {
    const e = plannedFromRow(r);
    const p = next.prescriptions![e.sessionId];
    if (!p) continue;
    const keep = p.exercises.filter(
      (x) =>
        x.id !== e.id && !(replaced.has(p.id) && x.variant === e.variant && !plannedRows.some((y) => y.id === x.id)),
    );
    next.prescriptions![p.id] = deepFreeze({
      ...p,
      exercises: [...keep, e].sort((a, b) => a.variant.localeCompare(b.variant) || a.position - b.position),
    });
    adopted.add(rowRef('planned_exercises', e.id));
  }

  // What happened to each session: local changes not pushed yet win.
  const keyById = new Map(Object.entries(next.sessionIds).map(([k, id]) => [id, k]));
  for (const r of sessionRows) {
    const id = String(r.id);
    if (pending('workout_sessions', id) && !forked.has(id)) continue;
    const natural = sessionKey(String(r.scheduled_for), Number(r.session_index));
    let key = keyById.get(id) ?? natural;
    if (r.status === 'superseded') {
      next.superseded![id] = true;
      if (next.sessionIds[key] === id) {
        delete next.sessionIds[key];
        keyById.delete(id);
      }
      continue;
    }
    const current = next.sessionIds[key];
    if (current && current !== id) {
      // Two sessions for one slot (D-033). The used one is the slot's session (historical truth);
      // a planned one facing it is abandoned, kept as `superseded`, never deleted.
      const localUsed = hasFacts(next, key);
      const remoteUsed = USED_STATUSES.has(String(r.status)) || r.started_at != null;
      if (localUsed && !remoteUsed) {
        if (next.prescriptions![id] && !next.superseded![id]) {
          next.superseded![id] = true;
          toPush.add(rowRef('workout_sessions', id));
        }
        continue;
      }
      if (localUsed && remoteUsed) {
        // Two real sessions: both kept, each counted once. The smaller id keeps the slot on every
        // device; the other is shown in a free slot of the same day (its row keeps its own index).
        const slot = freeSlot(next, String(r.scheduled_for));
        if (current < id) {
          next.sessionSlots![slot] = natural;
          key = slot;
        } else {
          moveSlot(next, key, slot);
          keyById.set(current, slot);
        }
      } else {
        if (next.prescriptions![current] && rowRef('workout_sessions', current) in synced)
          next.superseded![current] = true;
        keyById.delete(current);
      }
    }
    delete next.superseded![id];
    next.sessionIds[key] = id;
    keyById.set(id, key);
    if (r.prescription_source === 'off_plan' || r.prescription_source === 'unknown') {
      next.sessionSources![key] = { source: r.prescription_source, programId: str(r.program_id) ?? null };
    } else {
      delete next.sessionSources![key];
    }
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
      const stopped = SESSION_REASONS.find((x) => x === r.outcome_reason);
      next.completedSessions.push({
        date: String(r.scheduled_for),
        sessionIndex: parseSessionKey(key).sessionIndex,
        variant: (r.variant as SessionVariant) ?? 'full',
        completedAt: String(r.completed_at ?? r.updated_at),
        ...(stopped ? { stopped } : {}),
      });
    }
    if (r.status !== 'completed' && (r.variant === 'short' || r.variant === 'light')) {
      next.sessionVariants![key] = r.variant;
    } else {
      delete next.sessionVariants![key];
    }
    if (r.difficulty != null) next.sessionDifficulty![key] = Number(r.difficulty);
    else delete next.sessionDifficulty![key];
    if (r.started_at != null) next.sessionOpened![key] = String(r.started_at);
    else delete next.sessionOpened![key];
    if (r.status === 'rescheduled' && r.rescheduled_to != null) {
      next.rescheduled![String(r.scheduled_for)] = String(r.rescheduled_to);
    }
  }
  // Sets by index; a row deleted elsewhere (a correction, W-3) removes its set. Compacted once at the
  // end, so the order the rows arrive in never shifts an index.
  const touched = new Map<string, (LoggedSet | undefined)[]>();
  for (const r of rows('exercise_logs')) {
    const key = keyById.get(String(r.session_id));
    if (!key) continue;
    const exerciseId = String(r.exercise_id);
    const ref = `${key}\u0000${exerciseId}`;
    const sets = touched.get(ref) ?? [...(next.setLogs[key]?.[exerciseId] ?? [])];
    touched.set(ref, sets);
    const index = Number(r.set_index);
    if (r.deleted_at != null) {
      if (index < sets.length) sets[index] = undefined;
      continue;
    }
    const seconds = num(r.seconds);
    sets[index] =
      seconds !== undefined && r.reps == null
        ? { reps: 0, seconds, loadKg: Number(r.load_kg ?? 0), rpe: num(r.rpe) }
        : { reps: Number(r.reps ?? 0), loadKg: Number(r.load_kg ?? 0), rpe: num(r.rpe) };
  }
  for (const [ref, sets] of touched) {
    const [key, exerciseId] = ref.split('\u0000');
    const kept = sets.filter((s): s is LoggedSet => s !== undefined);
    const { [exerciseId]: _old, ...others } = next.setLogs[key] ?? {};
    next.setLogs[key] = kept.length > 0 ? { ...others, [exerciseId]: kept } : others;
  }
  for (const r of rows('exercise_reports')) {
    const key = keyById.get(String(r.session_id));
    if (!key) continue;
    const exerciseId = String(r.exercise_id);
    const { [exerciseId]: _old, ...others } = next.exerciseReports![key] ?? {};
    if (r.deleted_at != null) {
      next.exerciseReports![key] = others;
      continue;
    }
    const reason = REPLACEMENT_REASONS.find((x) => x === r.not_performed_reason);
    const report: ExerciseReport = {};
    if (r.not_performed === true) report.notPerformed = true;
    if (r.not_performed === true && reason) report.notPerformedReason = reason;
    if (r.difficulty != null) report.difficulty = Number(r.difficulty);
    next.exerciseReports![key] = { ...others, [exerciseId]: report };
  }

  for (const r of rows('exercise_substitutions')) {
    const key = keyById.get(String(r.session_id));
    if (!key) continue;
    const from = String(r.from_exercise_id);
    if (r.deleted_at != null) {
      // Undone on another device (W-7.1); a pending local change is not in `rows` and wins.
      const { [from]: _swap, ...swaps } = next.exerciseSwaps![key] ?? {};
      const { [from]: _reason, ...reasons } = next.swapReasons![key] ?? {};
      next.exerciseSwaps![key] = swaps;
      next.swapReasons![key] = reasons;
      continue;
    }
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
        ...(str(r.proposal_id) ? { proposalId: str(r.proposal_id)! } : {}),
        ...(str(r.scope) ? { scope: r.scope as Adjustment['scope'] } : {}),
        ...(str(r.effective_to) ? { effectiveTo: str(r.effective_to)! } : {}),
        ...(num(r.session_count) ? { sessionCount: num(r.session_count)! } : {}),
        ...(num(r.revision) ? { revision: num(r.revision)! } : {}),
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
      if (toPush.has(rowRef(table, key))) continue;
      if (pending(table, key) && !adopted.has(rowRef(table, key)) && !forkedChild(table, r)) continue;
      const local = after[table].get(key);
      if (local) nextSynced[rowRef(table, key)] = hashRow(local);
      else delete nextSynced[rowRef(table, key)];
    }
  }
  // Last, so what reconciling changes (closing a version the server holds) stays to be pushed.
  reconcileVersions(next, lost, onServer, options.serverWins ?? false);
  return { state: next, synced: nextSynced, rejected };
}

/** A session row whose user already did something with it (opened, done, skipped, moved…). */
const USED_STATUSES = new Set(['in_progress', 'completed', 'skipped', 'replaced', 'rescheduled']);

/** First free local slot of a day for a session moved out of its own (indexes past any template). */
function freeSlot(state: SyncableState, date: IsoDate): SessionKey {
  let index = 6;
  while (state.sessionIds[sessionKey(date, index)]) index += 1;
  return sessionKey(date, index);
}

/** Moves a session and all its facts to another local slot of the same day; its row is unchanged. */
function moveSlot(state: SyncableState, from: SessionKey, to: SessionKey) {
  const move = <T>(map: Record<SessionKey, T> | undefined) => {
    if (!map || !(from in map)) return;
    map[to] = map[from];
    delete map[from];
  };
  move(state.sessionIds);
  move(state.setLogs);
  move(state.exerciseSwaps);
  move(state.swapReasons);
  move(state.sessionOutcomes);
  move(state.sessionVariants);
  move(state.sessionDifficulty);
  move(state.sessionOpened);
  move(state.sessionSources);
  move(state.exerciseReports);
  state.sessionSlots![to] = state.sessionSlots![from] ?? from;
  delete state.sessionSlots![from];
  const { date, sessionIndex } = parseSessionKey(to);
  state.completedSessions = state.completedSessions.map((c) =>
    sessionKey(c.date, c.sessionIndex) === from ? { ...c, date, sessionIndex } : c,
  );
}

/**
 * After a pull (D-032): the device keeps exactly one active version and drops what depended on a
 * version that lost, without ever dropping a fact.
 * - A version whose content lost (same id, other parameters on the server): its sessions the
 *   server does not hold and nobody started are dropped; the week is prescribed again from the
 *   server's version (`ensureWeek`).
 * - Several active versions: the highest version number wins (two changes beat one); on a tie, or
 *   when local data is attached to an existing account, the server's. A losing version only known
 *   here and with no started session is dropped (no duplicate on the server); otherwise it is
 *   closed (`superseded`), so the sessions done with it keep their real prescription.
 */
function reconcileVersions(
  next: SyncableState,
  lost: Set<string>,
  onServer: (table: SyncTable, id: string) => boolean,
  serverWins: boolean,
) {
  const started = (s: PrescribedSession) => {
    const key = sessionKey(s.date, s.sessionIndex);
    return next.sessionIds[key] === s.id && hasFacts(next, key);
  };
  const drop = (s: PrescribedSession) => {
    const key = sessionKey(s.date, s.sessionIndex);
    delete next.prescriptions![s.id];
    delete next.superseded![s.id];
    if (next.sessionIds[key] === s.id) delete next.sessionIds[key];
  };
  for (const s of Object.values(next.prescriptions!)) {
    if (lost.has(s.programId) && !onServer('workout_sessions', s.id) && !started(s)) drop(s);
  }
  const actives = next.programs!.filter((p) => p.source === 'engine' && p.status === 'active');
  if (actives.length < 2) return;
  const known = (p: ProgramVersion) => Number(onServer('training_programs', p.id));
  const [winner, ...losers] = [...actives].sort(
    (a, b) =>
      (serverWins ? known(b) - known(a) : 0) ||
      b.version - a.version ||
      known(b) - known(a) ||
      a.id.localeCompare(b.id),
  );
  for (const loser of losers) {
    const sessions = Object.values(next.prescriptions!).filter((s) => s.programId === loser.id);
    if (!known(loser) && !sessions.some((s) => started(s) || onServer('workout_sessions', s.id))) {
      next.programs = next.programs!.filter((p) => p.id !== loser.id);
      sessions.forEach(drop);
      continue;
    }
    const to = addDays(winner.effectiveFrom, -1);
    next.programs = next.programs!.map((p) =>
      p.id === loser.id
        ? deepFreeze({ ...p, status: 'superseded' as const, effectiveTo: to < p.effectiveFrom ? p.effectiveFrom : to })
        : p,
    );
  }
}
