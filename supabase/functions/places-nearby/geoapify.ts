/**
 * Geoapify Places for `places-nearby` (D-051): the main source of nearby gyms and food stores when
 * the `GEOAPIFY_API_KEY` secret is set (free plan, no card). No import: runs in Deno and in Jest.
 *
 * Checked in the Geoapify docs and OpenAPI spec (2026-10-26): `GET /v2/places` with `categories`,
 * `filter=circle:lon,lat,radiusMeters`, `bias=proximity:lon,lat`, `limit` (default 20), `lang`,
 * `apiKey`; GeoJSON features whose properties include `name`, `lat`, `lon`, `place_id`,
 * `categories`, `distance` (metres to the biased point), `housenumber`, `street`, `postcode`,
 * `city`, `opening_hours`, `website`. One credit per 20 places; the free plan has 3,000 a day.
 *
 * The key is read from the environment by `index.ts` and only ever travels in this request's URL
 * to Geoapify: never logged, never returned.
 */
import type { Point } from './overpass.ts';

export type PlaceKind = 'gym' | 'store';

export const GEOAPIFY_ENDPOINT = 'https://api.geoapify.com/v2/places';
/** One credit per request: 20 places is the default page and enough for a nearby list. */
export const GEOAPIFY_LIMIT = 20;

/**
 * Categories (Geoapify names, never guessed): indoor gyms only (`sport.fitness.fitness_station`,
 * outdoor equipment, is left out), and the same food stores as the OpenStreetMap query
 * (supermarket, convenience, greengrocer, health food, marketplace).
 */
export const GEOAPIFY_CATEGORIES: Record<PlaceKind, readonly string[]> = {
  gym: ['sport.fitness.fitness_centre', 'sport.fitness.gym'],
  store: [
    'commercial.supermarket',
    'commercial.convenience',
    'commercial.food_and_drink.fruit_and_vegetable',
    'commercial.food_and_drink.health_food',
    'commercial.marketplace',
  ],
};

export function geoapifyUrl(kind: PlaceKind, at: Point, radius: number, apiKey: string, lang: 'fr' | 'en'): string {
  const params = new URLSearchParams({
    categories: GEOAPIFY_CATEGORIES[kind].join(','),
    filter: `circle:${at.lng},${at.lat},${radius}`,
    bias: `proximity:${at.lng},${at.lat}`,
    limit: String(GEOAPIFY_LIMIT),
    lang,
    apiKey,
  });
  return `${GEOAPIFY_ENDPOINT}?${params.toString()}`;
}

/** A place as the app reads it (src/domain/places/types.ts), with nothing invented. */
export interface PlaceOut {
  id: string;
  kind: PlaceKind;
  name: string;
  category: string;
  location: Point;
  address: string | null;
  openingHours: string | null;
  website: string | null;
  distanceMeters: number;
}

const text = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;

function distance(a: Point, b: Point): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** "12 rue X, 75011 Paris" only from fields the source has; a street is needed, else null. */
function addressOf(p: Record<string, unknown>): string | null {
  const street = [text(p.housenumber, 20), text(p.street, 120)].filter(Boolean).join(' ');
  if (!street) return null;
  const city = [text(p.postcode, 20), text(p.city, 80)].filter(Boolean).join(' ');
  return [street, city].filter((s) => s !== '').join(', ');
}

/**
 * GeoJSON → places. A feature without a name, a valid position or an id is dropped rather than
 * shown with invented values; the category kept is the most precise one asked for.
 */
export function parseGeoapify(json: unknown, kind: PlaceKind, from: Point): PlaceOut[] | null {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return null;
  const seen = new Set<string>();
  const out: PlaceOut[] = [];
  for (const f of features) {
    const p = ((f as { properties?: unknown })?.properties ?? {}) as Record<string, unknown>;
    const name = text(p.name, 120);
    const lat = Number(p.lat);
    const lng = Number(p.lon);
    const placeId = text(p.place_id, 200);
    if (!name || !placeId || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      continue;
    const id = `geoapify:${placeId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const categories = Array.isArray(p.categories) ? p.categories.filter((c): c is string => typeof c === 'string') : [];
    const category =
      GEOAPIFY_CATEGORIES[kind].find((c) => categories.includes(c)) ??
      categories.find((c) => GEOAPIFY_CATEGORIES[kind].some((k) => c.startsWith(k))) ??
      GEOAPIFY_CATEGORIES[kind][0];
    const website = text(p.website, 300);
    const given = Number(p.distance);
    out.push({
      id,
      kind,
      name,
      category,
      location: { lat, lng },
      address: addressOf(p),
      openingHours: text(p.opening_hours, 200),
      website: website && /^https?:\/\//.test(website) ? website : null,
      distanceMeters: Number.isFinite(given) && given >= 0 ? Math.round(given) : distance(from, { lat, lng }),
    });
  }
  return out.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, GEOAPIFY_LIMIT);
}

export type GeoapifyOutcome =
  | { kind: 'ok'; places: PlaceOut[] }
  /** Daily credits used up (the free plan's quota). */
  | { kind: 'quota' }
  /** Too many requests per second. */
  | { kind: 'rate_limited' }
  /** The key is refused (wrong, revoked). */
  | { kind: 'auth' }
  | { kind: 'timeout' | 'unavailable' | 'bad_query' };

const QUOTA_WORDS = /credit|quota|daily limit|limit exceeded|payment/i;

/** One answer, classified; the response body is read for its words only, never echoed. */
export async function classifyGeoapify(response: Response, kind: PlaceKind, from: Point): Promise<GeoapifyOutcome> {
  if (response.status === 401 || response.status === 403) return { kind: 'auth' };
  if (response.status === 402) return { kind: 'quota' };
  if (response.status === 429) {
    const body = await response.text().catch(() => '');
    return QUOTA_WORDS.test(body) ? { kind: 'quota' } : { kind: 'rate_limited' };
  }
  if (response.status === 400) return { kind: 'bad_query' };
  if (response.status === 504) return { kind: 'timeout' };
  if (!response.ok) return { kind: 'unavailable' };
  let json: unknown;
  try {
    json = JSON.parse(await response.text());
  } catch {
    return { kind: 'unavailable' };
  }
  const places = parseGeoapify(json, kind, from);
  return places ? { kind: 'ok', places } : { kind: 'unavailable' };
}

/** One bounded request (no retry here: the handler decides the single fallback). */
export async function callGeoapify(
  url: string,
  kind: PlaceKind,
  from: Point,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<GeoapifyOutcome> {
  const { fetchImpl = fetch, timeoutMs = 8000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    return await classifyGeoapify(response, kind, from);
  } catch {
    return controller.signal.aborted ? { kind: 'timeout' } : { kind: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
