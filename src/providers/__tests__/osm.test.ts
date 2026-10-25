import { Platform } from 'react-native';

import {
  OVERPASS_ENDPOINTS,
  USER_AGENT,
  clearPlacesCache,
  osmGymProvider,
  osmPlacesProvider,
  osmStoreProvider,
} from '../osm';

const HOME = { lat: 48.85661, lng: 2.35222 };
const realFetch = global.fetch;
const realOS = Platform.OS;

type Answer = { status: number; body?: unknown; raw?: string } | Error;

/** Each call takes the next answer (the last one repeats). */
function answers(...list: Answer[]) {
  let i = 0;
  const fetchMock = jest.fn(async (_url: string, _init: { body: string; headers: Record<string, string> }) => {
    const a = list[Math.min(i++, list.length - 1)];
    if (a instanceof Error) throw a;
    return {
      status: a.status,
      ok: a.status >= 200 && a.status < 300,
      text: async () => a.raw ?? JSON.stringify(a.body ?? {}),
    };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const gym = (id: number, name = 'Salle') => ({
  type: 'node',
  id,
  lat: 48.858,
  lon: 2.355,
  tags: { leisure: 'fitness_centre', name },
});

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = realFetch;
  Platform.OS = realOS;
  clearPlacesCache();
});

/** Runs a provider call while advancing fake timers (backoff between instances). */
async function run<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  const out = promise.finally(() => {
    done = true;
  });
  while (!done) await jest.advanceTimersByTimeAsync(500);
  return out;
}

describe('OpenStreetMap provider', () => {
  it('returns real places with their source and a medium confidence, cached per rounded area', async () => {
    const fetchMock = answers({ status: 200, body: { elements: [gym(1)] } });
    const r = await run(osmGymProvider.nearby(HOME, 2000));
    expect(r).toMatchObject({
      status: 'ok',
      data: [{ name: 'Salle' }],
      meta: { provider: 'openstreetmap-overpass', confidence: 'medium', isMock: false },
    });
    const body = decodeURIComponent(fetchMock.mock.calls[0][1].body);
    expect(body).not.toContain('48.85661');
    await run(osmGymProvider.nearby(HOME, 2000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the native apps identify themselves (the main instance answers 406 otherwise)', async () => {
    Platform.OS = 'ios';
    const fetchMock = answers({ status: 200, body: { elements: [gym(1)] } });
    await run(osmGymProvider.nearby(HOME, 2000));
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers['User-Agent']).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^ProjectYou\//);
    expect(init.headers.Accept).toBe('application/json');
  });

  it('a browser sends its own User-Agent and the page origin as Referer, never a custom one', async () => {
    Platform.OS = 'web';
    const fetchMock = answers({ status: 200, body: { elements: [gym(1)] } });
    await run(osmGymProvider.nearby(HOME, 2000));
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string>; referrerPolicy?: string };
    expect(init.headers['User-Agent']).toBeUndefined();
    expect(init.referrerPolicy).toBe('strict-origin-when-cross-origin');
  });

  it('says "no data" only for a real empty answer', async () => {
    answers({ status: 200, body: { elements: [] } });
    expect(await run(osmStoreProvider.nearby(HOME, 1000))).toEqual({ status: 'unavailable', reason: 'no_data' });
  });

  it('a server-side timeout (200 with a runtime error remark) is a timeout, never "nothing around you"', async () => {
    answers({ status: 200, body: { elements: [], remark: 'runtime error: Query timed out in "query" at line 1' } });
    expect(await run(osmGymProvider.nearby(HOME, 1000))).toEqual({
      status: 'error',
      error: 'timeout',
      retryable: true,
    });
  });

  it.each([
    ['refused (406)', { status: 406, raw: '<html>Not Acceptable</html>' }, 'service'],
    ['refused (403)', { status: 403, raw: 'Forbidden' }, 'service'],
    ['a server failure (500)', { status: 500, raw: '' }, 'service'],
    ['overloaded (504)', { status: 504, raw: '' }, 'timeout'],
    ['rate limited (429)', { status: 429, raw: '' }, 'rate_limited'],
    ['an HTML page instead of JSON', { status: 200, raw: '<?xml version="1.0"?><osm/>' }, 'service'],
    ['JSON without elements', { status: 200, body: { foo: 1 } }, 'service'],
    ['no HTTP answer', new TypeError('Failed to fetch'), 'network'],
  ] as const)('%s on both instances: a retryable "%s" error, not "check your connection"', async (_, answer, error) => {
    const fetchMock = answers(answer as Answer);
    expect(await run(osmGymProvider.nearby(HOME, 1000))).toEqual({ status: 'error', error, retryable: true });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([...OVERPASS_ENDPOINTS]);
  });

  it('falls back once to the second instance, then stops (no retry loop)', async () => {
    const fetchMock = answers({ status: 406, raw: '' }, { status: 200, body: { elements: [gym(2, 'Salle B')] } });
    const r = await run(osmGymProvider.nearby(HOME, 1000));
    expect(r).toMatchObject({ status: 'ok', data: [{ name: 'Salle B' }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(OVERPASS_ENDPOINTS[1]);
  });

  it('a bad query (400) is not sent again to another instance', async () => {
    const fetchMock = answers({ status: 400, raw: 'parse error' });
    expect(await run(osmGymProvider.nearby(HOME, 1000))).toEqual({
      status: 'error',
      error: 'unknown',
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a slow instance is aborted, then the next one is tried', async () => {
    const aborted: boolean[] = [];
    global.fetch = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_, reject) =>
          init.signal.addEventListener('abort', () => {
            aborted.push(true);
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          }),
        ),
    ) as unknown as typeof fetch;
    expect(await run(osmGymProvider.nearby(HOME, 1000))).toEqual({
      status: 'error',
      error: 'timeout',
      retryable: true,
    });
    expect(aborted).toEqual([true, true]);
  });

  it('offline: no request at all, an "offline" error', async () => {
    const fetchMock = answers({ status: 200, body: { elements: [] } });
    const nav = globalThis.navigator as { onLine?: boolean };
    const before = Object.getOwnPropertyDescriptor(nav, 'onLine');
    Object.defineProperty(nav, 'onLine', { value: false, configurable: true });
    try {
      expect(await run(osmGymProvider.nearby(HOME, 1000))).toEqual({
        status: 'error',
        error: 'offline',
        retryable: true,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (before) Object.defineProperty(nav, 'onLine', before);
      else delete nav.onLine;
    }
  });

  it('errors are not cached: the next search asks again', async () => {
    const fetchMock = answers(
      { status: 500, raw: '' },
      { status: 500, raw: '' },
      { status: 200, body: { elements: [gym(3)] } },
    );
    expect((await run(osmGymProvider.nearby(HOME, 1000))).status).toBe('error');
    expect((await run(osmGymProvider.nearby(HOME, 1000))).status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('the same search already running is shared, not sent twice', async () => {
    const fetchMock = answers({ status: 200, body: { elements: [gym(4)] } });
    const [a, b] = await run(Promise.all([osmGymProvider.nearby(HOME, 1000), osmGymProvider.nearby(HOME, 1000)]));
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves the provider-neutral places interface used by the UI', async () => {
    answers({
      status: 200,
      body: {
        elements: [{ type: 'node', id: 7, lat: 48.858, lon: 2.355, tags: { shop: 'supermarket', name: 'Marché' } }],
      },
    });
    const r = await run(osmPlacesProvider.nearby('store', HOME, 2000));
    expect(r).toMatchObject({ status: 'ok', data: [{ kind: 'store', name: 'Marché' }] });
  });
});
