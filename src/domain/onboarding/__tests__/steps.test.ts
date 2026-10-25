import type { UserContextSnapshot } from '../../profile/schemas';
import { SCENARIOS } from '../../scenarios';
import {
  ONBOARDING_STEPS,
  autoAdvances,
  blockedReason,
  buildSnapshot,
  checkAge,
  emptyAnswerLabel,
  stepOfIssue,
  targetDateIn,
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

  it('18+ (D-043): a 17-year-old cannot continue, 18 can (birth year only)', () => {
    const now = new Date('2026-09-30T10:00:00Z');
    const d = completeDraft();
    for (const [birthYear, check] of [
      [2012, 'too_young'],
      [2010, 'too_young'],
      [2009, 'too_young'],
      [2008, 'ok'],
      [1926, 'ok'],
      [1925, 'out_of_range'],
      [2030, 'out_of_range'],
    ] as const) {
      d.user = { ...d.user, birthYear };
      expect([birthYear, checkAge(d, 2026)]).toEqual([birthYear, check]);
      expect(firstIncompleteStep(d, 2026) === 'profile.age').toBe(check !== 'ok');
      expect(buildSnapshot(d, now).ok).toBe(check === 'ok');
    }
    expect(checkAge(emptyDraft(), 2026)).toBe('missing');
  });

  it('an account created under the former 16+ rule keeps its birth year, never a new minor one', () => {
    const now = new Date('2026-09-30T10:00:00Z');
    const legacy = draftFromSnapshot({
      ...SCENARIOS.studentMediumBudget,
      user: { ...SCENARIOS.studentMediumBudget.user, birthYear: 2009 },
    });
    expect(legacy.acceptedBirthYear).toBe(2009);
    // Unchanged: still editable (name, goal…), so nobody is locked out of their own profile.
    expect(checkAge(legacy, 2026)).toBe('ok');
    expect(buildSnapshot(legacy, now).ok).toBe(true);
    // Any other under-18 year is refused, even on that account.
    legacy.user = { ...legacy.user, birthYear: 2010 };
    expect(checkAge(legacy, 2026)).toBe('too_young');
    expect(buildSnapshot(legacy, now).ok).toBe(false);
    // A fresh questionnaire has no accepted year.
    expect(emptyDraft().acceptedBirthYear).toBeUndefined();
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

describe('onboarding friction rules (D-046)', () => {
  it('only one-answer questions move on by themselves; never a multi-select, a form, the sex or the summary', () => {
    const auto = ONBOARDING_STEPS.filter((s) => autoAdvances(s.id)).map((s) => s.id);
    expect(auto).toEqual(['profile.activity', 'goal.type', 'diet.type', 'training.gym', 'training.level']);
    for (const id of ['profile.sex', 'motivation.reasons', 'diet.allergies', 'review'] as const)
      expect(autoAdvances(id)).toBe(false);
  });

  it('the removed questions are no longer asked; the old free-text answers stay in Réglages', () => {
    const asked = ids(completeDraft());
    for (const gone of ['goal.priorities', 'life.status', 'training.sports', 'motivation.why'])
      expect(asked).not.toContain(gone);
    expect(asked).toContain('motivation.reasons');
    expect(asked).not.toContain('motivation.more');
    expect(ONBOARDING_STEPS.map((s) => s.id)).toContain('motivation.more');
  });

  it('a blocked Continue always says why', () => {
    const d = emptyDraft();
    expect(blockedReason(d, 'profile.name', 2026)).toBe('name');
    expect(blockedReason(d, 'profile.body', 2026)).toBe('body');
    expect(blockedReason(d, 'goal.type', 2026)).toBe('choose');
    expect(blockedReason(d, 'budget.food', 2026)).toBe('budget');
    expect(blockedReason(completeDraft(), 'budget.food', 2026)).toBeNull();
    // Optional steps are never blocked.
    expect(blockedReason(d, 'diet.allergies', 2026)).toBeNull();
  });

  it('out-of-range body values block the step (never saved as typed)', () => {
    const body = (heightCm: number, weightKg: number) => ({ ...emptyDraft(), user: { heightCm, weightKg } });
    expect(blockedReason(body(170, 70), 'profile.body', 2026)).toBeNull();
    expect(blockedReason(body(17, 70), 'profile.body', 2026)).toBe('body');
    expect(blockedReason(body(170, 700), 'profile.body', 2026)).toBe('body');
  });

  it('an empty optional answer is named on the button, a filled one is not', () => {
    const d = emptyDraft();
    expect(emptyAnswerLabel(d, 'diet.allergies')).toBe('noAllergy');
    expect(emptyAnswerLabel(d, 'motivation.reasons')).toBe('skip');
    expect(emptyAnswerLabel({ ...d, motivation: { reasons: ['health'] } }, 'motivation.reasons')).toBeNull();
    expect(emptyAnswerLabel({ ...d, nutrition: { allergies: ['soy'] } }, 'diet.allergies')).toBeNull();
    expect(emptyAnswerLabel(d, 'goal.type')).toBeNull();
  });

  it('target date in months: same day, clamped to the end of a shorter month, across years', () => {
    expect(targetDateIn(3, '2026-09-30')).toBe('2026-12-30');
    expect(targetDateIn(6, '2026-08-31')).toBe('2027-02-28');
    expect(targetDateIn(12, '2028-02-29')).toBe('2029-02-28');
  });

  it('a summary issue reopens the step where it is fixed', () => {
    expect(stepOfIssue('user.heightCm: too small')).toBe('profile.body');
    expect(stepOfIssue('nutrition.allergies.0: invalid')).toBe('diet.allergies');
    expect(stepOfIssue('motivation.reasons: duplicate')).toBe('motivation.reasons');
    expect(stepOfIssue('training.sessionsPerWeek: too big')).toBe('training.frequency');
  });
});

describe('goal and motivations (D-046)', () => {
  const withReasons = (reasons: OnboardingDraft['motivation']['reasons']) => ({
    ...completeDraft(),
    motivation: { ...completeDraft().motivation, reasons },
  });

  it.each([[[]], [['health']], [['weight', 'energy', 'habits']]])('%j motivations: one goal, saved as given', (r) => {
    const built = buildSnapshot(withReasons(r as never), new Date('2026-09-30T10:00:00Z'));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.snapshot.motivation.reasons).toEqual(r);
    expect(built.snapshot.goal.type).toBe(completeDraft().goal.type);
  });

  it('a duplicate or unknown reason is refused, never silently kept', () => {
    expect(buildSnapshot(withReasons(['health', 'health']), new Date()).ok).toBe(false);
    expect(buildSnapshot(withReasons(['magic' as never]), new Date()).ok).toBe(false);
  });

  it('motivations never change the targets: same snapshot otherwise', () => {
    const none = buildSnapshot(withReasons([]), new Date('2026-09-30T10:00:00Z'));
    const many = buildSnapshot(withReasons(['weight', 'performance', 'event']), new Date('2026-09-30T10:00:00Z'));
    if (!none.ok || !many.ok) throw new Error('invalid');
    const { motivation: _a, ...restNone } = none.snapshot;
    const { motivation: _b, ...restMany } = many.snapshot;
    expect(restMany).toEqual(restNone);
  });

  it('a profile without reasons (saved before D-046) is still valid and rebuilt unchanged', () => {
    const legacy = { ...SCENARIOS.studentMediumBudget, motivation: { why: 'Pour moi' } } as UserContextSnapshot;
    const rebuilt = buildSnapshot(draftFromSnapshot(legacy), new Date('2026-09-30T10:00:00Z'));
    expect(rebuilt.ok).toBe(true);
    if (rebuilt.ok) expect(rebuilt.snapshot.motivation.reasons).toBeUndefined();
  });
});
