/**
 * OpenStreetMap places (Overpass API) for gyms and food stores. Pure functions: query building,
 * parsing, distance. Only what OSM contributors entered is shown; a missing field stays missing
 * (no invented hours, address, crowd level or equipment). OSM data is collaborative, so it is
 * labelled with its source and "to check".
 */
import type { GeoPoint, Place, PlaceKind } from './types';

export type { GeoPoint, PlaceKind } from './types';
/** An OSM place is a provider-neutral `Place`: only fields OSM contributors entered are filled. */
export type OsmPlace = Place;

/**
 * What counts as a gym or a food store. `sport` narrows a generic sports centre to the ones with a
 * weights or fitness room (a swimming pool or a tennis club is not a gym).
 */
interface Selector {
  key: string;
  value: string;
  /** Overpass regex on the `sport` tag; the place must match it. */
  sport?: string;
}

const GYM_SPORTS = 'fitness|weightlifting|crossfit|bodybuilding|powerlifting';

const SELECTORS: Record<PlaceKind, Selector[]> = {
  gym: [
    { key: 'leisure', value: 'fitness_centre' },
    { key: 'amenity', value: 'gym' },
    { key: 'leisure', value: 'sports_centre', sport: GYM_SPORTS },
  ],
  store: [
    { key: 'shop', value: 'supermarket' },
    { key: 'shop', value: 'convenience' },
    { key: 'shop', value: 'greengrocer' },
    { key: 'shop', value: 'health_food' },
    { key: 'amenity', value: 'marketplace' },
  ],
};

/** Places kept after sorting by distance: the nearest ones, never an arbitrary subset. */
export const MAX_PLACES = 30;
/** Elements the server may return; enough for a dense city centre, then sorted here. */
const SERVER_LIMIT = 250;
/** Server-side time budget (seconds), below the client timeout so the server answers first. */
export const SERVER_TIMEOUT_S = 10;

/**
 * The position is rounded to about 100 m before leaving the device, so the exact location is
 * never sent to a third party.
 */
export function coarsen(p: GeoPoint): GeoPoint {
  return { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 };
}

export function isValidPoint(p: GeoPoint): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

export function overpassQuery(kind: PlaceKind, near: GeoPoint, radiusMeters: number): string {
  const { lat, lng } = coarsen(near);
  const r = Math.round(Math.min(Math.max(radiusMeters, 200), 10_000));
  const parts = SELECTORS[kind]
    .map(
      ({ key, value, sport }) =>
        `nwr["${key}"="${value}"]${sport ? `["sport"~"${sport}"]` : ''}(around:${r},${lat},${lng});`,
    )
    .join('');
  return `[out:json][timeout:${SERVER_TIMEOUT_S}];(${parts});out center tags ${SERVER_LIMIT};`;
}

/** Great-circle distance in metres ("as the crow flies", not a travel time). */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

interface OverpassElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: Record<string, unknown>;
}

const text = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;

function address(tags: Record<string, unknown>): string | null {
  const street = [text(tags['addr:housenumber'], 20), text(tags['addr:street'], 120)].filter(Boolean).join(' ');
  const city = [text(tags['addr:postcode'], 20), text(tags['addr:city'], 80)].filter(Boolean).join(' ');
  const full = [street, city].filter((s) => s !== '').join(', ');
  return street ? full : null;
}

/** Elements without a name or position are dropped rather than shown with invented values. */
export function parseOverpass(json: unknown, kind: PlaceKind, from: GeoPoint): OsmPlace[] {
  const elements = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const places = new Map<string, OsmPlace>();
  for (const raw of elements as OverpassElement[]) {
    const tags = raw.tags && typeof raw.tags === 'object' ? raw.tags : {};
    const name = text(tags.name, 120);
    const lat = Number(raw.lat ?? raw.center?.lat);
    const lng = Number(raw.lon ?? raw.center?.lon);
    if (!name || !isValidPoint({ lat, lng }) || raw.id == null) continue;
    const match = SELECTORS[kind].find(
      ({ key, value, sport }) =>
        tags[key] === value && (!sport || new RegExp(`(^|;)\\s*(${sport})\\s*($|;)`).test(String(tags.sport ?? ''))),
    );
    if (!match) continue;
    const id = `${String(raw.type ?? 'node')}/${String(raw.id)}`;
    if (places.has(id)) continue;
    const website = text(tags.website, 300) ?? text(tags['contact:website'], 300);
    places.set(id, {
      id,
      kind,
      name,
      category: `${match.key}=${match.value}`,
      location: { lat, lng },
      address: address(tags),
      openingHours: text(tags.opening_hours, 200),
      website: website && /^https?:\/\//.test(website) ? website : null,
      distanceMeters: distanceMeters(from, { lat, lng }),
    });
  }
  return [...places.values()].sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, MAX_PLACES);
}

/**
 * How to read an Overpass answer. A server-side timeout comes back as HTTP 200 with a `remark`
 * and no (or partial) elements: that is a failure, never "nothing around you".
 */
export type OverpassAnswer = { kind: 'ok'; places: OsmPlace[] } | { kind: 'server_timeout' } | { kind: 'invalid' };

export function readOverpassAnswer(json: unknown, kind: PlaceKind, from: GeoPoint): OverpassAnswer {
  if (!json || typeof json !== 'object' || !Array.isArray((json as { elements?: unknown }).elements)) {
    return { kind: 'invalid' };
  }
  const remark = (json as { remark?: unknown }).remark;
  if (typeof remark === 'string' && /runtime error|timed out|out of memory/i.test(remark)) {
    return { kind: 'server_timeout' };
  }
  return { kind: 'ok', places: parseOverpass(json, kind, from) };
}
