import { z } from 'zod';

/**
 * Project You is for adults (D-043, validated 2026-10-07): a birth year entered in the questionnaire
 * or in Réglages must give 18 or more. Before W-8 the minimum was 16: an account created then keeps
 * its unchanged birth year (`acceptedBirthYear`), and the protections of minors stay in the engines
 * (`noDeficitProfile`, `ADULT_AGE`, journey `noPush`). Age is computed from the birth year only.
 */
export const MIN_AGE = 18;
export const MAX_AGE = 100;

export const Sex = z.enum(['female', 'male', 'unspecified']);
export type Sex = z.infer<typeof Sex>;

export const ActivityLevel = z.enum(['sedentary', 'light', 'moderate', 'active']);
export type ActivityLevel = z.infer<typeof ActivityLevel>;

export const GoalType = z.enum([
  'fat_loss',
  'weight_loss',
  'muscle_gain',
  'recomposition',
  'maintenance',
  'fitness',
  'performance',
]);
export type GoalType = z.infer<typeof GoalType>;

/** Goals for which a target weight and a deadline make sense. */
export const WEIGHT_GOALS: readonly GoalType[] = ['fat_loss', 'weight_loss', 'muscle_gain'];

export const LifeStatus = z.enum(['student', 'employee', 'self_employed', 'unemployed', 'other']);
export type LifeStatus = z.infer<typeof LifeStatus>;

export const Diet = z.enum(['omnivore', 'vegetarian', 'vegan']);
export type Diet = z.infer<typeof Diet>;

/** The 14 allergens that EU regulation (INCO 1169/2011) requires to be declared. */
export const Allergen = z.enum([
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
]);
export type Allergen = z.infer<typeof Allergen>;

export const KitchenEquipment = z.enum(['stove', 'oven', 'microwave', 'freezer', 'blender']);
export type KitchenEquipment = z.infer<typeof KitchenEquipment>;

export const TrainingLevel = z.enum(['beginner', 'intermediate', 'advanced']);
export type TrainingLevel = z.infer<typeof TrainingLevel>;

export const Equipment = z.enum([
  'bodyweight',
  'dumbbells',
  'barbell',
  'bench',
  'rack',
  'cable',
  'machines',
  'kettlebell',
  'bands',
  'pullup_bar',
]);
export type Equipment = z.infer<typeof Equipment>;

/** Equipment assumed available in a standard commercial gym. */
export const GYM_EQUIPMENT: readonly Equipment[] = Equipment.options;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time');

export const TimeSlot = z
  .object({
    day: z.number().int().min(1).max(7),
    start: time,
    end: time,
  })
  .refine((slot) => slot.start < slot.end, { message: 'slot_order' });
export type TimeSlot = z.infer<typeof TimeSlot>;

export const LabeledSlot = TimeSlot.and(z.object({ label: z.string().max(60).optional() }));
export type LabeledSlot = z.infer<typeof LabeledSlot>;

const shortText = z.string().trim().max(500);
const foodList = z.array(z.string().trim().min(1).max(60)).max(50);

export const UserProfile = z.object({
  displayName: z.string().trim().min(1).max(40),
  birthYear: z.number().int(),
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(35).max(300),
  sex: Sex,
  activityLevel: ActivityLevel,
});
export type UserProfile = z.infer<typeof UserProfile>;

const priority = z.number().int().min(0).max(3);

export const GoalProfile = z.object({
  type: GoalType,
  targetWeightKg: z.number().min(35).max(300).optional(),
  targetDate: z.iso.date().optional(),
  priorities: z.object({
    aesthetics: priority,
    strength: priority,
    health: priority,
    performance: priority,
  }),
});
export type GoalProfile = z.infer<typeof GoalProfile>;

export const MotivationProfile = z.object({
  why: shortText.optional(),
  change: shortText.optional(),
  feel: shortText.optional(),
  quitRisk: shortText.optional(),
  proudOf: shortText.optional(),
});
export type MotivationProfile = z.infer<typeof MotivationProfile>;

export const NutritionProfile = z.object({
  diet: Diet,
  allergies: z.array(Allergen),
  intolerances: foodList,
  excludedFoods: foodList,
  dislikedFoods: foodList,
  likedFoods: foodList,
  mealsPerDay: z.number().int().min(2).max(5),
  cookingMinutes: z.number().int().min(0).max(180),
});
export type NutritionProfile = z.infer<typeof NutritionProfile>;

export const TrainingProfile = z.object({
  hasGym: z.boolean(),
  gymName: z.string().trim().max(80).optional(),
  hasMembership: z.boolean().optional(),
  /** One-way travel time to the gym as entered by the user (never estimated by us). */
  gymTravelMinutes: z.number().int().min(0).max(120).optional(),
  level: TrainingLevel,
  sessionsPerWeek: z.number().int().min(1).max(6),
  sessionMinutes: z.number().int().min(15).max(150),
  equipment: z.array(Equipment),
  likedSports: foodList,
  refusedSports: foodList,
  refusedExerciseIds: z.array(z.string()),
});
export type TrainingProfile = z.infer<typeof TrainingProfile>;

export const LifestyleProfile = z.object({
  lifeStatus: LifeStatus,
  kitchen: z.array(KitchenEquipment),
});
export type LifestyleProfile = z.infer<typeof LifestyleProfile>;

export const BudgetProfile = z.object({
  weeklyFoodBudgetCents: z.number().int().min(0).max(100_000),
  currency: z.literal('EUR'),
});
export type BudgetProfile = z.infer<typeof BudgetProfile>;

export const ScheduleProfile = z.object({
  availability: z.array(TimeSlot).max(50),
  fixedConstraints: z.array(LabeledSlot).max(50),
});
export type ScheduleProfile = z.infer<typeof ScheduleProfile>;

export const PreferencesProfile = z.object({
  /** Language of the account (informative: the screen language is a device setting, D-043). */
  locale: z.enum(['fr', 'en']),
  motivationStyle: z.enum(['gentle', 'direct']),
  /** How masses are shown and typed (W-8); stored values stay in kg. Absent = kg. */
  weightUnit: z.enum(['kg', 'lb']).optional(),
});
export type PreferencesProfile = z.infer<typeof PreferencesProfile>;

/** Everything the recommendation engines need, validated once. */
export const UserContextSnapshot = z.object({
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  user: UserProfile,
  goal: GoalProfile,
  motivation: MotivationProfile,
  nutrition: NutritionProfile,
  training: TrainingProfile,
  lifestyle: LifestyleProfile,
  budget: BudgetProfile,
  schedule: ScheduleProfile,
  preferences: PreferencesProfile,
});
export type UserContextSnapshot = z.infer<typeof UserContextSnapshot>;

/** The mass unit of a profile (kg when never chosen). */
export function weightUnitOf(snapshot: { preferences: { weightUnit?: 'kg' | 'lb' } } | null): 'kg' | 'lb' {
  return snapshot?.preferences.weightUnit ?? 'kg';
}

export function ageFromBirthYear(birthYear: number, referenceYear: number): number {
  return referenceYear - birthYear;
}
