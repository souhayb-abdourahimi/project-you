import type { ActivityLevel, GoalType, Sex, UserContextSnapshot } from '../profile/schemas';
import type { Rationale } from '../shared/rationale';
import { addDays, daysBetween } from '../shared/dates';
import { roundTo } from '../shared/math';

/** Mifflin-St Jeor sex constant (kcal/day). `unspecified` uses the midpoint and lowers confidence. */
const SEX_CONSTANT: Record<Sex, number> = { male: 5, female: -161, unspecified: -78 };

/** Standard activity multipliers for daily life, excluding planned training. */
const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};
const MAX_ACTIVITY_FACTOR = 1.9;

/** Default energy adjustment per goal, as a fraction of maintenance. */
const GOAL_ADJUSTMENT: Record<GoalType, number> = {
  fat_loss: -0.15,
  weight_loss: -0.2,
  recomposition: -0.05,
  maintenance: 0,
  fitness: 0,
  performance: 0.05,
  muscle_gain: 0.1,
};

/** Protein per kg of reference body weight. */
const PROTEIN_PER_KG: Record<GoalType, number> = {
  fat_loss: 2.0,
  weight_loss: 1.8,
  recomposition: 2.0,
  muscle_gain: 1.8,
  performance: 1.8,
  fitness: 1.4,
  maintenance: 1.4,
};

const FAT_SHARE = 0.25;
const MIN_FAT_PER_KG = 0.6;

/** Absolute calorie floors below which we never go without medical supervision. */
const CALORIE_FLOOR: Record<Sex, number> = { female: 1200, male: 1500, unspecified: 1350 };

/** Energy content of one kg of body-weight change, a common approximation. */
export const KCAL_PER_KG = 7700;

export const ADULT_AGE = 18;
const UNDERWEIGHT_BMI = 18.5;
const HIGH_BMI = 30;
const REFERENCE_BMI = 25;

export type NutritionWarning =
  'minor_no_deficit' | 'underweight_no_deficit' | 'calorie_floor_applied' | 'sex_unspecified_estimate';

export interface NutritionTargets {
  bmr: number;
  maintenance: number;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** Applied adjustment vs maintenance, e.g. -0.15. */
  adjustment: number;
  /** Expected weekly body-weight change in kg if the plan is followed (estimate). */
  expectedWeeklyChangeKg: number;
  warnings: NutritionWarning[];
  rationale: Rationale;
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function mifflinStJeor(input: { weightKg: number; heightCm: number; age: number; sex: Sex }): number {
  return 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + SEX_CONSTANT[input.sex];
}

/** Adds planned training on top of daily-life activity, capped at a very active lifestyle. */
export function activityFactor(level: ActivityLevel, weeklyTrainingMinutes: number): number {
  let bonus = 0;
  if (weeklyTrainingMinutes >= 300) bonus = 0.2;
  else if (weeklyTrainingMinutes >= 180) bonus = 0.15;
  else if (weeklyTrainingMinutes >= 90) bonus = 0.075;
  return Math.min(MAX_ACTIVITY_FACTOR, ACTIVITY_FACTOR[level] + bonus);
}

export function computeNutritionTargets(snapshot: UserContextSnapshot, referenceYear: number): NutritionTargets {
  const { user, goal, training } = snapshot;
  const age = referenceYear - user.birthYear;
  const warnings: NutritionWarning[] = [];

  const bmr = mifflinStJeor({ weightKg: user.weightKg, heightCm: user.heightCm, age, sex: user.sex });
  const weeklyMinutes = training.sessionsPerWeek * training.sessionMinutes;
  const maintenance = bmr * activityFactor(user.activityLevel, weeklyMinutes);

  let adjustment = GOAL_ADJUSTMENT[goal.type];
  if (adjustment < 0 && age < ADULT_AGE) {
    adjustment = 0;
    warnings.push('minor_no_deficit');
  }
  const userBmi = bmi(user.weightKg, user.heightCm);
  if (adjustment < 0 && userBmi < UNDERWEIGHT_BMI) {
    adjustment = 0;
    warnings.push('underweight_no_deficit');
  }

  let calories = maintenance * (1 + adjustment);
  const floor = Math.max(bmr, CALORIE_FLOOR[user.sex]);
  if (adjustment < 0 && calories < floor) {
    calories = Math.min(floor, maintenance);
    warnings.push('calorie_floor_applied');
  }
  if (user.sex === 'unspecified') warnings.push('sex_unspecified_estimate');

  // With a high BMI, protein is based on the weight at BMI 25 to avoid excessive targets.
  const referenceWeight = userBmi >= HIGH_BMI ? REFERENCE_BMI * (user.heightCm / 100) ** 2 : user.weightKg;
  const proteinG = PROTEIN_PER_KG[goal.type] * referenceWeight;
  const fatG = Math.max(MIN_FAT_PER_KG * user.weightKg, (calories * FAT_SHARE) / 9);
  const carbsG = Math.max(0, (calories - proteinG * 4 - fatG * 9) / 4);

  const roundedCalories = roundTo(calories, 10);
  const appliedAdjustment = maintenance === 0 ? 0 : calories / maintenance - 1;

  return {
    bmr: Math.round(bmr),
    maintenance: roundTo(maintenance, 10),
    calories: roundedCalories,
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.round(carbsG),
    adjustment: Math.round(appliedAdjustment * 1000) / 1000,
    expectedWeeklyChangeKg: Math.round(((calories - maintenance) * 7 * 100) / KCAL_PER_KG) / 100,
    warnings,
    rationale: {
      goal: `goal.${goal.type}`,
      constraints: warnings.map((w) => `nutrition.warning.${w}`),
      dataUsed: ['data.age', 'data.height', 'data.weight', 'data.sex', 'data.activity', 'data.training_volume'],
      reason: 'nutrition.reason.targets',
      params: { adjustmentPct: Math.round(appliedAdjustment * 100) },
    },
  };
}

export type FeasibilityStatus = 'not_applicable' | 'ok' | 'aggressive' | 'unsafe_target' | 'inconsistent';

export interface GoalFeasibility {
  status: FeasibilityStatus;
  /** Weekly change needed to hit the target on time (kg, negative = loss). */
  requiredWeeklyChangeKg: number | null;
  /** Realistic weekly change used to propose an alternative date. */
  recommendedWeeklyChangeKg: number | null;
  suggestedTargetDate: string | null;
}

/** Recommended and maximum weekly change, as a fraction of body weight. */
const LOSS_RECOMMENDED = 0.005;
const LOSS_MAX = 0.01;
const GAIN_RECOMMENDED = 0.0025;
const GAIN_MAX = 0.005;

/**
 * Honest check of the user's target: never blocks the user, but flags aggressive or unsafe goals
 * and proposes a more reasonable timeline.
 */
export function assessGoalFeasibility(snapshot: UserContextSnapshot, today: string): GoalFeasibility {
  const { goal, user } = snapshot;
  const none: GoalFeasibility = {
    status: 'not_applicable',
    requiredWeeklyChangeKg: null,
    recommendedWeeklyChangeKg: null,
    suggestedTargetDate: null,
  };
  if (goal.targetWeightKg === undefined) return none;

  const delta = goal.targetWeightKg - user.weightKg;
  const isLoss = goal.type === 'fat_loss' || goal.type === 'weight_loss';
  const isGain = goal.type === 'muscle_gain';
  if (!isLoss && !isGain) return none;
  if ((isLoss && delta >= 0) || (isGain && delta <= 0)) return { ...none, status: 'inconsistent' };

  if (isLoss && bmi(goal.targetWeightKg, user.heightCm) < UNDERWEIGHT_BMI) {
    return { ...none, status: 'unsafe_target' };
  }

  const recommendedWeekly = user.weightKg * (isLoss ? LOSS_RECOMMENDED : GAIN_RECOMMENDED);
  const maxWeekly = user.weightKg * (isLoss ? LOSS_MAX : GAIN_MAX);
  const weeksNeeded = Math.abs(delta) / recommendedWeekly;
  const suggestedTargetDate = addDays(today, Math.ceil(weeksNeeded * 7));
  const recommendedWeeklyChangeKg = round2(isLoss ? -recommendedWeekly : recommendedWeekly);

  if (!goal.targetDate) {
    return { status: 'ok', requiredWeeklyChangeKg: null, recommendedWeeklyChangeKg, suggestedTargetDate };
  }

  const weeks = Math.max(1 / 7, Math.max(0, daysBetween(today, goal.targetDate)) / 7);
  const required = Math.abs(delta) / weeks;
  return {
    status: required > maxWeekly ? 'aggressive' : 'ok',
    requiredWeeklyChangeKg: round2(isLoss ? -required : required),
    recommendedWeeklyChangeKg,
    suggestedTargetDate,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
