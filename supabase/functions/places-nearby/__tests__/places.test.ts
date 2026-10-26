import { handlePlacesNearby, readPlacesRequest, type PlacesDeps } from '../handler.ts';
import { callOverpass, classify, overpassQuery, trimElements } from '../overpass.ts';

const json = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) }) as unknown as Response;

const deps = (over: Partial<PlacesDeps> = {}): PlacesDeps => ({
  getUserId: async (t) => (t === 'good' ? 'user-a' : null),
  overpass: async () => ({
    kind: 'ok',
    elements: [{ type: 'node', id: 1, lat: 1, lon: 2, tags: { name: 'x' } }],
    endpoint: 'https://overpass-api.de/api/interpreter',
  }),
  ...over,
});
const call = (body: unknown, d = deps(), authorization: string | null = 'Bearer good') =>
  handlePlacesNearby({ method: 'POST', authorization, body }, d);

describe('places-nearby handler', () => {
  it('requires a signed-in user', async () => {
    expect((await call({ kind: 'gym', lat: 48.8, lng: 2.3 }, deps(), null)).status).toBe(401);
    expect((await call({ kind: 'gym', lat: 48.8, lng: 2.3 }, deps(), 'Bearer bad')).status).toBe(401);
  });

  it('rounds the position again (~100 m) and accepts only a known kind and a real point', () => {
    expect(readPlacesRequest({ kind: 'gym', lat: 48.856614, lng: 2.3522219 })).toEqual({
      kind: 'gym',
      lat: 48.857,
      lng: 2.352,
      radius: 5000,
    });
    expect(readPlacesRequest({ kind: 'bar', lat: 1, lng: 1 })).toBeNull();
    expect(readPlacesRequest({ kind: 'gym', lat: 91, lng: 1 })).toBeNull();
    expect(readPlacesRequest({ kind: 'gym', lat: '1', lng: 1 })).toBeNull();
    expect(readPlacesRequest({ kind: 'store', lat: 1, lng: 1, radius: 1e9 })?.radius).toBe(10_000);
  });

  it('the query sent to Overpass carries only the rounded position', async () => {
    const queries: string[] = [];
    await call(
      { kind: 'store', lat: 48.856614, lng: 2.3522219 },
      deps({ overpass: async (q) => (queries.push(q), { kind: 'timeout' }) }),
    );
    expect(queries[0]).toContain('around:2000,48.857,2.352');
    expect(queries[0]).not.toContain('48.8566');
  });

  it('maps each Overpass outcome to its own answer', async () => {
    const outcome = async (kind: 'timeout' | 'rate_limited' | 'unavailable' | 'bad_query') =>
      call({ kind: 'gym', lat: 1, lng: 1 }, deps({ overpass: async () => ({ kind }) }));
    expect(await outcome('timeout')).toEqual({ status: 504, body: { error: 'timeout' } });
    expect(await outcome('rate_limited')).toEqual({ status: 503, body: { error: 'rate_limited' } });
    expect(await outcome('unavailable')).toEqual({ status: 502, body: { error: 'unavailable' } });
    expect(await outcome('bad_query')).toEqual({ status: 502, body: { error: 'unavailable' } });
  });

  it('answers with trimmed elements and the instance used; serves a repeated area from the cache', async () => {
    const store = new Map();
    const overpass = jest.fn(deps().overpass);
    const d = deps({ overpass, cache: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) } });
    const first = await call({ kind: 'gym', lat: 1, lng: 1 }, d);
    expect(first).toEqual({
      status: 200,
      body: {
        elements: [{ type: 'node', id: 1, lat: 1, lon: 2, center: undefined, tags: { name: 'x' } }],
        source: 'overpass-api.de',
      },
    });
    await call({ kind: 'gym', lat: 1.00001, lng: 1 }, d);
    expect(overpass).toHaveBeenCalledTimes(1);
  });

  it('a user over the quota is told so', async () => {
    expect((await call({ kind: 'gym', lat: 1, lng: 1 }, deps({ allow: async () => false }))).body).toEqual({
      error: 'too_many_requests',
    });
  });

  it('keeps only id, type, position and tags of each element', () => {
    expect(
      trimElements([{ type: 'way', id: 2, center: { lat: 1, lon: 2 }, tags: {}, nodes: [1, 2, 3], geometry: [] }]),
    ).toEqual([{ type: 'way', id: 2, lat: undefined, lon: undefined, center: { lat: 1, lon: 2 }, tags: {} }]);
  });
});

describe('Overpass call', () => {
  const OK = { elements: [{ id: 1 }] };

  it('a 200 with a runtime error remark is a timeout; 429 busy; 504 timeout; garbage unavailable', async () => {
    const e = 'https://a/api';
    expect(await classify(json(200, { elements: [], remark: 'runtime error: Query timed out in "query"' }), e)).toEqual(
      { kind: 'timeout' },
    );
    expect(await classify(json(429, {}), e)).toEqual({ kind: 'rate_limited' });
    expect(await classify(json(504, {}), e)).toEqual({ kind: 'timeout' });
    expect(await classify(json(400, {}), e)).toEqual({ kind: 'bad_query' });
    expect(await classify({ status: 200, ok: true, text: async () => '<html>' } as unknown as Response, e)).toEqual({
      kind: 'unavailable',
    });
  });

  it('identifies the app with a User-Agent', async () => {
    const fetchImpl = jest.fn(async () => json(200, OK));
    await callOverpass('q', { fetchImpl: fetchImpl as never, userAgent: 'ProjectYou/1.0 (test)' });
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({
      'User-Agent': 'ProjectYou/1.0 (test)',
    });
  });

  it('first instance fine: the second is never asked', async () => {
    const fetchImpl = jest.fn(async () => json(200, OK));
    const out = await callOverpass('q', { fetchImpl: fetchImpl as never, userAgent: 'ua' });
    expect(out.kind).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('first instance refuses: the second answers (one fallback only)', async () => {
    const fetchImpl = jest.fn(async (url: string) => (url.includes('overpass-api.de') ? json(429, {}) : json(200, OK)));
    const out = await callOverpass('q', { fetchImpl: fetchImpl as never, userAgent: 'ua' });
    expect(out).toMatchObject({ kind: 'ok', endpoint: 'https://overpass.private.coffee/api/interpreter' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('first instance slow: the second starts after the hedge delay and the first answer wins', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(
      (url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          if (url.includes('private.coffee')) setTimeout(() => resolve(json(200, OK)), 500);
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pending = callOverpass('q', {
      fetchImpl: fetchImpl as never,
      userAgent: 'ua',
      hedgeAfterMs: 4000,
      timeoutMs: 11_000,
    });
    await jest.advanceTimersByTimeAsync(4600);
    const out = await pending;
    expect(out).toMatchObject({ kind: 'ok', endpoint: 'https://overpass.private.coffee/api/interpreter' });
    jest.useRealTimers();
  });

  it('both instances fail: the most useful reason is kept, never a loop', async () => {
    const fetchImpl = jest.fn(async (url: string) => (url.includes('overpass-api.de') ? json(504, {}) : json(429, {})));
    const out = await callOverpass('q', { fetchImpl: fetchImpl as never, userAgent: 'ua' });
    expect(out).toEqual({ kind: 'rate_limited' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('a bad query is not sent to the second instance', async () => {
    const fetchImpl = jest.fn(async () => json(400, {}));
    expect(await callOverpass('q', { fetchImpl: fetchImpl as never, userAgent: 'ua' })).toEqual({ kind: 'bad_query' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('builds a light query: nodes and ways, small budget, one regex for shops', () => {
    expect(overpassQuery('store', { lat: 48.85661, lng: 2.35222 }, 2000)).toBe(
      '[out:json][timeout:8][maxsize:16777216];(nw["shop"~"^(supermarket|convenience|greengrocer|health_food)$"](around:2000,48.857,2.352);nw["amenity"="marketplace"](around:2000,48.857,2.352););out center tags qt 200;',
    );
  });
});
