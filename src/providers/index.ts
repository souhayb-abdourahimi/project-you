/**
 * Provider registry: features import `providers` from here, never a concrete implementation.
 * Anything not wired to a real source stays `unavailable` (src/providers/unavailable.ts).
 */
import { deviceCalendarProvider } from './calendar';
import { deviceLocationProvider } from './location';
import { osmGymProvider, osmMapsProvider, osmPlacesProvider, osmStoreProvider } from './osm';
import { deviceHealthProvider } from './health';
import { providers as unavailable } from './unavailable';

export const providers = {
  ...unavailable,
  calendar: deviceCalendarProvider,
  places: osmPlacesProvider,
  maps: osmMapsProvider,
  gym: osmGymProvider,
  store: osmStoreProvider,
  location: deviceLocationProvider,
  health: deviceHealthProvider,
};
