/**
 * What a profile edit changes (W-8, D-043), computed before saving so the app never changes the
 * program, the meals or a decision silently. Pure: the caller saves the snapshot and the journal
 * rows this returns, nothing else.
 *
 * Rules (docs/SETTINGS_ARCHITECTURE.md §4):
 * - the past is never rewritten: done sessions keep their prescription, eaten meals stay, the
 *   journal keeps every decision;
 * - a frozen parameter of the program (goal, frequency, duration, level, equipment, excluded
 *   exercises) → a new program version from today (the existing `ensureProgram`); sessions not
 *   started from today are prescribed again from it;
 * - availability → sessions from today placed again (same version);
 * - diet, allergies, exclusions, meals, kitchen → the plan of the current week is regenerated
 *   from today, meals already marked keep their status (`carryOverEaten`);
 * - age, height, sex, activity, goal → targets recalculated (estimation) from today;
 * - a setting the user changes on purpose replaces an adaptation that set the same thing: the
 *   adaptation is ended by a `reverted` row (append-only), never rewritten;
 * - removing an allergy, changing the goal, or anything that publishes a new program version
 *   needs an explicit confirmation on the preview.
 */
import {
  appliedCalorieOffset,
  appliedDecisions,
  revertDecision,
  sessionsPerWeekDecision,
  type Adjustment,
} from '../journey/adjustments';
import { removedAllergies } from '../onboarding/steps';
import type { Allergen, UserContextSnapshot } from '../profile/schemas';
import type { IsoDate } from '../shared/dates';
import { programParams } from '../training/program';
import { durableTraining } from '../training/structure';

/** When a change takes effect. */
export type ChangeEffect =
  /** Shown and used right away, nothing is recalculated (name, motivation, tone, unit…). */
  | 'immediate'
  /** Calorie and macro targets recalculated from today (estimations). */
  | 'targets'
  /** Meal plan of the current week regenerated from today; marked meals kept. */
  | 'meals'
  /** Sessions from today placed again in the week (same program version). */
  | 'schedule'
  /** New program version from today; sessions not started are prescribed again. */
  | 'program';

export interface FieldChange {
  /** Setting id (docs/SETTINGS_ARCHITECTURE.md), e.g. `training.sessionsPerWeek`. */
  field: string;
  effects: ChangeEffect[];
}

export interface ProfileImpact {
  changes: FieldChange[];
  /** Union of the effects, in a stable order for the preview. */
  effects: ChangeEffect[];
  /** A new program version will be published from today. */
  newProgramVersion: boolean;
  /** Allergies the new profile drops: health-critical, never removed without a yes (D-023). */
  removedAllergies: Allergen[];
  /** Adaptations replaced by the new setting (frequency, calorie offset when the goal changes). */
  replaced: { decision: Adjustment; reason: 'frequency_setting' | 'goal_changed' }[];
  /** The preview must be confirmed explicitly before saving. */
  needsConfirmation: boolean;
}

const EFFECT_ORDER: ChangeEffect[] = ['program', 'schedule', 'meals', 'targets', 'immediate'];

/** Each editable field and what changing it does (one row per setting of the profile). */
export const FIELD_EFFECTS: Record<string, ChangeEffect[]> = {
  'user.displayName': ['immediate'],
  'user.birthYear': ['targets', 'meals'],
  'user.heightCm': ['targets', 'meals'],
  'user.sex': ['targets', 'meals'],
  'user.activityLevel': ['targets', 'meals'],
  'goal.type': ['targets', 'meals', 'program'],
  'goal.targetWeightKg': ['immediate'],
  'goal.targetDate': ['immediate'],
  'goal.priorities': ['immediate'],
  'motivation.why': ['immediate'],
  'motivation.change': ['immediate'],
  'motivation.feel': ['immediate'],
  'motivation.quitRisk': ['immediate'],
  'motivation.proudOf': ['immediate'],
  'lifestyle.lifeStatus': ['immediate'],
  'lifestyle.kitchen': ['meals'],
  'budget.weeklyFoodBudgetCents': ['immediate'],
  'nutrition.diet': ['meals'],
  'nutrition.allergies': ['meals'],
  'nutrition.intolerances': ['meals'],
  'nutrition.excludedFoods': ['meals'],
  'nutrition.dislikedFoods': ['meals'],
  'nutrition.likedFoods': ['meals'],
  'nutrition.mealsPerDay': ['meals'],
  'nutrition.cookingMinutes': ['meals'],
  // The program reads the frozen parameters below; `programParams` decides if a version changes.
  'training.sessionsPerWeek': ['schedule'],
  'training.sessionMinutes': ['schedule'],
  'training.level': [],
  'training.equipment': [],
  'training.hasGym': ['schedule'],
  'training.refusedExerciseIds': [],
  'training.gymName': ['immediate'],
  'training.hasMembership': ['immediate'],
  'training.gymTravelMinutes': ['schedule'],
  'training.likedSports': ['immediate'],
  'training.refusedSports': ['immediate'],
  'schedule.availability': ['schedule'],
  'schedule.fixedConstraints': ['schedule'],
  'preferences.motivationStyle': ['immediate'],
  'preferences.weightUnit': ['immediate'],
  'preferences.locale': ['immediate'],
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Fields whose value differs between two profiles (`createdAt` and `version` are not settings). */
export function changedFields(saved: UserContextSnapshot, next: UserContextSnapshot): string[] {
  const out: string[] = [];
  for (const field of Object.keys(FIELD_EFFECTS)) {
    const [section, key] = field.split('.') as [keyof UserContextSnapshot, string];
    const a = (saved[section] as Record<string, unknown> | undefined)?.[key];
    const b = (next[section] as Record<string, unknown> | undefined)?.[key];
    // Lists are sets for the user: the same allergies in another order is not a change.
    const norm = (v: unknown) => (Array.isArray(v) ? [...v].map((x) => JSON.stringify(x)).sort() : v);
    if (!same(norm(a), norm(b))) out.push(field);
  }
  return out;
}

/** The training the program reads: the profile plus the decisions in force (as `usePlan` does). */
function programTraining(snapshot: UserContextSnapshot, adjustments: readonly Adjustment[], frequency: number) {
  return durableTraining({ ...snapshot.training, sessionsPerWeek: frequency }, adjustments);
}

export function profileImpact(input: {
  saved: UserContextSnapshot;
  next: UserContextSnapshot;
  adjustments: readonly Adjustment[];
}): ProfileImpact {
  const { saved, next, adjustments } = input;
  const fields = changedFields(saved, next);
  const replaced: ProfileImpact['replaced'] = [];

  // The frequency the program uses now: an accepted adaptation, else the profile.
  const frequencyDecision = sessionsPerWeekDecision([...adjustments]);
  const frequencyChanged = fields.includes('training.sessionsPerWeek');
  if (frequencyDecision && frequencyChanged) replaced.push({ decision: frequencyDecision, reason: 'frequency_setting' });
  // A calorie offset accepted for the old goal does not carry over to a new goal.
  if (fields.includes('goal.type') && appliedCalorieOffset([...adjustments]) !== 0) {
    const offset = appliedDecisions(adjustments)
      .filter((a) => a.changeKey === 'calories_per_day')
      .at(-1);
    if (offset) replaced.push({ decision: offset, reason: 'goal_changed' });
  }

  const before = programParams(
    saved.goal.type,
    programTraining(saved, adjustments, frequencyDecision ? Number(frequencyDecision.to) : saved.training.sessionsPerWeek),
  );
  const keepDecision = frequencyDecision && !frequencyChanged;
  const after = programParams(
    next.goal.type,
    programTraining(next, adjustments, keepDecision ? Number(frequencyDecision.to) : next.training.sessionsPerWeek),
  );
  const newProgramVersion = !same(before, after);

  const changes: FieldChange[] = fields.map((field) => {
    const effects = new Set<ChangeEffect>(FIELD_EFFECTS[field]);
    if (newProgramVersion && isProgramField(field)) effects.add('program');
    // A program field that does not change the version (same parameters) changes nothing else.
    return { field, effects: effects.size > 0 ? [...effects] : ['immediate'] };
  });
  const effects = EFFECT_ORDER.filter((e) => changes.some((c) => c.effects.includes(e)));
  const removed = removedAllergies(saved, next);
  return {
    changes,
    effects,
    newProgramVersion,
    removedAllergies: removed,
    replaced,
    needsConfirmation:
      newProgramVersion || removed.length > 0 || replaced.length > 0 || fields.includes('goal.type'),
  };
}

const PROGRAM_FIELDS = [
  'goal.type',
  'training.sessionsPerWeek',
  'training.sessionMinutes',
  'training.level',
  'training.equipment',
  'training.hasGym',
  'training.refusedExerciseIds',
];
const isProgramField = (field: string) => PROGRAM_FIELDS.includes(field);

/**
 * The journal rows that end the adaptations a new setting replaces (append-only, D-037): a
 * `reverted` row on the same proposal, marked as coming from the settings. Pure: ids and time come
 * from the caller.
 */
export function replacementRows(
  impact: Pick<ProfileImpact, 'replaced'>,
  input: { ids: string[]; today: IsoDate; decidedAt: string },
): Adjustment[] {
  return impact.replaced.map(({ decision, reason }, i) => {
    const row = revertDecision(decision, { id: input.ids[i], today: input.today, decidedAt: input.decidedAt });
    return { ...row, evidence: { ...row.evidence, replacedBy: reason } };
  });
}

/**
 * The profile to save from an edited one: the account's start (`createdAt`) and the profile weight
 * (the basis before the first weigh-ins, edited through Progress, never from a form) are kept.
 */
export function editedSnapshot(saved: UserContextSnapshot, edited: UserContextSnapshot): UserContextSnapshot {
  return {
    ...edited,
    createdAt: saved.createdAt,
    user: { ...edited.user, weightKg: saved.user.weightKg },
    preferences: {
      ...edited.preferences,
      ...(saved.preferences.weightUnit && !edited.preferences.weightUnit
        ? { weightUnit: saved.preferences.weightUnit }
        : {}),
    },
  };
}
