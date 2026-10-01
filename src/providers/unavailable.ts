import type {
  CalendarProvider,
  GymProvider,
  MapsProvider,
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
  places: { nearby: notConfigured } satisfies PlacesProvider,
  maps: { open: notConfigured } satisfies MapsProvider,
  gym: { nearby: notConfigured } satisfies GymProvider,
  sports: { activities: notConfigured } satisfies SportsProvider,
  calendar: {
    requestAccess: notConfigured,
    busyEvents: notConfigured,
    createAppEvent: notConfigured,
    updateAppEvent: notConfigured,
    deleteAppEvent: notConfigured,
    disconnect: notConfigured,
  } satisfies CalendarProvider,
};
