import { coarsen, distanceMeters, overpassQuery, parseOverpass } from '../osm';

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
    expect(q).toContain('"shop"="supermarket"');
  });

  it('computes a plausible great-circle distance', () => {
    // Paris → Lyon is about 392 km.
    const d = distanceMeters(HOME, { lat: 45.764, lng: 4.8357 });
    expect(d).toBeGreaterThan(385_000);
    expect(d).toBeLessThan(400_000);
  });
});
