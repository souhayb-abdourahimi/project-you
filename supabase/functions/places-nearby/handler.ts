/**
 * `places-nearby` (D-048, D-051): gyms and food stores near a rounded position. Geoapify Places
 * first when the server has a `GEOAPIFY_API_KEY`; OpenStreetMap through Overpass otherwise, or as
 * the single last-resort fallback when Geoapify fails. Runtime-agnostic (Jest-tested); `index.ts`
 * wires it to Deno and Supabase Auth.
 *
 * Order: cache → per-user quota → Geoapify (one request) → Overpass (one hedged call) → a precise
 * error. Never a loop, never more than these requests for one search.
 *
 * Privacy: the app sends a position already rounded to ~100 m; it is rounded again here, used for
 * this one query, never stored and never logged (nor is the query).
 */
import type { GeoapifyOutcome, PlaceOut } from './geoapify.ts';
import {
  type OverpassOutcome,
  type PlaceKind,
  callOverpass,
  clampRadius,
  coarsen,
  overpassQuery,
  trimElements,
} from './overpass.ts';

/** Changes when the contract changes (said by the GET diagnostic). */
export const PLACES_VERSION = '2026-10-26.geoapify';

export type PlacesBody =
  | { provider: 'geoapify'; places: PlaceOut[]; source: string }
  | { provider: 'overpass'; elements: unknown[]; source: string }
  | {
      error:
        | 'method_not_allowed'
        | 'unauthorized'
        | 'invalid_request'
        | 'rate_limited'
        | 'quota'
        | 'timeout'
        | 'unavailable'
        | 'too_many_requests';
    };

/** What the GET diagnostic says: which sources this deployment can use. Never a secret's value. */
export interface PlacesDiagnostic {
  version: string;
  providers: ('geoapify' | 'overpass')[];
  geoapifyConfigured: boolean;
  fallback: 'overpass';
}

export interface PlacesDeps {
  getUserId: (accessToken: string) => Promise<string | null>;
  overpass: (query: string) => Promise<OverpassOutcome>;
  /** Present only when the server has a Geoapify key. */
  geoapify?: (kind: PlaceKind, at: { lat: number; lng: number }, radius: number, lang: 'fr' | 'en') => Promise<GeoapifyOutcome>;
  /** Per-user quota (best effort, per instance). */
  allow?: (userId: string) => Promise<boolean>;
  /** Short cache of successful answers by rounded area. */
  cache?: { get(key: string): PlacesBody | undefined; set(key: string, value: PlacesBody): void };
}

const KINDS: readonly PlaceKind[] = ['gym', 'store'];

export function readPlacesRequest(
  body: unknown,
): { kind: PlaceKind; lat: number; lng: number; radius: number; lang: 'fr' | 'en' } | null {
  if (!body || typeof body !== 'object') return null;
  const { kind, lat, lng, radius, lang } = body as Record<string, unknown>;
  if (!KINDS.includes(kind as PlaceKind)) return null;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const r = typeof radius === 'number' && Number.isFinite(radius) ? clampRadius(radius) : kind === 'gym' ? 5000 : 2000;
  const p = coarsen({ lat, lng });
  return { kind: kind as PlaceKind, lat: p.lat, lng: p.lng, radius: r, lang: lang === 'en' ? 'en' : 'fr' };
}

export async function handlePlacesNearby(
  request: { method: string; authorization: string | null; body: unknown },
  deps: PlacesDeps,
): Promise<{ status: number; body: PlacesBody | PlacesDiagnostic }> {
  if (request.method !== 'POST' && request.method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };
  const token = request.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return { status: 401, body: { error: 'unauthorized' } };
  const userId = await deps.getUserId(token).catch(() => null);
  if (!userId) return { status: 401, body: { error: 'unauthorized' } };
  if (request.method === 'GET') {
    return {
      status: 200,
      body: {
        version: PLACES_VERSION,
        providers: deps.geoapify ? ['geoapify', 'overpass'] : ['overpass'],
        geoapifyConfigured: !!deps.geoapify,
        fallback: 'overpass',
      },
    };
  }
  const input = readPlacesRequest(request.body);
  if (!input) return { status: 400, body: { error: 'invalid_request' } };

  const key = `${input.kind}:${input.lat}:${input.lng}:${input.radius}`;
  const cached = deps.cache?.get(key);
  if (cached) return { status: 200, body: cached };
  if (deps.allow && !(await deps.allow(userId).catch(() => false)))
    return { status: 429, body: { error: 'too_many_requests' } };

  // 1. Geoapify, when configured: one request.
  const geo = deps.geoapify ? await deps.geoapify(input.kind, input, input.radius, input.lang).catch(() => null) : undefined;
  if (geo?.kind === 'ok') {
    const body: PlacesBody = { provider: 'geoapify', places: geo.places, source: 'Geoapify' };
    deps.cache?.set(key, body);
    return { status: 200, body };
  }

  // 2. OpenStreetMap through Overpass: the only source without a key, the last resort with one.
  const outcome = await deps.overpass(overpassQuery(input.kind, input, input.radius));
  if (outcome.kind === 'ok') {
    const body: PlacesBody = {
      provider: 'overpass',
      elements: trimElements(outcome.elements),
      source: new URL(outcome.endpoint).host,
    };
    deps.cache?.set(key, body);
    return { status: 200, body };
  }

  // 3. Both failed: Geoapify's own reason when it is precise (quota, rate), else Overpass's.
  if (geo?.kind === 'quota') return { status: 503, body: { error: 'quota' } };
  if (geo?.kind === 'rate_limited' || outcome.kind === 'rate_limited') return { status: 503, body: { error: 'rate_limited' } };
  if (geo?.kind === 'timeout' || outcome.kind === 'timeout') return { status: 504, body: { error: 'timeout' } };
  return { status: 502, body: { error: 'unavailable' } };
}

export { callOverpass };
