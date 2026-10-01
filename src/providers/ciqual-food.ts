import { FOOD_CATALOG, type Food } from '@/domain/meals/catalog';
import { normalize } from '@/domain/meals/constraints';

import type { FoodProvider, ProviderResult } from './types';

/** MOCK FoodProvider over the demo catalogue. Every result carries `meta.isMock = true`. */
export const mockFoodProvider: FoodProvider = {
  async search(query, locale): Promise<ProviderResult<Food[]>> {
    const q = normalize(query);
    const data = FOOD_CATALOG.filter((f) => normalize(f.name[locale]).includes(q) || f.id.includes(q));
    if (data.length === 0) return { status: 'unavailable', reason: 'no_data' };
    return { status: 'ok', data, meta: FOOD_CATALOG[0].meta };
  },
};
