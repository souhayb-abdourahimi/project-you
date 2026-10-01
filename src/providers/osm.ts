import { Linking } from 'react-native';

import { coarsen, overpassQuery, parseOverpass } from '@/domain/places/osm';

import type {
  GeoPoint,
  GymProvider,
  MapsProvider,
  Place,
  PlaceKind,
  PlacesProvider,
  ProviderResult,
  StoreProvider,
} from './types';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const TIMEOUT_MS = 15_000;
const CACHE_MS = 10 * 60_000;

const cache = new Map<string, { at: number; result: ProviderResult<Place[]> }>();

/**
 * Gyms and food stores from OpenStreetMap through the public Overpass API (no key). Collaborative
 * data: confidence "medium", source shown, nothing added when a field is missing.
 * The public instance is for development and beta only (fair use ≈ 100 queries/day for a regular
 * app): production needs a self-hosted Overpass or a paid provider behind the same interface (D-019).
 */
async function nearby(kind: PlaceKind, near: GeoPoint, radiusMeters: number): Promise<ProviderResult<Place[]>> {
  const point = coarsen(near);
  const key = `${kind}:${point.lat}:${point.lng}:${radiusMeters}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery(kind, point, radiusMeters))}`,
      signal: controller.signal,
    });
    if (response.status === 429 || response.status === 504) {
      return { status: 'error', error: 'rate_limited', retryable: true };
    }
    if (!response.ok) return { status: 'error', error: 'unknown', retryable: true };
    const places = parseOverpass(await response.json(), kind, point);
    const fetchedAt = new Date().toISOString();
    const result: ProviderResult<Place[]> =
      places.length === 0
        ? { status: 'unavailable', reason: 'no_data' }
        : {
            status: 'ok',
            data: places,
            meta: {
              provider: 'openstreetmap-overpass',
              externalId: null,
              source: 'OpenStreetMap (contributeurs, licence ODbL)',
              fetchedAt,
              updatedAt: null,
              confidence: 'medium',
              isMock: false,
            },
          };
    cache.set(key, { at: Date.now(), result });
    return result;
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { status: 'error', error: aborted ? 'timeout' : 'network', retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

export const osmPlacesProvider: PlacesProvider = { nearby };
export const osmGymProvider: GymProvider = { nearby: (near, radius) => nearby('gym', near, radius) };
export const osmStoreProvider: StoreProvider = { nearby: (near, radius) => nearby('store', near, radius) };

/** Opens openstreetmap.org on the point (OSM attribution included on the site). */
export const osmMapsProvider: MapsProvider = {
  open: async (at) => {
    try {
      await Linking.openURL(`https://www.openstreetmap.org/?mlat=${at.lat}&mlon=${at.lng}#map=18/${at.lat}/${at.lng}`);
      return {
        status: 'ok',
        data: true,
        meta: {
          provider: 'openstreetmap',
          externalId: null,
          source: 'openstreetmap.org',
          fetchedAt: new Date().toISOString(),
          updatedAt: null,
          confidence: 'medium',
          isMock: false,
        },
      };
    } catch {
      return { status: 'error', error: 'unknown', retryable: false };
    }
  },
};

/** For tests. */
export function clearPlacesCache() {
  cache.clear();
}
