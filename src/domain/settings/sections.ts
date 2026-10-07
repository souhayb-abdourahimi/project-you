/**
 * Where every onboarding answer lives afterwards (W-8, D-043): each question of the questionnaire
 * belongs to exactly one section of Réglages, edited with the same fields. Nothing asked once is
 * hidden for ever (docs/SETTINGS_ARCHITECTURE.md §3, matrix tested in __tests__/sections.test.ts).
 */
import type { OnboardingStepId } from '../onboarding/steps';

export const SETTINGS_SECTIONS = ['profile', 'goal', 'motivation', 'training', 'schedule', 'nutrition'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Questions of each section, in the questionnaire's order (a short form per screen). */
export const SECTION_STEPS: Record<SettingsSection, readonly OnboardingStepId[]> = {
  profile: ['profile.name', 'profile.age', 'profile.body', 'profile.sex', 'profile.activity', 'life.status'],
  goal: ['goal.type', 'goal.target', 'goal.priorities'],
  motivation: ['motivation.why', 'motivation.more'],
  training: [
    'training.gym',
    'training.gymDetails',
    'training.homeEquipment',
    'training.level',
    'training.frequency',
    'training.refusedExercises',
    'training.sports',
  ],
  schedule: ['schedule.availability'],
  nutrition: ['diet.type', 'diet.allergies', 'diet.foods', 'diet.meals', 'kitchen.equipment', 'budget.food'],
};

/** The onboarding steps that are not a setting (the summary only). */
export const NOT_A_SETTING: readonly OnboardingStepId[] = ['review'];

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/** The section that edits an onboarding answer. */
export function sectionOf(step: OnboardingStepId): SettingsSection | null {
  return SETTINGS_SECTIONS.find((s) => SECTION_STEPS[s].includes(step)) ?? null;
}
