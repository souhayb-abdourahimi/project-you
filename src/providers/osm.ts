import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { SERVER_TIMEOUT_S, coarsen, overpassQuery, readOverpassAnswer } from '@/domain/places/osm';
import { supabase } from '@/services/supabase';

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

/**
 * Public Overpass instances, tried in this order (at most once each). The main instance requires,
 * since April 2026, an identifying User-Agent from apps and a Referer from browsers; without them
 * it answers 406. The second one is a community instance used only when the first fails
 * (docs/DATA_SOURCES.md, verified 2026-10-25). Production still needs a dedicated provider (D-019).
 */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;
/** Per attempt: a little more than the server budget, so the server's own timeout answers first. */
const TIMEOUT_MS = (SERVER_TIMEOUT_S + 4) * 1000;
const BACKOFF_MS = 800;
const CACHE_MS = 10 * 60_000;

const cache = new Map<string, { at: number; result: ProviderResult<Place[]> }>();
const inFlight = new Map<string, Promise<ProviderResult<Place[]>>>();

/** Identifies the app to the volunteer-run servers, as their usage policy asks. */
export const USER_AGENT = `ProjectYou/${Constants.expoConfig?.version ?? '1'} (fitness and nutrition coach; nearby places search)`;

type Attempt = ProviderResult<Place[]> & { fallback?: boolean };

/** One request to one instance. `fallback`: worth trying the next instance. */
async function ask(endpoint: string, query: string, kind: PlaceKind, point: GeoPoint): Promise<Attempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        // A browser sends its own User-Agent and the page's origin as Referer (it refuses a custom
        // User-Agent); the native apps have neither, so they say who they are.
        ...(Platform.OS === 'web' ? {} : { 'User-Agent': USER_AGENT }),
      },
      ...(Platform.OS === 'web' ? { referrerPolicy: 'strict-origin-when-cross-origin' as const } : {}),
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (response.status === 429) return { status: 'error', error: 'rate_limited', retryable: true, fallback: true };
    if (response.status === 504) return { status: 'error', error: 'timeout', retryable: true, fallback: true };
    // 400: our query is wrong; another instance would refuse it too.
    if (response.status === 400) return { status: 'error', error: 'unknown', retryable: false };
    // 403 / 406 (refused) and 5xx: the service, not the user's connection.
    if (!response.ok) return { status: 'error', error: 'service', retryable: true, fallback: true };
    let json: unknown;
    try {
      json = JSON.parse(await response.text());
    } catch {
      return { status: 'error', error: 'service', retryable: true, fallback: true };
    }
    const answer = readOverpassAnswer(json, kind, point);
    if (answer.kind === 'server_timeout') return { status: 'error', error: 'timeout', retryable: true, fallback: true };
    if (answer.kind === 'invalid') return { status: 'error', error: 'service', retryable: true, fallback: true };
    if (answer.places.length === 0) return { status: 'unavailable', reason: 'no_data' };
    return {
      status: 'ok',
      data: answer.places,
      meta: {
        provider: 'openstreetmap-overpass',
        externalId: null,
        source: 'OpenStreetMap (contributeurs, licence ODbL)',
        fetchedAt: new Date().toISOString(),
        updatedAt: null,
        confidence: 'medium',
        isMock: false,
      },
    };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { status: 'error', error: 'timeout', retryable: true, fallback: true };
    }
    // No HTTP answer at all. In a browser this is also what a refusal without CORS headers looks
    // like, so it is "unreachable", not "check your connection" (offline is checked before).
    return { status: 'error', error: 'network', retryable: true, fallback: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The `places-nearby` Edge Function (D-048): the search runs on the server, which sends a real
 * User-Agent and asks a second instance when the first is slow. Only the rounded position and the
 * kind are sent. `null`: not usable here (no account session), the device asks Overpass itself.
 */
export type InvokePlaces = (
  body: { kind: PlaceKind; lat: number; lng: number; radius: number },
  signal: AbortSignal,
) => Promise<{ status: number; data: unknown } | null>;

/** Server budget: hedge after 4 s + 11 s per instance; the client waits a little longer. */
const FUNCTION_TIMEOUT_MS = 20_000;

const invokeSupabasePlaces: InvokePlaces = async (body, signal) => {
  if (!supabase) return null;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;
  const { data, error } = await supabase.functions.invoke('places-nearby', { body, signal });
  if (!error) return { status: 200, data };
  const response = (error as { context?: unknown }).context;
  if (response instanceof Response) return { status: response.status, data: await response.json().catch(() => null) };
  throw error;
};

let invokePlaces: InvokePlaces = invokeSupabasePlaces;
/** For tests. */
export function setInvokePlaces(fn: InvokePlaces) {
  invokePlaces = fn;
}

/** The function's answer as the app's result; `null` when the function is not there (not deployed). */
async function viaFunction(kind: PlaceKind, point: GeoPoint, radius: number): Promise<ProviderResult<Place[]> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FUNCTION_TIMEOUT_MS);
  try {
    const answer = await invokePlaces({ kind, lat: point.lat, lng: point.lng, radius }, controller.signal);
    if (!answer || answer.status === 404) return null;
    const code = (answer.data as { error?: unknown } | null)?.error;
    if (answer.status === 200) {
      const read = readOverpassAnswer(answer.data, kind, point);
      if (read.kind !== 'ok') return { status: 'error', error: 'service', retryable: true };
      if (read.places.length === 0) return { status: 'unavailable', reason: 'no_data' };
      const source = (answer.data as { source?: unknown }).source;
      return {
        status: 'ok',
        data: read.places,
        meta: {
          provider: 'openstreetmap-overpass',
          externalId: typeof source === 'string' ? source.slice(0, 80) : null,
          source: 'OpenStreetMap (contributeurs, licence ODbL)',
          fetchedAt: new Date().toISOString(),
          updatedAt: null,
          confidence: 'medium',
          isMock: false,
        },
      };
    }
    if (answer.status === 504 || code === 'timeout') return { status: 'error', error: 'timeout', retryable: true };
    if (answer.status === 429 || code === 'rate_limited' || code === 'too_many_requests')
      return { status: 'error', error: 'rate_limited', retryable: true };
    if (answer.status === 401) return { status: 'error', error: 'auth', retryable: false };
    return { status: 'error', error: 'service', retryable: true };
  } catch {
    if (controller.signal.aborted) return { status: 'error', error: 'timeout', retryable: true };
    return isOffline()
      ? { status: 'error', error: 'offline', retryable: true }
      : { status: 'error', error: 'network', retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Gyms and food stores from OpenStreetMap through public Overpass instances (no key), via the
 * `places-nearby` function when signed in.
 * Collaborative data: confidence "medium", source shown, nothing added when a field is missing.
 * At most one request per instance, one short pause between them, never a loop. Answers are
 * cached 10 minutes per rounded area; the same search already running is shared, not repeated.
 */
async function nearby(kind: PlaceKind, near: GeoPoint, radiusMeters: number): Promise<ProviderResult<Place[]>> {
  const point = coarsen(near);
  const key = `${kind}:${point.lat}:${point.lng}:${radiusMeters}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  if (isOffline()) return { status: 'error', error: 'offline', retryable: true };
  const running = inFlight.get(key);
  if (running) return running;

  const run = (async (): Promise<ProviderResult<Place[]>> => {
    // Signed in: the server searches (real User-Agent, hedged fallback). Otherwise, or while the
    // function is not deployed, the device asks Overpass directly.
    const remote = await viaFunction(kind, point, radiusMeters);
    if (remote) {
      if (remote.status !== 'error') cache.set(key, { at: Date.now(), result: remote });
      return remote;
    }
    const query = overpassQuery(kind, point, radiusMeters);
    let last: Attempt = { status: 'error', error: 'unknown', retryable: true };
    for (const [i, endpoint] of OVERPASS_ENDPOINTS.entries()) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS));
      if (isOffline()) return { status: 'error', error: 'offline', retryable: true };
      last = await ask(endpoint, query, kind, point);
      if (last.status !== 'error' || !last.fallback) break;
    }
    const { fallback: _fallback, ...result } = last as Attempt;
    if (result.status !== 'error') cache.set(key, { at: Date.now(), result });
    return result as ProviderResult<Place[]>;
  })();
  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
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
  inFlight.clear();
}
