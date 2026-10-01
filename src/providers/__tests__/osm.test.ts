import { clearPlacesCache, osmGymProvider, osmStoreProvider } from '../osm';

const HOME = { lat: 48.85661, lng: 2.35222 };
const realFetch = global.fetch;

function respond(status: number, body: unknown) {
  const fetchMock = jest.fn(async (_url: string, _init: { body: string }) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  global.fetch = realFetch;
  clearPlacesCache();
});

describe('OpenStreetMap provider', () => {
  it('returns real places with their source and a medium confidence', async () => {
    const fetchMock = respond(200, {
      elements: [{ type: 'node', id: 1, lat: 48.858, lon: 2.355, tags: { leisure: 'fitness_centre', name: 'Salle' } }],
    });
    const r = await osmGymProvider.nearby(HOME, 2000);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.data[0].name).toBe('Salle');
      expect(r.meta).toMatchObject({ provider: 'openstreetmap-overpass', confidence: 'medium', isMock: false });
    }
    const body = decodeURIComponent(fetchMock.mock.calls[0][1].body);
    expect(body).not.toContain('48.85661');
    // Cached: no second request for the same area.
    await osmGymProvider.nearby(HOME, 2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('says "no data" instead of inventing places', async () => {
    respond(200, { elements: [] });
    expect(await osmStoreProvider.nearby(HOME, 1000)).toEqual({ status: 'unavailable', reason: 'no_data' });
  });

  it('maps rate limits and network failures to retryable errors', async () => {
    respond(429, {});
    expect(await osmGymProvider.nearby(HOME, 1000)).toEqual({
      status: 'error',
      error: 'rate_limited',
      retryable: true,
    });
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    expect(await osmStoreProvider.nearby(HOME, 1000)).toEqual({ status: 'error', error: 'network', retryable: true });
  });
});
