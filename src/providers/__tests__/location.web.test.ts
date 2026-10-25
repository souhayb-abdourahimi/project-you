import { deviceLocationProvider as provider, PROMPT_GUARD_MS } from '../location.web';

type Success = (p: { coords: { latitude: number; longitude: number } }) => void;
type Failure = (e: { code: number }) => void;

function stubGeolocation(impl: ((ok: Success, fail: Failure, options: PositionOptions) => void) | null) {
  const getCurrentPosition = jest.fn(impl ?? (() => undefined));
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: impl === null ? {} : { geolocation: { getCurrentPosition } },
  });
  return getCurrentPosition;
}

afterEach(() => jest.useRealTimers());

describe('browser location provider (Safari / installed web app)', () => {
  it('reads one position with a single prompt and a bounded, cached-friendly request', async () => {
    const get = stubGeolocation((ok) => ok({ coords: { latitude: 48.8566, longitude: 2.3522 } }));
    const result = await provider.current();
    expect(result).toMatchObject({ status: 'ok', data: { lat: 48.8566, lng: 2.3522 }, meta: { isMock: false } });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: false, timeout: 15_000 });
  });

  it('refusal is a refusal, not a generic error', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 1 }));
    expect(await provider.current()).toEqual({ status: 'unavailable', reason: 'permission_denied' });
  });

  it('a fix that takes too long says so (retry offered)', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 3 }));
    expect(await provider.current()).toEqual({ status: 'error', error: 'timeout', retryable: true });
  });

  it('position unavailable (location services off, no signal) is an error with retry', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 2 }));
    expect(await provider.current()).toEqual({ status: 'error', error: 'unknown', retryable: true });
  });

  it('an unanswered permission prompt never leaves the search hanging', async () => {
    jest.useFakeTimers();
    stubGeolocation(() => undefined);
    const pending = provider.current();
    jest.advanceTimersByTime(PROMPT_GUARD_MS);
    expect(await pending).toEqual({ status: 'error', error: 'timeout', retryable: true });
  });

  it('a browser without geolocation says it is not supported', async () => {
    stubGeolocation(null);
    expect(await provider.current()).toEqual({ status: 'unavailable', reason: 'not_supported_on_platform' });
  });

  it('an impossible point is no data, never a made-up place', async () => {
    stubGeolocation((ok) => ok({ coords: { latitude: 200, longitude: 0 } }));
    expect(await provider.current()).toEqual({ status: 'unavailable', reason: 'no_data' });
  });
});
