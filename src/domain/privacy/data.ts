/**
 * Privacy Center logic (docs/PRIVACY.md): what is stored, export, and deletion by category.
 * Pure: the service layer performs the network calls.
 */
import type { SyncableState, SyncTable } from '../sync/projection';

export type PrivacyCategory =
  'profile' | 'motivation' | 'weights' | 'measurements' | 'inventory' | 'expenses' | 'workouts' | 'meals';

/** Server tables holding each category. Profile deletion = account deletion. */
export const CATEGORY_TABLES: Record<PrivacyCategory, SyncTable[]> = {
  profile: ['profiles', 'goals', 'user_preferences'],
  motivation: ['motivations'],
  weights: ['weight_logs'],
  measurements: ['body_measurements'],
  inventory: ['inventory_items'],
  expenses: ['food_expenses'],
  workouts: ['exercise_logs', 'workout_sessions'],
  meals: ['meal_plan_items'],
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
];

/** Extra server tables included in the export (not synced by the app yet). */
export const EXPORT_ONLY_TABLES = [
  'daily_checkins',
  'weekly_reviews',
  'notification_preferences',
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

export function countByCategory(state: SyncableState): Record<PrivacyCategory, number> {
  const m = state.snapshot?.motivation;
  return {
    profile: state.snapshot ? 1 : 0,
    motivation: m ? Object.values(m).filter((v) => typeof v === 'string' && v.trim() !== '').length : 0,
    weights: state.weights.length,
    measurements: state.waist.length,
    inventory: state.inventory.length,
    expenses: state.expenses.length,
    workouts: Object.keys(state.sessionIds).length || state.completedSessions.length,
    meals: state.mealPlan?.days.flatMap((d) => d.meals).filter((m) => m.status === 'eaten').length ?? 0,
  };
}

/** Local state with one category removed. Deleting meals keeps the plan but forgets what was eaten. */
export function clearCategory(state: SyncableState, category: PrivacyCategory): SyncableState {
  switch (category) {
    case 'profile':
      return { ...state, snapshot: null };
    case 'motivation':
      return state.snapshot ? { ...state, snapshot: { ...state.snapshot, motivation: {} } } : state;
    case 'weights':
      return { ...state, weights: [] };
    case 'measurements':
      return { ...state, waist: [] };
    case 'inventory':
      return { ...state, inventory: [] };
    case 'expenses':
      return { ...state, expenses: [] };
    case 'workouts':
      return { ...state, completedSessions: [], setLogs: {}, sessionIds: {} };
    case 'meals':
      return state.mealPlan
        ? {
            ...state,
            mealPlan: {
              ...state.mealPlan,
              days: state.mealPlan.days.map((d) => ({
                ...d,
                meals: d.meals.map((m) => (m.status === 'eaten' ? { ...m, status: 'planned' as const } : m)),
              })),
            },
          }
        : state;
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
