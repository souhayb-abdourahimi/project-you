/**
 * `places-nearby` (D-048): gyms and food stores near a rounded position, from OpenStreetMap through
 * Overpass, called from the server so the request carries a real User-Agent and a bounded,
 * hedged fallback. Runtime-agnostic (Jest-tested); `index.ts` wires it to Deno and Supabase Auth.
 *
 * Privacy: the app sends a position already rounded to ~100 m; it is rounded again here, used for
 * this one query, never stored and never logged (nor is the query).
 */
import {
  type OverpassOutcome,
  type PlaceKind,
  callOverpass,
  clampRadius,
  coarsen,
  overpassQuery,
  trimElements,
} from './overpass.ts';

export type PlacesBody =
  | { elements: unknown[]; source: string }
  | {
      error:
        | 'method_not_allowed'
        | 'unauthorized'
        | 'invalid_request'
        | 'rate_limited'
        | 'timeout'
        | 'unavailable'
        | 'too_many_requests';
    };

export interface PlacesDeps {
  getUserId: (accessToken: string) => Promise<string | null>;
  overpass: (query: string) => Promise<OverpassOutcome>;
  /** Per-user quota (best effort, per instance). */
  allow?: (userId: string) => Promise<boolean>;
  /** Short cache of successful answers by rounded area. */
  cache?: { get(key: string): PlacesBody | undefined; set(key: string, value: PlacesBody): void };
}

const KINDS: readonly PlaceKind[] = ['gym', 'store'];

export function readPlacesRequest(body: unknown): { kind: PlaceKind; lat: number; lng: number; radius: number } | null {
  if (!body || typeof body !== 'object') return null;
  const { kind, lat, lng, radius } = body as Record<string, unknown>;
  if (!KINDS.includes(kind as PlaceKind)) return null;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const r = typeof radius === 'number' && Number.isFinite(radius) ? clampRadius(radius) : kind === 'gym' ? 5000 : 2000;
  const p = coarsen({ lat, lng });
  return { kind: kind as PlaceKind, lat: p.lat, lng: p.lng, radius: r };
}

export async function handlePlacesNearby(
  request: { method: string; authorization: string | null; body: unknown },
  deps: PlacesDeps,
): Promise<{ status: number; body: PlacesBody }> {
  if (request.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };
  const token = request.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return { status: 401, body: { error: 'unauthorized' } };
  const userId = await deps.getUserId(token).catch(() => null);
  if (!userId) return { status: 401, body: { error: 'unauthorized' } };
  const input = readPlacesRequest(request.body);
  if (!input) return { status: 400, body: { error: 'invalid_request' } };

  const key = `${input.kind}:${input.lat}:${input.lng}:${input.radius}`;
  const cached = deps.cache?.get(key);
  if (cached) return { status: 200, body: cached };
  if (deps.allow && !(await deps.allow(userId).catch(() => false)))
    return { status: 429, body: { error: 'too_many_requests' } };

  const outcome = await deps.overpass(overpassQuery(input.kind, input, input.radius));
  switch (outcome.kind) {
    case 'ok': {
      const body = { elements: trimElements(outcome.elements), source: new URL(outcome.endpoint).host };
      deps.cache?.set(key, body);
      return { status: 200, body };
    }
    case 'rate_limited':
      return { status: 503, body: { error: 'rate_limited' } };
    case 'timeout':
      return { status: 504, body: { error: 'timeout' } };
    default:
      return { status: 502, body: { error: 'unavailable' } };
  }
}

export { callOverpass };
