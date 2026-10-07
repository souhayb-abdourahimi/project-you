/**
 * Privacy Center logic (docs/PRIVACY.md): what is stored, export, and deletion by category.
 * Pure: the service layer performs the network calls.
 */
import type { SyncableState, SyncTable } from '../sync/projection';
import type { WeeklyMealPlan } from '../meals/planner';

export type PrivacyCategory =
  'profile' | 'motivation' | 'weights' | 'measurements' | 'inventory' | 'expenses' | 'workouts' | 'meals' | 'journey';

/**
 * Server tables holding each category, children first. Profile deletion = account deletion.
 * Workouts include program versions and prescriptions (W-2, D-032), reconstructed history included:
 * erasing is not a rewrite, the immutability triggers do not block a user's deletion.
 */
export const CATEGORY_TABLES: Record<PrivacyCategory, SyncTable[]> = {
  profile: ['profiles', 'goals', 'user_preferences'],
  motivation: ['motivations'],
  weights: ['weight_logs'],
  measurements: ['body_measurements'],
  inventory: ['inventory_items'],
  expenses: ['food_expenses'],
  workouts: [
    'exercise_reports',
    'exercise_substitutions',
    'exercise_logs',
    'planned_exercises',
    'workout_sessions',
    'training_programs',
  ],
  meals: ['meal_plan_items'],
  // Day check-ins, weekly check-ins, milestones and adaptation decisions (D-028).
  journey: ['daily_checkins', 'weekly_checkins', 'journey_milestones', 'adjustments'],
};

/** Categories the user can delete one by one (the profile goes with the account). */
export const DELETABLE_CATEGORIES: PrivacyCategory[] = [
  'motivation',
  'weights',
  'measurements',
  'inventory',
  'expenses',
  'workouts',
  'meals',
  'journey',
];

/** Extra server tables included in the export (not synced by the app yet). */
export const EXPORT_ONLY_TABLES = [
  'weekly_reviews',
  'notification_preferences',
  'notification_settings',
  'notification_history',
  'integration_connections',
  'coach_memory',
  'progress_photos',
  'ai_conversations',
  'ai_messages',
  // Not written by the app yet, but they exist on the server.
  'recipes',
  'shopping_list_items',
  'workout_plans',
] as const;

export function countByCategory(state: PrivacyState): Record<PrivacyCategory, number> {
  const m = state.snapshot?.motivation;
  return {
    profile: state.snapshot ? 1 : 0,
    motivation: m ? Object.values(m).filter((v) => typeof v === 'string' && v.trim() !== '').length : 0,
    weights: state.weights.length,
    measurements: state.waist.length + (state.measurements?.length ?? 0),
    inventory: state.inventory.length,
    expenses: state.expenses.length,
    workouts:
      new Set([...Object.keys(state.sessionIds), ...Object.keys(state.sessionOutcomes ?? {})]).size ||
      state.completedSessions.length,
    meals: markedMeals(state),
    journey:
      (state.dayLogs?.length ?? 0) +
      (state.weeklyCheckins?.length ?? 0) +
      Object.keys(state.milestones ?? {}).length +
      (state.adjustments?.length ?? 0),
  };
}

/**
 * Local state the Privacy Center reads: what is synced, plus the previous week's meal plan kept on
 * this device for the weekly review (its marks are meal data too, W-7.1).
 */
export type PrivacyState = SyncableState & { previousMealPlan?: WeeklyMealPlan | null };

/**
 * Meals the user marked (eaten, skipped or replaced), in the current plan, in the previous week's
 * plan or kept in the journal (each meal once).
 */
function markedMeals(state: PrivacyState): number {
  const ids = new Set<string>();
  for (const plan of [state.mealPlan, state.previousMealPlan])
    for (const m of (plan?.days ?? []).flatMap((d) => d.meals)) if (m.status !== 'planned') ids.add(m.id);
  for (const m of state.mealLog ?? []) ids.add(m.id);
  return ids.size;
}

/** The plan kept, what was marked forgotten (status back to planned, no reason). */
function unmarked(plan: WeeklyMealPlan): WeeklyMealPlan {
  return {
    ...plan,
    days: plan.days.map((d) => ({
      ...d,
      meals: d.meals.map((m) => (m.status === 'planned' ? m : { ...m, status: 'planned' as const, reason: undefined })),
    })),
  };
}

/**
 * Local state with one category removed. Deleting meals keeps the plans (current and previous week)
 * but forgets what was marked.
 */
export function clearCategory<S extends PrivacyState>(state: S, category: PrivacyCategory): S {
  switch (category) {
    case 'profile':
      return { ...state, snapshot: null };
    case 'motivation':
      return state.snapshot ? { ...state, snapshot: { ...state.snapshot, motivation: {} } } : state;
    case 'weights':
      return { ...state, weights: [] };
    case 'measurements':
      return { ...state, waist: [], measurements: [] };
    case 'inventory':
      return { ...state, inventory: [] };
    case 'expenses':
      return { ...state, expenses: [] };
    case 'workouts':
      return {
        ...state,
        completedSessions: [],
        setLogs: {},
        sessionIds: {},
        sessionOutcomes: {},
        exerciseSwaps: {},
        swapReasons: {},
        programs: [],
        prescriptions: {},
        superseded: {},
        sessionSources: {},
        sessionVariants: {},
        sessionDifficulty: {},
        sessionOpened: {},
        sessionSlots: {},
        exerciseReports: {},
        rescheduled: {},
      };
    case 'meals':
      return {
        ...state,
        mealLog: [],
        mealPlan: state.mealPlan ? unmarked(state.mealPlan) : null,
        ...(state.previousMealPlan ? { previousMealPlan: unmarked(state.previousMealPlan) } : {}),
      };
    case 'journey':
      return { ...state, dayLogs: [], weeklyCheckins: [], milestones: {}, adjustments: [] };
  }
}

export interface DataExport {
  format: 'project-you-export';
  version: 1;
  generatedAt: string;
  appVersion: string;
  notice: string;
  /** What this device holds (may include changes not synced yet). */
  device: SyncableState;
  /** Settings kept only on this device (reminders, calendar link and the busy times it read). */
  deviceSettings: Record<string, unknown>;
  /** What the account holds on the server, per table; null in local mode or offline. */
  account: Record<string, unknown[]> | null;
  /** Tables that could not be read (the export says so instead of pretending they are empty). */
  unavailable: string[];
}

export function buildExport(input: {
  device: SyncableState;
  deviceSettings?: Record<string, unknown>;
  account: Record<string, unknown[]> | null;
  unavailable: string[];
  generatedAt: string;
  appVersion: string;
}): DataExport {
  return {
    format: 'project-you-export',
    version: 1,
    generatedAt: input.generatedAt,
    appVersion: input.appVersion,
    notice:
      'Export complet de tes données Project You. Les valeurs nutritionnelles des aliments de démonstration sont MOCK.',
    device: input.device,
    deviceSettings: input.deviceSettings ?? {},
    account: input.account,
    unavailable: input.unavailable,
  };
}
