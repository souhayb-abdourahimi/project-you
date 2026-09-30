import { SCENARIOS, scenario } from '../../scenarios';
import { activityFactor, assessGoalFeasibility, computeNutritionTargets, mifflinStJeor } from '../engine';

const YEAR = 2026;

describe('mifflinStJeor', () => {
  it('matches the published equation', () => {
    // 10*75 + 6.25*178 - 5*22 + 5 = 1757.5
    expect(mifflinStJeor({ weightKg: 75, heightCm: 178, age: 22, sex: 'male' })).toBeCloseTo(1757.5);
    // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
    expect(mifflinStJeor({ weightKg: 60, heightCm: 165, age: 30, sex: 'female' })).toBeCloseTo(1320.25);
  });
});

describe('activityFactor', () => {
  it('adds planned training and caps at 1.9', () => {
    expect(activityFactor('sedentary', 0)).toBe(1.2);
    expect(activityFactor('light', 180)).toBeCloseTo(1.525);
    expect(activityFactor('active', 600)).toBe(1.9);
  });
});

describe('computeNutritionTargets', () => {
  it('applies a moderate deficit for fat loss and high protein', () => {
    const t = computeNutritionTargets(SCENARIOS.fatLoss, YEAR);
    expect(t.adjustment).toBeCloseTo(-0.15, 2);
    expect(t.calories).toBeLessThan(t.maintenance);
    expect(t.proteinG).toBeGreaterThan(120);
    expect(t.expectedWeeklyChangeKg).toBeLessThan(0);
  });

  it('adds a surplus for muscle gain', () => {
    const t = computeNutritionTargets(SCENARIOS.muscleGain, YEAR);
    expect(t.calories).toBeGreaterThan(t.maintenance);
  });

  it('macros add up to the calorie target (±2 %)', () => {
    for (const s of Object.values(SCENARIOS)) {
      const t = computeNutritionTargets(s, YEAR);
      const kcal = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
      expect(Math.abs(kcal - t.calories) / t.calories).toBeLessThan(0.02);
    }
  });

  it('never goes below BMR or the absolute floor', () => {
    const tiny = scenario({
      user: { weightKg: 50, heightCm: 155, sex: 'female', birthYear: 1990, activityLevel: 'sedentary' },
      goal: { type: 'weight_loss' },
      training: { sessionsPerWeek: 1, sessionMinutes: 20 },
    });
    const t = computeNutritionTargets(tiny, YEAR);
    expect(t.calories).toBeGreaterThanOrEqual(1200);
    expect(t.calories).toBeGreaterThanOrEqual(t.bmr - 5);
    expect(t.warnings).toContain('calorie_floor_applied');
  });

  it('never applies a deficit to minors', () => {
    const minor = scenario({ user: { birthYear: 2009 }, goal: { type: 'fat_loss' } });
    const t = computeNutritionTargets(minor, YEAR);
    expect(t.adjustment).toBe(0);
    expect(t.warnings).toContain('minor_no_deficit');
  });

  it('never applies a deficit when underweight', () => {
    const under = scenario({ user: { weightKg: 52, heightCm: 180 }, goal: { type: 'weight_loss' } });
    const t = computeNutritionTargets(under, YEAR);
    expect(t.adjustment).toBe(0);
    expect(t.warnings).toContain('underweight_no_deficit');
  });

  it('caps protein for high BMI using a reference weight', () => {
    const high = scenario({ user: { weightKg: 140, heightCm: 175 }, goal: { type: 'fat_loss' } });
    const t = computeNutritionTargets(high, YEAR);
    // Reference weight at BMI 25 = 76.6 kg → 2.0 g/kg ≈ 153 g, not 280 g.
    expect(t.proteinG).toBeLessThan(160);
  });

  it('flags the lower-confidence estimate when sex is not given', () => {
    const t = computeNutritionTargets(scenario({ user: { sex: 'unspecified' } }), YEAR);
    expect(t.warnings).toContain('sex_unspecified_estimate');
  });
});

describe('assessGoalFeasibility', () => {
  const today = '2026-09-30';

  it('flags an aggressive loss and suggests a later date', () => {
    const s = scenario({ user: { weightKg: 90 }, goal: { type: 'fat_loss', targetWeightKg: 75, targetDate: '2026-11-15' } });
    const f = assessGoalFeasibility(s, today);
    expect(f.status).toBe('aggressive');
    expect(f.suggestedTargetDate! > '2026-11-15').toBe(true);
    expect(f.recommendedWeeklyChangeKg).toBeCloseTo(-0.45);
  });

  it('accepts a reasonable loss', () => {
    const s = scenario({ user: { weightKg: 90 }, goal: { type: 'fat_loss', targetWeightKg: 85, targetDate: '2027-02-28' } });
    expect(assessGoalFeasibility(s, today).status).toBe('ok');
  });

  it('refuses to endorse an underweight target', () => {
    const s = scenario({ user: { weightKg: 60, heightCm: 175 }, goal: { type: 'weight_loss', targetWeightKg: 52 } });
    expect(assessGoalFeasibility(s, today).status).toBe('unsafe_target');
  });

  it('detects inconsistent targets', () => {
    const s = scenario({ goal: { type: 'muscle_gain', targetWeightKg: 70 } });
    expect(assessGoalFeasibility(s, today).status).toBe('inconsistent');
  });

  it('is not applicable without a target weight', () => {
    expect(assessGoalFeasibility(SCENARIOS.recomposition, today).status).toBe('not_applicable');
  });
});
