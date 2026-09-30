import type {
  CalendarProvider,
  GymProvider,
  HealthProvider,
  PlacesProvider,
  PriceProvider,
  ProductProvider,
  PromotionProvider,
  ProviderResult,
  SportsProvider,
  StoreProvider,
} from './types';

const notConfigured = async <T>(..._args: unknown[]): Promise<ProviderResult<T>> => ({
  status: 'unavailable',
  reason: 'not_configured',
});

/**
 * Default wiring until a real provider is integrated: every call honestly reports "unavailable".
 * Nothing here fabricates data.
 */
export const providers = {
  product: { byBarcode: notConfigured } satisfies ProductProvider,
  price: { pricesFor: notConfigured } satisfies PriceProvider,
  promotion: { current: notConfigured } satisfies PromotionProvider,
  store: { nearby: notConfigured } satisfies StoreProvider,
  places: { search: notConfigured } satisfies PlacesProvider,
  gym: { nearby: notConfigured } satisfies GymProvider,
  sports: { activities: notConfigured } satisfies SportsProvider,
  calendar: {
    requestAccess: notConfigured,
    events: notConfigured,
    createAppEvent: notConfigured,
    deleteAppEvent: notConfigured,
  } satisfies CalendarProvider,
  health: { requestAccess: notConfigured, read: notConfigured, disconnect: async () => {} } satisfies HealthProvider,
};
