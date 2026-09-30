import { SCENARIOS } from '../../scenarios';
import { buildSnapshot, emptyDraft, firstIncompleteStep, nextStepId, progressOf, visibleSteps, type OnboardingDraft } from '../steps';

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
