export type MealAnalysisStatus = 'idle' | 'analyzing' | 'ready' | 'error';

export interface MealAnalysisItem {
  /** Stable provider/catalog identifier when one exists. */
  id: string;
  /** Human-readable name returned by the analysis layer. */
  name: string;
  /** Estimated amount. Null means the analyzer could not determine a portion. */
  grams: number | null;
  /** Provider confidence, 0..1. Null when the provider does not expose confidence. */
  confidence: number | null;
}

export interface MealAnalysisNutrition {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealAnalysisResult {
  imageUri: string;
  items: MealAnalysisItem[];
  nutrition: MealAnalysisNutrition;
  /** Optional overall confidence, 0..1. */
  confidence: number | null;
  /** Provider/model label for auditing. Not shown as a claim of medical precision. */
  source?: string;
}

/**
 * The UI must never fabricate an analysis result. Only complete provider output is accepted.
 * Invalid/missing totals stay unavailable instead of being silently converted to zero.
 */
export function isUsableMealAnalysis(result: MealAnalysisResult | null | undefined): result is MealAnalysisResult {
  if (!result || !result.imageUri || result.items.length === 0) return false;
  const n = result.nutrition;
  return [n.kcal, n.proteinG, n.carbsG, n.fatG].every((value) => Number.isFinite(value) && value >= 0);
}
