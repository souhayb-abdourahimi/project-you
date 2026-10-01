import { FOOD_CATALOG, type Food } from '@/domain/meals/catalog';
import { ciqualMeta } from '@/domain/meals/ciqual';
import { normalize } from '@/domain/meals/constraints';

import type { FoodProvider, ProviderResult } from './types';

/**
 * FoodProvider over the app catalogue, whose nutrients come from the ANSES Ciqual 2025 extract
 * (D-020). Searches only the foods the recipes use; the rest of the table is not bundled.
 */
export const ciqualFoodProvider: FoodProvider = {
  async search(query, locale): Promise<ProviderResult<Food[]>> {
    const q = normalize(query);
    const data = FOOD_CATALOG.filter((f) => normalize(f.name[locale]).includes(q) || f.id.includes(q));
    if (data.length === 0) return { status: 'unavailable', reason: 'no_data' };
    return { status: 'ok', data, meta: ciqualMeta(null) };
  },
};
