/**
 * Geoapify first, Overpass as the last resort (D-051). Categories and URL follow the Geoapify docs;
 * the key never appears in an answer; one request per source, never a loop.
 */
import {
  GEOAPIFY_CATEGORIES,
  callGeoapify,
  classifyGeoapify,
  geoapifyUrl,
  parseGeoapify,
  type GeoapifyOutcome,
} from '../geoapify.ts';
import { handlePlacesNearby, type PlacesDeps } from '../handler.ts';

const KEY = 'test-geoapify-key-not-real';
const at = { lat: 48.857, lng: 2.352 };

const response = (status: number, body: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }) as unknown as Response;

const feature = (props: Record<string, unknown>) => ({ type: 'Feature', properties: props, geometry: null });
const GYM = feature({
  name: 'Club Sport Bastille',
  lat: 48.8531,
  lon: 2.3694,
  place_id: 'abc123',
  categories: ['sport', 'sport.fitness', 'sport.fitness.fitness_centre'],
  distance: 1312,
  housenumber: '12',
  street: 'Rue de la Roquette',
  postcode: '75011',
  city: 'Paris',
  opening_hours: 'Mo-Fr 07:00-22:00',
  website: 'https://club.example',
});

describe('Geoapify request', () => {
  it('asks only documented categories, a circle around the rounded point, 20 places', () => {
    const url = new URL(geoapifyUrl('store', at, 2000, KEY, 'fr'));
    expect(url.origin + url.pathname).toBe('https://api.geoapify.com/v2/places');
    expect(url.searchParams.get('categories')).toBe(
      'commercial.supermarket,commercial.convenience,commercial.food_and_drink.fruit_and_vegetable,commercial.food_and_drink.health_food,commercial.marketplace',
    );
    expect(url.searchParams.get('filter')).toBe('circle:2.352,48.857,2000');
    expect(url.searchParams.get('bias')).toBe('proximity:2.352,48.857');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('lang')).toBe('fr');
    expect(GEOAPIFY_CATEGORIES.gym).toEqual(['sport.fitness.fitness_centre', 'sport.fitness.gym']);
  });
});

describe('Geoapify answer', () => {
  it('becomes the app places: id, name, position, distance, real address only', () => {
    const [p] = parseGeoapify({ type: 'FeatureCollection', features: [GYM] }, 'gym', at)!;
    expect(p).toEqual({
      id: 'geoapify:abc123',
      kind: 'gym',
      name: 'Club Sport Bastille',
      category: 'sport.fitness.fitness_centre',
      location: { lat: 48.8531, lng: 2.3694 },
      address: '12 Rue de la Roquette, 75011 Paris',
      openingHours: 'Mo-Fr 07:00-22:00',
      website: 'https://club.example',
      distanceMeters: 1312,
    });
  });

  it('never invents: no name or position → dropped; no street → no address; no hours → null; distance computed', () => {
    const places = parseGeoapify(
      {
        features: [
          feature({ lat: 48.85, lon: 2.35, place_id: 'noname' }),
          feature({ name: 'Nowhere', place_id: 'nopos' }),
          feature({ name: 'Épicerie', lat: 48.858, lon: 2.352, place_id: 'p2', city: 'Paris', website: 'javascript:x' }),
        ],
      },
      'store',
      at,
    )!;
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ name: 'Épicerie', address: null, openingHours: null, website: null });
    expect(places[0].distanceMeters).toBe(111);
  });

  it('an answer that is not GeoJSON is unusable, not "nothing around"', () => {
    expect(parseGeoapify({ error: 'x' }, 'gym', at)).toBeNull();
  });

  it('each refusal has its own reason', async () => {
    const classify = (status: number, body: unknown = {}) => classifyGeoapify(response(status, body), 'gym', at);
    expect(await classify(401)).toEqual({ kind: 'auth' });
    expect(await classify(403)).toEqual({ kind: 'auth' });
    expect(await classify(402)).toEqual({ kind: 'quota' });
    expect(await classify(429, { message: 'Daily credits limit exceeded' })).toEqual({ kind: 'quota' });
    expect(await classify(429, { message: 'Too many requests' })).toEqual({ kind: 'rate_limited' });
    expect(await classify(500)).toEqual({ kind: 'unavailable' });
    expect(await classify(504)).toEqual({ kind: 'timeout' });
    expect(await classify(200, 'not json')).toEqual({ kind: 'unavailable' });
    expect(await classify(200, { features: [] })).toEqual({ kind: 'ok', places: [] });
  });

  it('a silent server is a timeout after the bound', async () => {
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    expect(await callGeoapify('https://api.geoapify.com/v2/places', 'gym', at, { fetchImpl: hang, timeoutMs: 10 })).toEqual({
      kind: 'timeout',
    });
  });
});

describe('places-nearby: Geoapify first, Overpass last', () => {
  const overpassOk = async () => ({
    kind: 'ok' as const,
    elements: [{ type: 'node', id: 1, lat: 1, lon: 2, tags: { name: 'x' } }],
    endpoint: 'https://overpass-api.de/api/interpreter',
  });
  const deps = (over: Partial<PlacesDeps>): PlacesDeps => ({
    getUserId: async (t) => (t === 'good' ? 'user-a' : null),
    overpass: jest.fn(overpassOk),
    ...over,
  });
  const call = (d: PlacesDeps, method = 'POST') =>
    handlePlacesNearby({ method, authorization: 'Bearer good', body: { kind: 'gym', lat: 48.8566, lng: 2.3522 } }, d);
  const geo = (outcome: GeoapifyOutcome) => jest.fn(async () => outcome);

  it('with a key: Geoapify answers, Overpass is never asked', async () => {
    const d = deps({ geoapify: geo({ kind: 'ok', places: parseGeoapify({ features: [GYM] }, 'gym', at)! }) });
    const res = await call(d);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'geoapify', source: 'Geoapify' });
    expect(d.overpass).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });

  it('Geoapify gets only the rounded position', async () => {
    const g = geo({ kind: 'ok', places: [] });
    await call(deps({ geoapify: g }));
    expect(g).toHaveBeenCalledWith('gym', { kind: 'gym', lat: 48.857, lng: 2.352, radius: 5000, lang: 'fr' }, 5000, 'fr');
  });

  it('nothing around is an answer, not a reason to ask Overpass', async () => {
    const d = deps({ geoapify: geo({ kind: 'ok', places: [] }) });
    expect((await call(d)).body).toEqual({ provider: 'geoapify', places: [], source: 'Geoapify' });
    expect(d.overpass).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'unavailable', 'rate_limited', 'quota', 'auth'] as const)(
    'Geoapify %s: Overpass is tried once, and its answer is used',
    async (kind) => {
      const d = deps({ geoapify: geo({ kind }) });
      const res = await call(d);
      expect(res.body).toMatchObject({ provider: 'overpass' });
      expect(d.overpass).toHaveBeenCalledTimes(1);
    },
  );

  it('both fail: the precise reason is kept (quota, then rate, then timeout)', async () => {
    const failing = jest.fn(async () => ({ kind: 'timeout' as const }));
    expect((await call(deps({ geoapify: geo({ kind: 'quota' }), overpass: failing }))).body).toEqual({ error: 'quota' });
    expect((await call(deps({ geoapify: geo({ kind: 'rate_limited' }), overpass: failing }))).body).toEqual({
      error: 'rate_limited',
    });
    expect((await call(deps({ geoapify: geo({ kind: 'unavailable' }), overpass: failing }))).status).toBe(504);
    const down = jest.fn(async () => ({ kind: 'unavailable' as const }));
    expect(await call(deps({ geoapify: geo({ kind: 'auth' }), overpass: down }))).toEqual({
      status: 502,
      body: { error: 'unavailable' },
    });
  });

  it('without a key: Overpass only, as before', async () => {
    const d = deps({});
    expect((await call(d)).body).toMatchObject({ provider: 'overpass' });
  });

  it('the GET diagnostic says what is configured, never a key, and needs a session', async () => {
    expect((await call(deps({ geoapify: geo({ kind: 'ok', places: [] }) }), 'GET')).body).toEqual({
      version: expect.any(String),
      providers: ['geoapify', 'overpass'],
      geoapifyConfigured: true,
      fallback: 'overpass',
    });
    expect((await call(deps({}), 'GET')).body).toMatchObject({ providers: ['overpass'], geoapifyConfigured: false });
    const anonymous = await handlePlacesNearby({ method: 'GET', authorization: null, body: null }, deps({}));
    expect(anonymous.status).toBe(401);
  });
});
