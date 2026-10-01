import type { UserContextSnapshot } from '../../profile/schemas';
import { SCENARIOS } from '../../scenarios';
import {
  buildSnapshot,
  draftFromSnapshot,
  emptyDraft,
  firstIncompleteStep,
  nextStepId,
  progressOf,
  removedAllergies,
  visibleSteps,
  type OnboardingDraft,
} from '../steps';

const ids = (d: OnboardingDraft) => visibleSteps(d).map((s) => s.id);

function completeDraft(): OnboardingDraft {
  const s = SCENARIOS.studentMediumBudget;
  return {
    user: s.user,
    goal: s.goal,
    motivation: s.motivation,
    nutrition: s.nutrition,
    training: s.training,
    lifestyle: s.lifestyle,
    budget: s.budget,
    schedule: s.schedule,
    preferences: s.preferences,
  };
}

describe('adaptive onboarding', () => {
  it('skips gym details when the user has no gym, and home equipment when they do', () => {
    const noGym = { ...emptyDraft(), training: { hasGym: false } };
    expect(ids(noGym)).toContain('training.homeEquipment');
    expect(ids(noGym)).not.toContain('training.gymDetails');

    const gym = { ...emptyDraft(), training: { hasGym: true } };
    expect(ids(gym)).toContain('training.gymDetails');
    expect(ids(gym)).not.toContain('training.homeEquipment');
  });

  it('asks target weight only for weight goals', () => {
    expect(ids({ ...emptyDraft(), goal: { type: 'fat_loss' } })).toContain('goal.target');
    expect(ids({ ...emptyDraft(), goal: { type: 'recomposition' } })).not.toContain('goal.target');
  });

  it('hides fine-grained exercise control from beginners', () => {
    expect(ids({ ...emptyDraft(), training: { level: 'beginner' } })).not.toContain('training.refusedExercises');
    expect(ids({ ...emptyDraft(), training: { level: 'advanced' } })).toContain('training.refusedExercises');
  });

  it('navigates and reports progress', () => {
    const d = emptyDraft();
    expect(nextStepId(d, 'profile.name')).toBe('profile.age');
    expect(progressOf(d, 'profile.name')).toBe(0);
    expect(progressOf(d, 'review')).toBe(1);
  });

  it('finds the first unanswered step', () => {
    expect(firstIncompleteStep(emptyDraft(), 2026)).toBe('profile.name');
    expect(firstIncompleteStep(completeDraft(), 2026)).toBeNull();
  });

  it('rejects ages below 16', () => {
    const d = completeDraft();
    d.user = { ...d.user, birthYear: 2012 };
    expect(firstIncompleteStep(d, 2026)).toBe('profile.age');
    expect(buildSnapshot(d, new Date('2026-09-30T10:00:00Z')).ok).toBe(false);
  });

  it('builds a valid snapshot and drops answers from hidden steps', () => {
    const d = completeDraft();
    d.training = { ...d.training, hasGym: false, gymName: 'Old gym', equipment: ['dumbbells'] };
    d.goal = { ...d.goal, type: 'recomposition', targetWeightKg: 70 };
    const result = buildSnapshot(d, new Date('2026-09-30T10:00:00Z'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.training.gymName).toBeUndefined();
    expect(result.snapshot.training.equipment).toEqual(['bodyweight', 'dumbbells']);
    expect(result.snapshot.goal.targetWeightKg).toBeUndefined();
  });
});

describe('editing preferences (review B2)', () => {
  const now = new Date('2026-09-30T08:00:00.000Z');
  const withoutDate = (s: UserContextSnapshot) => ({ ...s, createdAt: '' });

  it('prefills every answer from the saved profile: finishing unchanged gives the same profile', () => {
    for (const s of Object.values(SCENARIOS)) {
      const result = buildSnapshot(draftFromSnapshot(s), now);
      expect(result.ok).toBe(true);
      if (result.ok) expect(withoutDate(result.snapshot)).toEqual(withoutDate(s));
    }
  });

  it('keeps allergies, intolerances, exclusions and diet in the prefilled draft', () => {
    const draft = draftFromSnapshot(SCENARIOS.freeTextExclusions);
    expect(draft.nutrition).toMatchObject({
      diet: 'omnivore',
      intolerances: ['soja', 'lactose'],
      excludedFoods: ['Poissons', 'oeufs'],
    });
    expect(draftFromSnapshot(SCENARIOS.veganSoyAllergy).nutrition).toMatchObject({ diet: 'vegan', allergies: ['soy'] });
  });

  it('does not share arrays with the saved profile', () => {
    const s = SCENARIOS.multipleAllergies;
    draftFromSnapshot(s).nutrition.allergies!.pop();
    expect(s.nutrition.allergies).toHaveLength(4);
  });

  it('lists the saved allergies that the new answers drop', () => {
    const saved = SCENARIOS.multipleAllergies;
    const next = { nutrition: { ...saved.nutrition, allergies: ['milk', 'nuts'] as typeof saved.nutrition.allergies } };
    expect(removedAllergies(saved, next)).toEqual(['gluten', 'fish']);
    expect(removedAllergies(saved, saved)).toEqual([]);
    expect(removedAllergies(null, next)).toEqual([]);
    expect(removedAllergies(SCENARIOS.fatLoss, saved)).toEqual([]);
  });
});
