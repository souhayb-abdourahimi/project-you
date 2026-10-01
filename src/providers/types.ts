/**
 * Provider-first architecture (docs/DATA_SOURCES.md, D-010). Features depend on these interfaces
 * only. A provider must handle auth, errors, timeouts, retries, caching, rate limits and missing data,
 * and report missing data as `unavailable` rather than inventing it.
 */
import type { Food } from '@/domain/meals/catalog';
import type { ExternalDataMeta } from '@/domain/shared/external';

export type ProviderResult<T> =
  | { status: 'ok'; data: T; meta: ExternalDataMeta }
  | { status: 'unavailable'; reason: 'not_configured' | 'no_data' | 'not_supported_on_platform' | 'permission_denied' }
  | { status: 'error'; error: 'timeout' | 'rate_limited' | 'network' | 'auth' | 'unknown'; retryable: boolean };

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  name: string;
  category: string;
  location: GeoPoint;
  address: string | null;
  openingHours: string | null;
  website: string | null;
  distanceMeters: number | null;
}

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

export interface HealthSample {
  type: 'weight' | 'steps' | 'workout';
  value: number;
  date: string;
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
export interface PlacesProvider {
  search(category: string, near: GeoPoint, radiusMeters: number): Promise<ProviderResult<Place[]>>;
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
export interface HealthProvider {
  requestAccess(types: HealthSample['type'][]): Promise<ProviderResult<true>>;
  read(type: HealthSample['type'], from: string, to: string): Promise<ProviderResult<HealthSample[]>>;
  disconnect(): Promise<void>;
}
export interface MapsProvider {
  openDirections(to: GeoPoint): Promise<ProviderResult<true>>;
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
