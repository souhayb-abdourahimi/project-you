import { isUsableMealAnalysis, type MealAnalysisResult } from '../mealAnalysis';

const valid: MealAnalysisResult = {
  imageUri: 'file://meal.jpg',
  items: [{ id: 'chicken', name: 'Poulet', grams: 150, confidence: 0.9 }],
  nutrition: { kcal: 520, proteinG: 42, carbsG: 48, fatG: 16 },
  confidence: 0.86,
};

describe('isUsableMealAnalysis', () => {
  it('accepts a complete real analysis payload', () => {
    expect(isUsableMealAnalysis(valid)).toBe(true);
  });

  it('rejects missing items instead of inventing a meal', () => {
    expect(isUsableMealAnalysis({ ...valid, items: [] })).toBe(false);
  });

  it('rejects invalid nutrition totals instead of coercing them to zero', () => {
    expect(
      isUsableMealAnalysis({
        ...valid,
        nutrition: { ...valid.nutrition, kcal: Number.NaN },
      }),
    ).toBe(false);
  });

  it('accepts an unknown portion when the provider cannot estimate grams', () => {
    expect(
      isUsableMealAnalysis({
        ...valid,
        items: [{ id: 'chicken', name: 'Poulet', grams: null, confidence: null }],
      }),
    ).toBe(true);
  });
});
