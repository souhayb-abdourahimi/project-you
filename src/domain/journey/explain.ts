/**
 * Structured "Pourquoi ?" answers (docs/DAILY_COACH.md §11): a text key, its parameters and the
 * data used. Deterministic. The screen shows them now; a future AI layer may only rephrase these
 * objects (docs/AI_ARCHITECTURE.md): it never reads the raw history and decides nothing.
 */
import type { PlannedExercise, ProgramVersion, TrainingPurpose } from '../training/program';
import { byInstant, type Adjustment } from './adjustments';
import type { DailyItem, DailyPlan } from './daily-plan';

export interface Explanation {
  key: string;
  params: Record<string, string | number>;
  /** Kinds of data the answer relies on (`data.*` keys, shown as "Basé sur …"). */
  dataUsed: string[];
}

/** Which recorded data each daily reason relies on. */
export const DATA_BY_REASON: Record<string, string[]> = {
  'workout.planned': ['data.schedule', 'data.training_profile'],
  'workout.done': ['data.sessions'],
  'workout.short_day': ['data.day_mode', 'data.schedule'],
  'workout.short_slot': ['data.schedule', 'data.availability'],
  'workout.light': ['data.checkin', 'data.sessions'],
  'workout.light_week': ['data.adjustment'],
  'workout.difficult': ['data.day_mode', 'data.checkin'],
  'workout.comeback': ['data.last_activity'],
  'workout.low_motivation': ['data.day_mode'],
  'recovery.difficult': ['data.day_mode', 'data.checkin'],
  'activity.replaced': ['data.session_outcome'],
  'activity.difficult': ['data.day_mode', 'data.checkin'],
  'activity.comeback': ['data.last_activity'],
  'recovery.skipped': ['data.session_outcome'],
  'recovery.rest_day': ['data.schedule'],
  'recovery.safety': ['data.safety'],
  'meal.planned': ['data.meal_plan', 'data.targets'],
  'meal.full_target': ['data.meals_logged', 'data.targets', 'data.safety'],
  'checkin.low_logging': ['data.meals_logged'],
  'checkin.weekly': ['data.weekly_checkin'],
  'weigh_in.day': ['data.weights', 'data.notification_preferences'],
  safety: ['data.safety'],
};

/** Why this item is in today's plan. */
export function explainItem(item: DailyItem): Explanation {
  return {
    key: `explain.${item.reason}`,
    params: item.params,
    dataUsed: DATA_BY_REASON[item.reason] ?? [],
  };
}

/** Why today looks different from the usual plan (each adaptation of the day). */
export function explainDay(plan: DailyPlan): Explanation[] {
  return plan.adaptations.map((a) => ({
    key: a.key,
    params: a.params,
    dataUsed: plan.mode === 'normal' ? ['data.checkin'] : ['data.day_mode'],
  }));
}

/** "Pourquoi mon plan a changé ?": the latest decision, from the `adjustments` journal. */
export function explainPlanChange(adjustments: Adjustment[]): Explanation | null {
  const latest = adjustments
    .filter((a) => a.status === 'applied' || a.status === 'reverted')
    .sort(byInstant)
    .at(-1);
  return latest ? explainDecision(latest) : null;
}

/** W-5 structural changes: their own sentence (the reason's numbers are not stored with them). */
const STRUCTURAL_EXPLAINED = ['restart', 'reduce_volume', 'easier_variant', 'exercise_change', 'cycle_review'];

/** Why a decision of the journal was proposed, whatever the answer (history, W-6). */
export function explainDecision(d: Adjustment): Explanation {
  return {
    key: STRUCTURAL_EXPLAINED.includes(d.changeKey) ? `adaptation.explain.${d.changeKey}` : d.reasonKey,
    params: {
      ...d.evidence,
      ...(d.from !== null ? { from: d.from } : {}),
      ...(d.to !== null ? { to: d.to } : {}),
      status: d.status,
      effectiveFrom: d.effectiveFrom,
    },
    dataUsed: Object.keys(d.evidence).map((k) => `data.evidence.${k}`),
  };
}

/**
 * "J'ai raté ma séance, que faire ?": never a catch-up. Today's plan already holds the answer
 * (next session, a short version, or rest); missing one session changes nothing to the programme.
 */
export function explainMissedSession(plan: DailyPlan): Explanation {
  const next = plan.items.find((i) => i.kind === 'workout' && i.status === 'todo');
  return next
    ? { key: 'explain.missed.today', params: next.params, dataUsed: ['data.schedule'] }
    : { key: 'explain.missed.next', params: {}, dataUsed: ['data.schedule'] };
}

/**
 * "Pourquoi cet exercice ?" (W-6): the purpose stored on the prescribed row (W-1), never a
 * generated text. A replacement keeps the purpose of the slot it fills.
 */
export function explainExercise(
  row: { purpose: TrainingPurpose | null; purposeTarget: string | null } | null,
): Explanation | null {
  if (!row?.purpose) return null;
  return {
    key: `workout.why.${row.purpose}`,
    params: row.purposeTarget ? { target: row.purposeTarget } : {},
    dataUsed: ['data.goal', 'data.training_profile'],
  };
}

/** "Pourquoi cette charge ?": the decision stored with the prescription, and how sure it is. */
export interface LoadExplanation extends Explanation {
  action: NonNullable<PlannedExercise['progressionAction']>;
  confidence: PlannedExercise['progressionConfidence'];
}

/**
 * The progression decision frozen in the prescription (W-4, D-035): action, reason with the
 * numbers of its evidence, confidence. Read, never recomputed: the past session that produced it
 * is not replayed. Null for a replacement (a load proposed for one movement says nothing about
 * another one) and for rows prescribed without a decision.
 */
export function explainLoad(
  row: Pick<PlannedExercise, 'progressionAction' | 'progressionReason' | 'progressionParams' | 'progressionConfidence'>,
  replaced = false,
): LoadExplanation | null {
  if (replaced || !row.progressionAction || !row.progressionReason) return null;
  return {
    key: `reasons.${row.progressionReason}`,
    params: row.progressionParams ?? {},
    dataUsed: ['data.sessions'],
    action: row.progressionAction,
    confidence: row.progressionConfidence,
  };
}

/** Why a program version exists: its stored reason, and the accepted decision behind it if any. */
export function explainVersion(
  program: Pick<ProgramVersion, 'reasonKey' | 'version' | 'effectiveFrom' | 'adjustmentId'>,
): Explanation {
  return {
    key: program.reasonKey,
    params: { version: program.version, from: program.effectiveFrom },
    dataUsed: program.adjustmentId ? ['data.adjustment'] : ['data.training_profile'],
  };
}
