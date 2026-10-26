/**
 * Overpass query and call for `places-nearby` (D-048). No import: runs in Deno (Edge Function), in
 * Node (scripts/places/measure-overpass.mjs) and in Jest. The app keeps the same query in
 * src/domain/places/osm.ts (a test keeps them identical) for local mode, where it calls Overpass
 * from the device.
 *
 * Why this query (measured 2026-10-26, docs/DATA_SOURCES.md):
 * - `nw` instead of `nwr`: a gym or a shop mapped as a relation is rare, and relations make the
 *   server compute centres of large multipolygons;
 * - one regex on the indexed `shop` key instead of four statements;
 * - `[maxsize]` lowered to 16 MB and `[timeout]` to 8 s: the public instances admit small queries
 *   first when they are busy;
 * - `qt` output order (no sort by id on the server), at most 200 elements.
 */
export type PlaceKind = 'gym' | 'store';
export interface Point {
  lat: number;
  lng: number;
}

export const SERVER_TIMEOUT_S = 8;
export const MAX_SIZE_BYTES = 16 * 1024 * 1024;
export const SERVER_LIMIT = 200;
export const GYM_SPORTS = 'fitness|weightlifting|crossfit|bodybuilding|powerlifting';
export const STORE_SHOPS = 'supermarket|convenience|greengrocer|health_food';

/** About 100 m: the position never leaves the device more precisely than this. */
export function coarsen(p: Point): Point {
  return { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 };
}

export function clampRadius(radiusMeters: number): number {
  return Math.round(Math.min(Math.max(radiusMeters, 200), 10_000));
}

export function overpassQuery(kind: PlaceKind, near: Point, radiusMeters: number): string {
  const { lat, lng } = coarsen(near);
  const around = `(around:${clampRadius(radiusMeters)},${lat},${lng})`;
  const statements =
    kind === 'gym'
      ? [
          `nw["leisure"="fitness_centre"]${around};`,
          `nw["amenity"="gym"]${around};`,
          `nw["leisure"="sports_centre"]["sport"~"${GYM_SPORTS}"]${around};`,
        ]
      : [`nw["shop"~"^(${STORE_SHOPS})$"]${around};`, `nw["amenity"="marketplace"]${around};`];
  return `[out:json][timeout:${SERVER_TIMEOUT_S}][maxsize:${MAX_SIZE_BYTES}];(${statements.join('')});out center tags qt ${SERVER_LIMIT};`;
}

/** Public instances, in order. The second is used only when the first is slow or refuses. */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;

export type OverpassOutcome =
  | { kind: 'ok'; elements: unknown[]; endpoint: string }
  | { kind: 'timeout' | 'rate_limited' | 'unavailable' | 'bad_query' };

/** One answer, classified. A 200 with a runtime-error remark is a server timeout, never "nothing". */
export async function classify(response: Response, endpoint: string): Promise<OverpassOutcome> {
  if (response.status === 429) return { kind: 'rate_limited' };
  if (response.status === 504) return { kind: 'timeout' };
  if (response.status === 400) return { kind: 'bad_query' };
  if (!response.ok) return { kind: 'unavailable' };
  let json: { elements?: unknown; remark?: unknown };
  try {
    json = JSON.parse(await response.text());
  } catch {
    return { kind: 'unavailable' };
  }
  if (!Array.isArray(json?.elements)) return { kind: 'unavailable' };
  if (typeof json.remark === 'string' && /runtime error|timed out|out of memory/i.test(json.remark)) {
    return /out of memory/i.test(json.remark) ? { kind: 'unavailable' } : { kind: 'timeout' };
  }
  return { kind: 'ok', elements: json.elements, endpoint };
}

export interface CallOptions {
  fetchImpl?: typeof fetch;
  userAgent: string;
  /** Per instance. */
  timeoutMs?: number;
  /** The second instance starts if the first has not answered after this delay (hedged request). */
  hedgeAfterMs?: number;
  endpoints?: readonly string[];
}

/**
 * Asks the first instance; if it fails, or is still silent after `hedgeAfterMs`, asks the second
 * one too (at most one fallback) and keeps the first usable answer. Every request is bounded.
 * Worst case: hedgeAfterMs + timeoutMs.
 */
export async function callOverpass(query: string, options: CallOptions): Promise<OverpassOutcome> {
  const {
    fetchImpl = fetch,
    userAgent,
    timeoutMs = (SERVER_TIMEOUT_S + 3) * 1000,
    hedgeAfterMs = 4000,
    endpoints = OVERPASS_ENDPOINTS,
  } = options;
  const controllers: AbortController[] = [];

  const ask = async (endpoint: string): Promise<OverpassOutcome> => {
    const controller = new AbortController();
    controllers.push(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': userAgent,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      return await classify(response, endpoint);
    } catch {
      return controller.signal.aborted ? { kind: 'timeout' } : { kind: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  };

  const [first, second] = endpoints;
  const primary = ask(first);
  if (!second) return primary;
  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  let startSecond: () => void = () => undefined;
  const secondStarted = new Promise<void>((resolve) => {
    startSecond = resolve;
    hedgeTimer = setTimeout(resolve, hedgeAfterMs);
  });

  try {
    const firstDone = primary.then((outcome) => {
      // A broken query fails everywhere: no second request for it.
      if (outcome.kind !== 'ok' && outcome.kind !== 'bad_query') startSecond();
      return outcome;
    });
    const secondDone = secondStarted.then(() => ask(second));
    const winner = await Promise.race([
      firstDone.then((o) => (o.kind === 'ok' || o.kind === 'bad_query' ? o : secondDone.then((s) => best(o, s)))),
      secondDone.then((s) => (s.kind === 'ok' ? s : firstDone.then((o) => best(o, s)))),
    ]);
    return winner;
  } finally {
    clearTimeout(hedgeTimer);
    // Whatever is still running is no longer needed.
    for (const c of controllers) c.abort();
  }
}

/** The more useful of two failed or successful outcomes, for the message shown to the user. */
function best(a: OverpassOutcome, b: OverpassOutcome): OverpassOutcome {
  const rank = { ok: 0, bad_query: 1, rate_limited: 2, timeout: 3, unavailable: 4 } as const;
  return rank[a.kind] <= rank[b.kind] ? a : b;
}

/** Only what the app reads: id, type, position, tags. Keeps the answer small. */
export function trimElements(elements: unknown[]): unknown[] {
  return elements.slice(0, SERVER_LIMIT).map((raw) => {
    const e = (raw ?? {}) as Record<string, unknown>;
    return { type: e.type, id: e.id, lat: e.lat, lon: e.lon, center: e.center, tags: e.tags };
  });
}
