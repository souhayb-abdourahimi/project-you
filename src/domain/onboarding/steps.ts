import {
  GYM_EQUIPMENT,
  MAX_AGE,
  MIN_AGE,
  UserContextSnapshot,
  WEIGHT_GOALS,
  type BudgetProfile,
  type GoalProfile,
  type LifestyleProfile,
  type MotivationProfile,
  type NutritionProfile,
  type PreferencesProfile,
  type ScheduleProfile,
  type TrainingProfile,
  type UserProfile,
} from '../profile/schemas';

export interface OnboardingDraft {
  user: Partial<UserProfile>;
  goal: Partial<GoalProfile>;
  motivation: MotivationProfile;
  nutrition: Partial<NutritionProfile>;
  training: Partial<TrainingProfile>;
  lifestyle: Partial<LifestyleProfile>;
  budget: Partial<BudgetProfile>;
  schedule: Partial<ScheduleProfile>;
  preferences: Partial<PreferencesProfile>;
}

export function emptyDraft(): OnboardingDraft {
  return {
    user: {},
    goal: {},
    motivation: {},
    nutrition: {},
    training: {},
    lifestyle: {},
    budget: {},
    schedule: {},
    preferences: {},
  };
}

export type OnboardingSection =
  'profile' | 'goal' | 'motivation' | 'life' | 'budget' | 'kitchen' | 'diet' | 'training' | 'schedule' | 'review';

export type OnboardingStepId =
  | 'profile.name'
  | 'profile.age'
  | 'profile.body'
  | 'profile.sex'
  | 'profile.activity'
  | 'goal.type'
  | 'goal.target'
  | 'goal.priorities'
  | 'motivation.why'
  | 'motivation.more'
  | 'life.status'
  | 'budget.food'
  | 'kitchen.equipment'
  | 'diet.type'
  | 'diet.allergies'
  | 'diet.foods'
  | 'diet.meals'
  | 'training.gym'
  | 'training.gymDetails'
  | 'training.homeEquipment'
  | 'training.level'
  | 'training.frequency'
  | 'training.sports'
  | 'training.refusedExercises'
  | 'schedule.availability'
  | 'review';

export interface OnboardingStep {
  id: OnboardingStepId;
  section: OnboardingSection;
  /** Adaptive onboarding: a step is only asked when relevant to earlier answers. */
  isVisible: (draft: OnboardingDraft) => boolean;
  /** Whether the answers required by this step are present (optional steps are always complete). */
  isComplete: (draft: OnboardingDraft, referenceYear: number) => boolean;
}

const always = () => true;
const optional = () => true;
const isWeightGoal = (d: OnboardingDraft) => d.goal.type !== undefined && WEIGHT_GOALS.includes(d.goal.type);

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: 'profile.name', section: 'profile', isVisible: always, isComplete: (d) => !!d.user.displayName?.trim() },
  {
    id: 'profile.age',
    section: 'profile',
    isVisible: always,
    isComplete: (d, year) => {
      if (d.user.birthYear === undefined) return false;
      const age = year - d.user.birthYear;
      return age >= MIN_AGE && age <= MAX_AGE;
    },
  },
  {
    id: 'profile.body',
    section: 'profile',
    isVisible: always,
    isComplete: (d) => d.user.heightCm !== undefined && d.user.weightKg !== undefined,
  },
  { id: 'profile.sex', section: 'profile', isVisible: always, isComplete: (d) => d.user.sex !== undefined },
  {
    id: 'profile.activity',
    section: 'profile',
    isVisible: always,
    isComplete: (d) => d.user.activityLevel !== undefined,
  },
  { id: 'goal.type', section: 'goal', isVisible: always, isComplete: (d) => d.goal.type !== undefined },
  { id: 'goal.target', section: 'goal', isVisible: isWeightGoal, isComplete: optional },
  { id: 'goal.priorities', section: 'goal', isVisible: always, isComplete: optional },
  { id: 'motivation.why', section: 'motivation', isVisible: always, isComplete: optional },
  { id: 'motivation.more', section: 'motivation', isVisible: always, isComplete: optional },
  { id: 'life.status', section: 'life', isVisible: always, isComplete: (d) => d.lifestyle.lifeStatus !== undefined },
  {
    id: 'budget.food',
    section: 'budget',
    isVisible: always,
    isComplete: (d) => d.budget.weeklyFoodBudgetCents !== undefined,
  },
  { id: 'kitchen.equipment', section: 'kitchen', isVisible: always, isComplete: optional },
  { id: 'diet.type', section: 'diet', isVisible: always, isComplete: (d) => d.nutrition.diet !== undefined },
  { id: 'diet.allergies', section: 'diet', isVisible: always, isComplete: optional },
  { id: 'diet.foods', section: 'diet', isVisible: always, isComplete: optional },
  {
    id: 'diet.meals',
    section: 'diet',
    isVisible: always,
    isComplete: (d) => d.nutrition.mealsPerDay !== undefined && d.nutrition.cookingMinutes !== undefined,
  },
  { id: 'training.gym', section: 'training', isVisible: always, isComplete: (d) => d.training.hasGym !== undefined },
  {
    id: 'training.gymDetails',
    section: 'training',
    isVisible: (d) => d.training.hasGym === true,
    isComplete: optional,
  },
  {
    id: 'training.homeEquipment',
    section: 'training',
    isVisible: (d) => d.training.hasGym === false,
    isComplete: optional,
  },
  { id: 'training.level', section: 'training', isVisible: always, isComplete: (d) => d.training.level !== undefined },
  {
    id: 'training.frequency',
    section: 'training',
    isVisible: always,
    isComplete: (d) => d.training.sessionsPerWeek !== undefined && d.training.sessionMinutes !== undefined,
  },
  { id: 'training.sports', section: 'training', isVisible: always, isComplete: optional },
  {
    // Beginners get a simpler flow; fine-grained exercise control is for experienced users.
    id: 'training.refusedExercises',
    section: 'training',
    isVisible: (d) => d.training.level !== undefined && d.training.level !== 'beginner',
    isComplete: optional,
  },
  { id: 'schedule.availability', section: 'schedule', isVisible: always, isComplete: optional },
  { id: 'review', section: 'review', isVisible: always, isComplete: optional },
];

export function visibleSteps(draft: OnboardingDraft): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => step.isVisible(draft));
}

export function getStep(id: OnboardingStepId): OnboardingStep {
  const step = ONBOARDING_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown onboarding step ${id}`);
  return step;
}

export function nextStepId(draft: OnboardingDraft, current: OnboardingStepId): OnboardingStepId | null {
  const steps = visibleSteps(draft);
  const index = steps.findIndex((s) => s.id === current);
  return index >= 0 && index < steps.length - 1 ? steps[index + 1].id : null;
}

export function previousStepId(draft: OnboardingDraft, current: OnboardingStepId): OnboardingStepId | null {
  const steps = visibleSteps(draft);
  const index = steps.findIndex((s) => s.id === current);
  return index > 0 ? steps[index - 1].id : null;
}

/** Progress in [0, 1] for the progress bar. */
export function progressOf(draft: OnboardingDraft, current: OnboardingStepId): number {
  const steps = visibleSteps(draft);
  const index = steps.findIndex((s) => s.id === current);
  return steps.length <= 1 ? 1 : Math.max(0, index) / (steps.length - 1);
}

export function firstIncompleteStep(draft: OnboardingDraft, referenceYear: number): OnboardingStepId | null {
  return visibleSteps(draft).find((s) => !s.isComplete(draft, referenceYear))?.id ?? null;
}

/**
 * Builds the validated snapshot, filling optional lists with sensible defaults.
 * Details asked only in hidden steps are dropped (e.g. gym details when the user has no gym).
 */
export type SnapshotResult = { ok: true; snapshot: UserContextSnapshot } | { ok: false; issues: string[] };

export function buildSnapshot(draft: OnboardingDraft, now: Date): SnapshotResult {
  const age = draft.user.birthYear === undefined ? undefined : now.getFullYear() - draft.user.birthYear;
  if (age !== undefined && (age < MIN_AGE || age > MAX_AGE)) {
    return { ok: false, issues: ['user.birthYear: age_out_of_range'] };
  }
  const hasGym = draft.training.hasGym ?? false;
  const weightGoal = isWeightGoal(draft);
  const parsed = UserContextSnapshot.safeParse({
    version: 1,
    createdAt: now.toISOString(),
    user: draft.user,
    goal: {
      type: draft.goal.type,
      targetWeightKg: weightGoal ? draft.goal.targetWeightKg : undefined,
      targetDate: weightGoal ? draft.goal.targetDate : undefined,
      priorities: draft.goal.priorities ?? { aesthetics: 1, strength: 1, health: 1, performance: 1 },
    },
    motivation: draft.motivation,
    nutrition: {
      allergies: [],
      intolerances: [],
      excludedFoods: [],
      dislikedFoods: [],
      likedFoods: [],
      ...draft.nutrition,
    },
    training: {
      likedSports: [],
      refusedSports: [],
      refusedExerciseIds: [],
      ...draft.training,
      hasGym,
      gymName: hasGym ? draft.training.gymName : undefined,
      hasMembership: hasGym ? draft.training.hasMembership : undefined,
      gymTravelMinutes: hasGym ? draft.training.gymTravelMinutes : undefined,
      equipment: hasGym ? [...GYM_EQUIPMENT] : withBodyweight(draft.training.equipment ?? []),
    },
    lifestyle: { kitchen: [], ...draft.lifestyle },
    budget: { currency: 'EUR', ...draft.budget },
    schedule: { availability: [], fixedConstraints: [], ...draft.schedule },
    preferences: { locale: 'fr', motivationStyle: 'gentle', ...draft.preferences },
  });
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  return { ok: true, snapshot: parsed.data };
}

function withBodyweight<T extends string>(equipment: T[]): (T | 'bodyweight')[] {
  return equipment.includes('bodyweight' as T) ? equipment : ['bodyweight', ...equipment];
}
