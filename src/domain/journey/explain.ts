/**
 * Structured "Pourquoi ?" answers (docs/DAILY_COACH.md §11): a text key, its parameters and the
 * data used. Deterministic. The screen shows them now; a future AI layer may only rephrase these
 * objects (docs/AI_ARCHITECTURE.md): it never reads the raw history and decides nothing.
 */
import type { Adjustment } from './adjustments';
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
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
    .at(-1);
  if (!latest) return null;
  // W-5 structural changes: their own sentence (the reason's numbers are not stored with them).
  const structural = ['restart', 'reduce_volume', 'easier_variant', 'exercise_change', 'cycle_review'];
  return {
    key: structural.includes(latest.changeKey) ? `adaptation.explain.${latest.changeKey}` : latest.reasonKey,
    params: {
      ...latest.evidence,
      ...(latest.from !== null ? { from: latest.from } : {}),
      ...(latest.to !== null ? { to: latest.to } : {}),
      status: latest.status,
      effectiveFrom: latest.effectiveFrom,
    },
    dataUsed: Object.keys(latest.evidence).map((k) => `data.evidence.${k}`),
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
