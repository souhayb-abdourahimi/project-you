/**
 * Provider registry: features import `providers` from here, never a concrete implementation.
 * Anything not wired to a real source stays `unavailable` (src/providers/unavailable.ts).
 */
import { deviceCalendarProvider } from './calendar';
import { deviceLocationProvider } from './location';
import { osmGymProvider, osmMapsProvider, osmPlacesProvider, osmStoreProvider } from './osm';
import { deviceHealthProvider } from './health';
import { supabaseMealPhotoProvider } from './meal-photo';
import { providers as unavailable } from './unavailable';
import { isSupabaseConfigured } from '@/services/supabase';

import type { MealPhotoProvider } from './types';

const mealPhoto: MealPhotoProvider = isSupabaseConfigured ? supabaseMealPhotoProvider : unavailable.mealPhoto;

export const providers = {
  ...unavailable,
  calendar: deviceCalendarProvider,
  places: osmPlacesProvider,
  maps: osmMapsProvider,
  gym: osmGymProvider,
  store: osmStoreProvider,
  location: deviceLocationProvider,
  health: deviceHealthProvider,
  // Answers `unavailable` without a Supabase project or without vision secrets on the server.
  mealPhoto: mealPhoto,
};
