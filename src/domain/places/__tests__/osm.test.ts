import { overpassQuery as serverQuery } from '../../../../supabase/functions/places-nearby/overpass.ts';
import { MAX_PLACES, coarsen, distanceMeters, overpassQuery, parseOverpass, readOverpassAnswer } from '../osm';

const HOME = { lat: 48.85661, lng: 2.35222 };

const fixture = {
  elements: [
    {
      type: 'node',
      id: 1,
      lat: 48.858,
      lon: 2.355,
      tags: {
        leisure: 'fitness_centre',
        name: 'Salle du Centre',
        opening_hours: 'Mo-Fr 06:00-22:00',
        'addr:housenumber': '12',
        'addr:street': 'Rue de Rivoli',
        'addr:postcode': '75004',
        'addr:city': 'Paris',
        website: 'https://example.org',
      },
    },
    {
      type: 'way',
      id: 2,
      center: { lat: 48.86, lon: 2.36 },
      tags: { amenity: 'gym', name: 'Gym Est', website: 'javascript:alert(1)' },
    },
    { type: 'node', id: 3, lat: 48.857, lon: 2.353, tags: { leisure: 'fitness_centre' } },
    { type: 'node', id: 4, tags: { leisure: 'fitness_centre', name: 'Sans position' } },
    { type: 'node', id: 5, lat: 48.857, lon: 2.353, tags: { shop: 'bakery', name: 'Boulangerie' } },
    { type: 'node', id: 1, lat: 48.858, lon: 2.355, tags: { leisure: 'fitness_centre', name: 'Salle du Centre' } },
  ],
};

describe('OpenStreetMap places', () => {
  it('keeps only named, located places of the right kind, sorted by distance', () => {
    const places = parseOverpass(fixture, 'gym', HOME);
    expect(places.map((p) => p.name)).toEqual(['Salle du Centre', 'Gym Est']);
    expect(places[0].distanceMeters).toBeLessThan(places[1].distanceMeters);
  });

  it('shows only what OSM has: no invented address or hours, unsafe links dropped', () => {
    const [centre, east] = parseOverpass(fixture, 'gym', HOME);
    expect(centre.address).toBe('12 Rue de Rivoli, 75004 Paris');
    expect(centre.openingHours).toBe('Mo-Fr 06:00-22:00');
    expect(centre.website).toBe('https://example.org');
    expect(east.address).toBeNull();
    expect(east.openingHours).toBeNull();
    expect(east.website).toBeNull();
  });

  it('returns nothing for a malformed answer', () => {
    expect(parseOverpass(null, 'gym', HOME)).toEqual([]);
    expect(parseOverpass({ elements: 'x' }, 'store', HOME)).toEqual([]);
  });

  it('never sends the exact position', () => {
    expect(coarsen(HOME)).toEqual({ lat: 48.857, lng: 2.352 });
    const q = overpassQuery('store', HOME, 1500);
    expect(q).toContain('around:1500,48.857,2.352');
    expect(q).not.toContain('48.85661');
    expect(q).toContain('nw["shop"~"^(supermarket|convenience|greengrocer|health_food)$"]');
  });

  it('is the same query as the places-nearby Edge Function, light enough for busy public servers', () => {
    for (const kind of ['gym', 'store'] as const) {
      expect(overpassQuery(kind, HOME, 3000)).toBe(serverQuery(kind, HOME, 3000));
    }
    const q = overpassQuery('gym', HOME, 5000);
    expect(q).toMatch(/^\[out:json\]\[timeout:8\]\[maxsize:16777216\];/);
    expect(q).not.toContain('nwr');
    expect(q).toMatch(/out center tags qt 200;$/);
  });

  it('computes a plausible great-circle distance', () => {
    // Paris → Lyon is about 392 km.
    const d = distanceMeters(HOME, { lat: 45.764, lng: 4.8357 });
    expect(d).toBeGreaterThan(385_000);
    expect(d).toBeLessThan(400_000);
  });

  it('a sports centre is a gym only with a weights or fitness room (no pool, no tennis club)', () => {
    const at = { lat: 48.858, lon: 2.355 };
    const json = {
      elements: [
        { type: 'way', id: 10, center: at, tags: { leisure: 'sports_centre', sport: 'swimming', name: 'Piscine' } },
        { type: 'way', id: 11, center: at, tags: { leisure: 'sports_centre', sport: 'tennis', name: 'Tennis club' } },
        {
          type: 'way',
          id: 12,
          center: at,
          tags: { leisure: 'sports_centre', sport: 'swimming;fitness', name: 'Centre' },
        },
        { type: 'way', id: 13, center: at, tags: { leisure: 'sports_centre', name: 'Sans sport' } },
      ],
    };
    expect(parseOverpass(json, 'gym', HOME).map((p) => p.name)).toEqual(['Centre']);
    expect(overpassQuery('gym', HOME, 5000)).toContain(
      '["sport"~"fitness|weightlifting|crossfit|bodybuilding|powerlifting"]',
    );
  });

  it('food stores include markets; a bakery or a restaurant is not a food store', () => {
    const at = { lat: 48.858, lon: 2.355 };
    const json = {
      elements: [
        { type: 'node', id: 1, ...at, tags: { amenity: 'marketplace', name: 'Marché Bastille' } },
        { type: 'node', id: 2, ...at, tags: { amenity: 'restaurant', name: 'Bistrot' } },
        { type: 'node', id: 3, ...at, tags: { shop: 'bakery', name: 'Boulangerie' } },
      ],
    };
    expect(parseOverpass(json, 'store', HOME).map((p) => p.name)).toEqual(['Marché Bastille']);
  });

  it('keeps the nearest places, not the first ones the server lists', () => {
    const elements = Array.from({ length: 80 }, (_, i) => ({
      type: 'node',
      id: i + 1,
      // Listed from the farthest to the nearest.
      lat: 48.857 + (80 - i) * 0.0005,
      lon: 2.352,
      tags: { shop: 'supermarket', name: `Magasin ${i + 1}` },
    }));
    const places = parseOverpass({ elements }, 'store', HOME);
    expect(places).toHaveLength(MAX_PLACES);
    expect(places[0].name).toBe('Magasin 80');
    expect(overpassQuery('store', HOME, 2000)).not.toMatch(/out center tags 60;/);
  });

  it('reads a server-side timeout or a malformed answer as a failure, not as "no place"', () => {
    expect(readOverpassAnswer({ elements: [], remark: 'runtime error: Query timed out' }, 'gym', HOME)).toEqual({
      kind: 'server_timeout',
    });
    expect(readOverpassAnswer({ remark: 'x' }, 'gym', HOME)).toEqual({ kind: 'invalid' });
    expect(readOverpassAnswer('<html>', 'gym', HOME)).toEqual({ kind: 'invalid' });
    expect(readOverpassAnswer({ elements: [] }, 'gym', HOME)).toEqual({ kind: 'ok', places: [] });
  });
});
