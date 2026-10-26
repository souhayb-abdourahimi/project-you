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
  /**
   * Birth year of the saved profile when the draft edits it (D-043): kept as is, it stays accepted
   * even if it was entered under the former 16+ rule. Any other value must give 18 or more.
   */
  acceptedBirthYear?: number;
}

/** The answer groups of a draft (everything the questions edit). */
export type DraftSection = Exclude<keyof OnboardingDraft, 'acceptedBirthYear'>;

export type AgeCheck = 'ok' | 'missing' | 'too_young' | 'out_of_range';

/** The questionnaire's age rule (18+, D-043); see `acceptedBirthYear` for profiles created before. */
export function checkAge(draft: Pick<OnboardingDraft, 'user' | 'acceptedBirthYear'>, referenceYear: number): AgeCheck {
  const birthYear = draft.user.birthYear;
  if (birthYear === undefined) return 'missing';
  const age = referenceYear - birthYear;
  if (age > MAX_AGE) return 'out_of_range';
  if (age >= MIN_AGE || (birthYear === draft.acceptedBirthYear && age >= 0)) return 'ok';
  return age < 0 ? 'out_of_range' : 'too_young';
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
  'profile' | 'goal' | 'motivation' | 'budget' | 'kitchen' | 'diet' | 'training' | 'schedule' | 'review';

export type OnboardingStepId =
  | 'profile.name'
  | 'profile.age'
  | 'profile.body'
  | 'profile.sex'
  | 'profile.activity'
  | 'goal.type'
  | 'goal.target'
  | 'motivation.reasons'
  | 'motivation.more'
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
  /**
   * `single`: one answer among a few, nothing else on the screen, nothing to check: touching an
   * answer moves on (W-11). `multi`, `form` and `summary` always wait for "Continuer".
   */
  answer: 'single' | 'multi' | 'form' | 'summary';
  /** Asked only in Réglages (older free-text answers stay editable, D-046). */
  settingsOnly?: boolean;
}

const always = () => true;
const optional = () => true;
const isWeightGoal = (d: OnboardingDraft) => d.goal.type !== undefined && WEIGHT_GOALS.includes(d.goal.type);

/** Same bounds as the profile schema: an out-of-range value is said on the step, not at the end. */
export const HEIGHT_RANGE = { min: 120, max: 230 } as const;
export const WEIGHT_RANGE = { min: 35, max: 300 } as const;
const inRange = (v: number | undefined, r: { min: number; max: number }) => v !== undefined && v >= r.min && v <= r.max;

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'profile.name',
    section: 'profile',
    answer: 'form',
    isVisible: always,
    isComplete: (d) => !!d.user.displayName?.trim(),
  },
  {
    id: 'profile.age',
    section: 'profile',
    answer: 'form',
    isVisible: always,
    isComplete: (d, year) => checkAge(d, year) === 'ok',
  },
  {
    id: 'profile.body',
    section: 'profile',
    answer: 'form',
    isVisible: always,
    isComplete: (d) => inRange(d.user.heightCm, HEIGHT_RANGE) && inRange(d.user.weightKg, WEIGHT_RANGE),
  },
  // Not automatic: the hint (why it is asked, "prefer not to say") must be readable first.
  {
    id: 'profile.sex',
    section: 'profile',
    answer: 'form',
    isVisible: always,
    isComplete: (d) => d.user.sex !== undefined,
  },
  {
    id: 'profile.activity',
    section: 'profile',
    answer: 'single',
    isVisible: always,
    isComplete: (d) => d.user.activityLevel !== undefined,
  },
  {
    id: 'goal.type',
    section: 'goal',
    answer: 'single',
    isVisible: always,
    isComplete: (d) => d.goal.type !== undefined,
  },
  { id: 'goal.target', section: 'goal', answer: 'form', isVisible: isWeightGoal, isComplete: optional },
  { id: 'motivation.reasons', section: 'motivation', answer: 'multi', isVisible: always, isComplete: optional },
  {
    id: 'motivation.more',
    section: 'motivation',
    answer: 'form',
    settingsOnly: true,
    isVisible: always,
    isComplete: optional,
  },
  {
    id: 'budget.food',
    section: 'budget',
    answer: 'form',
    isVisible: always,
    isComplete: (d) => d.budget.weeklyFoodBudgetCents !== undefined,
  },
  { id: 'kitchen.equipment', section: 'kitchen', answer: 'multi', isVisible: always, isComplete: optional },
  {
    id: 'diet.type',
    section: 'diet',
    answer: 'single',
    isVisible: always,
    isComplete: (d) => d.nutrition.diet !== undefined,
  },
  { id: 'diet.allergies', section: 'diet', answer: 'multi', isVisible: always, isComplete: optional },
  { id: 'diet.foods', section: 'diet', answer: 'form', isVisible: always, isComplete: optional },
  {
    id: 'diet.meals',
    section: 'diet',
    answer: 'form',
    isVisible: always,
    isComplete: (d) => d.nutrition.mealsPerDay !== undefined && d.nutrition.cookingMinutes !== undefined,
  },
  {
    id: 'training.gym',
    section: 'training',
    answer: 'single',
    isVisible: always,
    isComplete: (d) => d.training.hasGym !== undefined,
  },
  {
    id: 'training.gymDetails',
    section: 'training',
    answer: 'form',
    isVisible: (d) => d.training.hasGym === true,
    isComplete: optional,
  },
  {
    id: 'training.homeEquipment',
    section: 'training',
    answer: 'multi',
    isVisible: (d) => d.training.hasGym === false,
    isComplete: optional,
  },
  {
    id: 'training.level',
    section: 'training',
    answer: 'single',
    isVisible: always,
    isComplete: (d) => d.training.level !== undefined,
  },
  {
    id: 'training.frequency',
    section: 'training',
    answer: 'form',
    isVisible: always,
    isComplete: (d) => d.training.sessionsPerWeek !== undefined && d.training.sessionMinutes !== undefined,
  },
  {
    // Beginners get a simpler flow; fine-grained exercise control is for experienced users.
    id: 'training.refusedExercises',
    section: 'training',
    answer: 'multi',
    isVisible: (d) => d.training.level !== undefined && d.training.level !== 'beginner',
    isComplete: optional,
  },
  { id: 'schedule.availability', section: 'schedule', answer: 'form', isVisible: always, isComplete: optional },
  { id: 'review', section: 'review', answer: 'summary', isVisible: always, isComplete: optional },
];

/**
 * Touching an answer moves on: only for a simple single choice, in the questionnaire (never in
 * Réglages, where a form is saved explicitly).
 */
export function autoAdvances(id: OnboardingStepId): boolean {
  return getStep(id).answer === 'single';
}

/** Why "Continuer" cannot be pressed yet, said under the button (never a silent disabled button). */
export type BlockedReason = 'choose' | 'name' | 'age' | 'body' | 'budget' | 'meals' | 'frequency' | 'sex';

export function blockedReason(
  draft: OnboardingDraft,
  id: OnboardingStepId,
  referenceYear: number,
): BlockedReason | null {
  const step = getStep(id);
  if (step.isComplete(draft, referenceYear)) return null;
  switch (id) {
    case 'profile.name':
      return 'name';
    case 'profile.age':
      return 'age';
    case 'profile.body':
      return 'body';
    case 'profile.sex':
      return 'sex';
    case 'budget.food':
      return 'budget';
    case 'diet.meals':
      return 'meals';
    case 'training.frequency':
      return 'frequency';
    default:
      return 'choose';
  }
}

/**
 * The label of "Continuer" on an optional step left empty: it says what the empty answer means
 * ("Aucune allergie"), so nobody has to invent an answer to go on.
 */
export function emptyAnswerLabel(draft: OnboardingDraft, id: OnboardingStepId): string | null {
  switch (id) {
    case 'goal.target':
      return draft.goal.targetWeightKg === undefined && draft.goal.targetDate === undefined ? 'noTarget' : null;
    case 'motivation.reasons':
      return (draft.motivation.reasons ?? []).length === 0 && !draft.motivation.why?.trim() ? 'skip' : null;
    case 'kitchen.equipment':
      return (draft.lifestyle.kitchen ?? []).length === 0 ? 'noKitchen' : null;
    case 'diet.allergies':
      return (draft.nutrition.allergies ?? []).length === 0 && (draft.nutrition.intolerances ?? []).length === 0
        ? 'noAllergy'
        : null;
    case 'diet.foods':
      return [draft.nutrition.excludedFoods, draft.nutrition.dislikedFoods, draft.nutrition.likedFoods].every(
        (l) => (l ?? []).length === 0,
      )
        ? 'nothingToAdd'
        : null;
    case 'training.homeEquipment':
      return (draft.training.equipment ?? []).filter((e) => e !== 'bodyweight').length === 0 ? 'noEquipment' : null;
    case 'training.refusedExercises':
      return (draft.training.refusedExerciseIds ?? []).length === 0 ? 'noRefused' : null;
    case 'training.gymDetails':
      return !draft.training.gymName?.trim() && draft.training.gymTravelMinutes === undefined ? 'skip' : null;
    case 'schedule.availability':
      return (draft.schedule.availability ?? []).length === 0 && (draft.schedule.fixedConstraints ?? []).length === 0
        ? 'later'
        : null;
    default:
      return null;
  }
}

export function visibleSteps(draft: OnboardingDraft): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => !step.settingsOnly && step.isVisible(draft));
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
  const age = checkAge(draft, now.getFullYear());
  if (age === 'too_young' || age === 'out_of_range') {
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

/**
 * Draft prefilled from the saved profile, for "Refaire le questionnaire" (review B2, D-023):
 * the questionnaire never starts blank or from another device's stale draft, so an allergy the
 * user did not touch cannot disappear.
 */
export function draftFromSnapshot(snapshot: UserContextSnapshot): OnboardingDraft {
  return {
    acceptedBirthYear: snapshot.user.birthYear,
    user: { ...snapshot.user },
    goal: { ...snapshot.goal, priorities: { ...snapshot.goal.priorities } },
    motivation: { ...snapshot.motivation },
    nutrition: {
      ...snapshot.nutrition,
      allergies: [...snapshot.nutrition.allergies],
      intolerances: [...snapshot.nutrition.intolerances],
      excludedFoods: [...snapshot.nutrition.excludedFoods],
      dislikedFoods: [...snapshot.nutrition.dislikedFoods],
      likedFoods: [...snapshot.nutrition.likedFoods],
    },
    training: {
      ...snapshot.training,
      equipment: [...snapshot.training.equipment],
      likedSports: [...snapshot.training.likedSports],
      refusedSports: [...snapshot.training.refusedSports],
      refusedExerciseIds: [...snapshot.training.refusedExerciseIds],
    },
    lifestyle: { ...snapshot.lifestyle, kitchen: [...snapshot.lifestyle.kitchen] },
    budget: { ...snapshot.budget },
    schedule: {
      availability: snapshot.schedule.availability.map((s) => ({ ...s })),
      fixedConstraints: snapshot.schedule.fixedConstraints.map((s) => ({ ...s })),
    },
    preferences: { ...snapshot.preferences },
  };
}

/** Allergies of the saved profile that the new answers no longer contain: they need an explicit confirmation. */
export function removedAllergies(
  saved: UserContextSnapshot | null,
  next: Pick<UserContextSnapshot, 'nutrition'>,
): UserContextSnapshot['nutrition']['allergies'] {
  if (!saved) return [];
  return saved.nutrition.allergies.filter((a) => !next.nutrition.allergies.includes(a));
}

/** Deadlines offered for a target weight, in months; a date is never typed by hand (W-11). */
export const TARGET_HORIZONS = [3, 6, 12] as const;

/** The same day `months` later (the last day of the month when it does not exist, 31 → 30). */
export function targetDateIn(months: number, today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Weekly food budgets offered as one touch; 0 = no precise budget (spending is then not compared). */
export const BUDGET_PRESETS_CENTS = [0, 3000, 5000, 8000, 12000] as const;

/** Where a validation issue of the summary is fixed: the step to reopen, named by its title. */
export function stepOfIssue(issue: string): OnboardingStepId {
  const path = issue.split(':')[0];
  const rules: [RegExp, OnboardingStepId][] = [
    [/^user\.displayName/, 'profile.name'],
    [/^user\.birthYear/, 'profile.age'],
    [/^user\.(heightCm|weightKg)/, 'profile.body'],
    [/^user\.sex/, 'profile.sex'],
    [/^user\.activityLevel/, 'profile.activity'],
    [/^goal\.type/, 'goal.type'],
    [/^goal\./, 'goal.target'],
    [/^motivation\./, 'motivation.reasons'],
    [/^budget\./, 'budget.food'],
    [/^lifestyle\./, 'kitchen.equipment'],
    [/^nutrition\.diet/, 'diet.type'],
    [/^nutrition\.(allergies|intolerances)/, 'diet.allergies'],
    [/^nutrition\.(mealsPerDay|cookingMinutes)/, 'diet.meals'],
    [/^nutrition\./, 'diet.foods'],
    [/^training\.level/, 'training.level'],
    [/^training\.(sessionsPerWeek|sessionMinutes)/, 'training.frequency'],
    [/^training\.(gymName|gymTravelMinutes)/, 'training.gymDetails'],
    [/^training\.equipment/, 'training.homeEquipment'],
    [/^training\.refusedExerciseIds/, 'training.refusedExercises'],
    [/^training\./, 'training.gym'],
    [/^schedule\./, 'schedule.availability'],
  ];
  return rules.find(([re]) => re.test(path))?.[1] ?? 'profile.name';
}
