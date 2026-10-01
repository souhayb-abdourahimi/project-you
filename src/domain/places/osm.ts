/**
 * OpenStreetMap places (Overpass API) for gyms and food stores. Pure functions: query building,
 * parsing, distance. Only what OSM contributors entered is shown; a missing field stays missing
 * (no invented hours, address, crowd level or equipment). OSM data is collaborative, so it is
 * labelled with its source and "to check".
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

export type PlaceKind = 'gym' | 'store';

export interface OsmPlace {
  id: string;
  kind: PlaceKind;
  name: string;
  /** OSM tag that matched (e.g. `leisure=fitness_centre`), shown as the category. */
  category: string;
  location: GeoPoint;
  address: string | null;
  /** Raw OSM `opening_hours` value; never interpreted as "open now". */
  openingHours: string | null;
  website: string | null;
  distanceMeters: number;
}

const SELECTORS: Record<PlaceKind, [string, string][]> = {
  gym: [
    ['leisure', 'fitness_centre'],
    ['amenity', 'gym'],
    ['leisure', 'sports_centre'],
  ],
  store: [
    ['shop', 'supermarket'],
    ['shop', 'convenience'],
    ['shop', 'greengrocer'],
    ['shop', 'health_food'],
  ],
};

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
  const parts = SELECTORS[kind].map(([k, v]) => `nwr["${k}"="${v}"](around:${r},${lat},${lng});`).join('');
  return `[out:json][timeout:15];(${parts});out center tags 60;`;
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
    const match = SELECTORS[kind].find(([k, v]) => tags[k] === v);
    if (!match) continue;
    const id = `${String(raw.type ?? 'node')}/${String(raw.id)}`;
    if (places.has(id)) continue;
    const website = text(tags.website, 300) ?? text(tags['contact:website'], 300);
    places.set(id, {
      id,
      kind,
      name,
      category: `${match[0]}=${match[1]}`,
      location: { lat, lng },
      address: address(tags),
      openingHours: text(tags.opening_hours, 200),
      website: website && /^https?:\/\//.test(website) ? website : null,
      distanceMeters: distanceMeters(from, { lat, lng }),
    });
  }
  return [...places.values()].sort((a, b) => a.distanceMeters - b.distanceMeters);
}
