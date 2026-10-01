/**
 * Provider-first architecture (docs/DATA_SOURCES.md, D-010). Features depend on these interfaces
 * only. A provider must handle auth, errors, timeouts, retries, caching, rate limits and missing data,
 * and report missing data as `unavailable` rather than inventing it.
 */
import type { Food } from '@/domain/meals/catalog';
import type { GeoPoint, Place, PlaceKind } from '@/domain/places/types';
import type {
  HealthAvailability,
  HealthDataType,
  HealthPermissions,
  HealthSource,
  RawDailyTotal,
  RawWeightSample,
  RawWorkout,
  TimeRange,
} from '@/domain/health/types';
import type { ExternalDataMeta } from '@/domain/shared/external';

export type ProviderResult<T> =
  | { status: 'ok'; data: T; meta: ExternalDataMeta }
  | { status: 'unavailable'; reason: 'not_configured' | 'no_data' | 'not_supported_on_platform' | 'permission_denied' }
  | { status: 'error'; error: 'timeout' | 'rate_limited' | 'network' | 'auth' | 'unknown'; retryable: boolean };

export type { GeoPoint, Place, PlaceKind } from '@/domain/places/types';

export interface Price {
  foodId: string;
  storeId: string;
  cents: number;
  unit: 'kg' | 'l' | 'piece';
}

export interface Promotion {
  productName: string;
  storeId: string;
  /** Only when really known. */
  previousCents: number | null;
  promoCents: number;
  startsOn: string;
  endsOn: string;
}

/** A personal calendar event, reduced to its time range: titles and details are never read. */
export interface CalendarBusyEvent {
  start: string;
  end: string;
  allDay: boolean;
}

/** An event Project You writes in its own calendar. */
export interface AppCalendarEventInput {
  title: string;
  start: Date;
  end: Date;
  notes?: string;
}

export interface FoodProvider {
  search(query: string, locale: 'fr' | 'en'): Promise<ProviderResult<Food[]>>;
}
export interface ProductProvider {
  byBarcode(barcode: string): Promise<ProviderResult<Food>>;
}
export interface PriceProvider {
  pricesFor(foodIds: string[], near: GeoPoint): Promise<ProviderResult<Price[]>>;
}
export interface PromotionProvider {
  current(near: GeoPoint): Promise<ProviderResult<Promotion[]>>;
}
export interface StoreProvider {
  nearby(near: GeoPoint, radiusMeters: number): Promise<ProviderResult<Place[]>>;
}
/**
 * Nearby places of a kind. The only entry point the UI uses: swapping OpenStreetMap for another
 * source means writing another implementation and wiring it in src/providers/index.ts (D-019).
 */
export interface PlacesProvider {
  nearby(kind: PlaceKind, near: GeoPoint, radiusMeters: number): Promise<ProviderResult<Place[]>>;
}
export interface GymProvider {
  nearby(near: GeoPoint, radiusMeters: number): Promise<ProviderResult<Place[]>>;
}
export interface SportsProvider {
  activities(near: GeoPoint, radiusMeters: number): Promise<ProviderResult<Place[]>>;
}
/**
 * Project You writes only in a dedicated "Project You" calendar it creates. Personal calendars are
 * read for busy times only; their events are never created, modified or deleted.
 */
export interface CalendarProvider {
  requestAccess(): Promise<ProviderResult<true>>;
  /** Busy times from the user's calendars (the app calendar excluded). */
  busyEvents(from: Date, to: Date): Promise<ProviderResult<CalendarBusyEvent[]>>;
  /** Returns the new event id. */
  createAppEvent(event: AppCalendarEventInput): Promise<ProviderResult<string>>;
  /** Refused (`permission_denied`) for an event outside the app calendar. */
  updateAppEvent(id: string, event: AppCalendarEventInput): Promise<ProviderResult<true>>;
  /** Refused (`permission_denied`) for an event outside the app calendar. */
  deleteAppEvent(id: string): Promise<ProviderResult<true>>;
  /** Deletes the app calendar and therefore every event the app wrote. */
  disconnect(): Promise<ProviderResult<true>>;
}
/**
 * Apple Health (HealthKit) on iOS, Health Connect on Android, nothing on web. Read-only in V1:
 * weight, steps, workouts and active energy (D-018). Values are raw; src/domain/health normalises,
 * validates and deduplicates them. Never imported by a screen: features go through useHealth.
 */
export interface HealthProvider {
  readonly source: HealthSource | null;
  getAvailability(): Promise<HealthAvailability>;
  /** Shows the system permission sheet for these types only. */
  requestPermissions(types: HealthDataType[]): Promise<ProviderResult<HealthPermissions>>;
  getPermissions(types: HealthDataType[]): Promise<ProviderResult<HealthPermissions>>;
  getWeight(range: TimeRange): Promise<ProviderResult<RawWeightSample[]>>;
  /** One total per local day, aggregated by the platform (phone + watch counted once). */
  getSteps(range: TimeRange): Promise<ProviderResult<RawDailyTotal[]>>;
  getWorkouts(range: TimeRange): Promise<ProviderResult<RawWorkout[]>>;
  getActiveCalories(range: TimeRange): Promise<ProviderResult<RawDailyTotal[]>>;
  /**
   * Stops the link on the platform side when the platform allows it (Android revokes, effective at
   * next app start). iOS has no API for it: the user removes access in Settings › Health.
   */
  disconnect(): Promise<ProviderResult<{ revokedBySystem: boolean }>>;
  /** Opens the place where the user manages health permissions. */
  openSettings(): Promise<void>;
}
export interface LocationProvider {
  /** Asks for the foreground permission when needed, then reads the current position once. */
  current(): Promise<ProviderResult<GeoPoint>>;
}
/** Opens a point on a map; the UI never builds a map URL itself. */
export interface MapsProvider {
  open(at: GeoPoint): Promise<ProviderResult<true>>;
}
export interface NotificationProvider {
  requestPermission(): Promise<ProviderResult<true>>;
  schedule(input: { category: string; title: string; body: string; at: string }): Promise<ProviderResult<string>>;
  cancel(id: string): Promise<void>;
}
export interface AIProvider {
  /** Called from an Edge Function only; returns raw JSON to be parsed by src/domain/ai/schemas.ts. */
  complete(input: {
    system: string;
    context: Record<string, unknown>;
    question: string;
  }): Promise<ProviderResult<unknown>>;
}
