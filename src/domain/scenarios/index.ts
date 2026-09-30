/**
 * MOCK user scenarios for tests, the dev screen and demos. Fictional people, never real data.
 */
import { GYM_EQUIPMENT, type UserContextSnapshot } from '../profile/schemas';

export const MOCK_SCENARIO_LABEL = 'MOCK';

const base: UserContextSnapshot = {
  version: 1,
  createdAt: '2026-09-30T08:00:00.000Z',
  user: {
    displayName: 'Alex (MOCK)',
    birthYear: 2004,
    heightCm: 178,
    weightKg: 75,
    sex: 'male',
    activityLevel: 'light',
  },
  goal: { type: 'maintenance', priorities: { aesthetics: 1, strength: 1, health: 2, performance: 1 } },
  motivation: { why: 'être fier de moi' },
  nutrition: {
    diet: 'omnivore',
    allergies: [],
    intolerances: [],
    excludedFoods: [],
    dislikedFoods: [],
    likedFoods: [],
    mealsPerDay: 3,
    cookingMinutes: 30,
  },
  training: {
    hasGym: true,
    gymName: 'Salle MOCK',
    hasMembership: true,
    gymTravelMinutes: 10,
    level: 'intermediate',
    sessionsPerWeek: 3,
    sessionMinutes: 60,
    equipment: [...GYM_EQUIPMENT],
    likedSports: [],
    refusedSports: [],
    refusedExerciseIds: [],
  },
  lifestyle: { lifeStatus: 'student', kitchen: ['stove', 'microwave', 'freezer'] },
  budget: { weeklyFoodBudgetCents: 4500, currency: 'EUR' },
  schedule: {
    availability: [
      { day: 1, start: '17:00', end: '20:00' },
      { day: 3, start: '14:00', end: '19:00' },
      { day: 5, start: '17:00', end: '20:00' },
      { day: 6, start: '09:00', end: '18:00' },
    ],
    fixedConstraints: [],
  },
  preferences: { locale: 'fr', motivationStyle: 'gentle' },
};

type DeepPartialSnapshot = { [K in keyof UserContextSnapshot]?: Partial<UserContextSnapshot[K]> };

export function scenario(overrides: DeepPartialSnapshot = {}): UserContextSnapshot {
  const result = structuredClone(base) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key];
    result[key] =
      current && typeof current === 'object' && !Array.isArray(current) ? { ...current, ...(value as object) } : value;
  }
  return result as unknown as UserContextSnapshot;
}

export const SCENARIOS = {
  studentLowBudget: scenario({
    budget: { weeklyFoodBudgetCents: 2500 },
    lifestyle: { lifeStatus: 'student', kitchen: ['microwave'] },
  }),
  studentMediumBudget: scenario({ budget: { weeklyFoodBudgetCents: 4500 } }),
  muscleGain: scenario({ goal: { type: 'muscle_gain', targetWeightKg: 80, targetDate: '2027-06-30' } }),
  fatLoss: scenario({
    user: { weightKg: 92, sex: 'female', heightCm: 168, displayName: 'Sam (MOCK)', birthYear: 1994 },
    goal: { type: 'fat_loss', targetWeightKg: 80, targetDate: '2027-06-30' },
  }),
  recomposition: scenario({ goal: { type: 'recomposition' } }),
  beginner: scenario({ training: { level: 'beginner', sessionsPerWeek: 2, sessionMinutes: 45 } }),
  advanced: scenario({ training: { level: 'advanced', sessionsPerWeek: 5, sessionMinutes: 75 } }),
  noGym: scenario({
    training: {
      hasGym: false,
      gymName: undefined,
      hasMembership: undefined,
      gymTravelMinutes: undefined,
      equipment: ['bodyweight', 'dumbbells', 'bands'],
    },
  }),
  vegan: scenario({ nutrition: { diet: 'vegan', allergies: ['peanuts'] } }),
  busySchedule: scenario({
    schedule: {
      availability: [
        { day: 1, start: '07:00', end: '22:00' },
        { day: 2, start: '07:00', end: '22:00' },
        { day: 3, start: '07:00', end: '22:00' },
        { day: 4, start: '07:00', end: '22:00' },
        { day: 5, start: '07:00', end: '22:00' },
      ],
      // Classes 8h–16h and work 18h–21h on weekdays, free Wednesday afternoon.
      fixedConstraints: [1, 2, 3, 4, 5].flatMap((day) => [
        ...(day === 3
          ? [{ day, start: '08:00', end: '12:00', label: 'cours' }]
          : [{ day, start: '08:00', end: '16:00', label: 'cours' }]),
        ...(day === 3 ? [] : [{ day, start: '18:00', end: '21:00', label: 'travail' }]),
      ]),
    },
  }),
} satisfies Record<string, UserContextSnapshot>;
