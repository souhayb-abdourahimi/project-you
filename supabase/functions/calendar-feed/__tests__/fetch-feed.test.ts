/** Fetching the iCal link (D-049): redirects, DNS, timeout, size and content checks. */
import { fetchFeed, looksLikeIcs, type FetchFeedDeps } from '../fetch-feed';

const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
const body = (text: string) => new TextEncoder().encode(text);

function response(status: number, text = '', headers: Record<string, string> = {}) {
  return new Response(status === 204 || (status >= 300 && status < 400) ? null : body(text), { status, headers });
}

const deps = (over: Partial<FetchFeedDeps> = {}): FetchFeedDeps => ({
  fetchImpl: jest.fn(async () => response(200, ICS, { 'content-type': 'text/calendar' })) as never,
  resolve: async () => ['93.184.216.34'],
  userAgent: 'ProjectYou/test',
  ...over,
});
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (e: { failure?: string }) => e.failure ?? String(e),
  );

describe('fetchFeed', () => {
  it('returns the calendar text and the host only', async () => {
    const d = deps();
    expect(await fetchFeed('webcal://edt.example.fr/cal?token=SECRET', d)).toEqual({
      text: ICS,
      host: 'edt.example.fr',
    });
    const [url, init] = (d.fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe('https://edt.example.fr/cal?token=SECRET');
    expect(init).toMatchObject({ redirect: 'manual', method: 'GET', headers: { 'User-Agent': 'ProjectYou/test' } });
  });

  it('a valid calendar with a wrong content type is accepted; an HTML page is not', async () => {
    const html = deps({ fetchImpl: (async () => response(200, ICS, { 'content-type': 'text/html' })) as never });
    expect(await failure(fetchFeed('https://edt.example.fr/cal', html))).toBe('ok');
    const login = deps({
      fetchImpl: (async () =>
        response(200, '<!doctype html><title>Connexion</title>', { 'content-type': 'text/html' })) as never,
    });
    expect(await failure(fetchFeed('https://edt.example.fr/cal', login))).toBe('not_ics');
    const empty = deps({ fetchImpl: (async () => response(200, '')) as never });
    expect(await failure(fetchFeed('https://edt.example.fr/cal', empty))).toBe('not_ics');
  });

  it('a host that resolves inside a private network is refused before any request', async () => {
    const d = deps({ resolve: async () => ['93.184.216.34', '10.0.0.5'] });
    expect(await failure(fetchFeed('https://rebind.example.com/cal.ics', d))).toBe('blocked_address');
    expect(d.fetchImpl).not.toHaveBeenCalled();
    expect(await failure(fetchFeed('https://nowhere.example.com/cal.ics', deps({ resolve: async () => [] })))).toBe(
      'not_found',
    );
  });

  it('follows at most 3 redirects, each checked again (a redirect to a private address is refused)', async () => {
    const toPrivate = jest.fn(async () => response(302, '', { location: 'https://169.254.169.254/latest/meta-data/' }));
    expect(await failure(fetchFeed('https://edt.example.fr/cal', deps({ fetchImpl: toPrivate as never })))).toBe(
      'blocked_address',
    );
    expect(toPrivate).toHaveBeenCalledTimes(1);

    const toHttp = jest.fn(async () => response(301, '', { location: 'http://edt.example.fr/cal' }));
    expect(await failure(fetchFeed('https://edt.example.fr/cal', deps({ fetchImpl: toHttp as never })))).toBe(
      'not_https',
    );

    let n = 0;
    const loop = jest.fn(async () => response(302, '', { location: `/next-${n++}` }));
    expect(await failure(fetchFeed('https://edt.example.fr/cal', deps({ fetchImpl: loop as never })))).toBe(
      'unavailable',
    );
    expect(loop).toHaveBeenCalledTimes(4);

    const once = jest
      .fn()
      .mockResolvedValueOnce(response(302, '', { location: '/real.ics' }))
      .mockResolvedValueOnce(response(200, ICS));
    expect(await fetchFeed('https://edt.example.fr/cal', deps({ fetchImpl: once as never }))).toMatchObject({
      text: ICS,
    });
    expect(once.mock.calls[1][0]).toBe('https://edt.example.fr/real.ics');
  });

  it.each([
    [401, 'access_denied'],
    [403, 'access_denied'],
    [404, 'not_found'],
    [410, 'not_found'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [504, 'timeout'],
  ])('HTTP %i → %s', async (status, expected) => {
    expect(
      await failure(
        fetchFeed('https://edt.example.fr/cal', deps({ fetchImpl: (async () => response(status, 'x')) as never })),
      ),
    ).toBe(expected);
  });

  it('a feed that never answers is cut after the timeout', async () => {
    const hanging = (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    expect(
      await failure(fetchFeed('https://edt.example.fr/cal', deps({ fetchImpl: hanging as never, timeoutMs: 20 }))),
    ).toBe('timeout');
  });

  it('too big: refused from its declared size or while reading', async () => {
    const declared = deps({
      fetchImpl: (async () => response(200, ICS, { 'content-length': String(50 * 1024 * 1024) })) as never,
    });
    expect(await failure(fetchFeed('https://edt.example.fr/cal', declared))).toBe('too_large');
    const streamed = deps({ fetchImpl: (async () => response(200, ICS + 'X'.repeat(5000))) as never, maxBytes: 1000 });
    expect(await failure(fetchFeed('https://edt.example.fr/cal', streamed))).toBe('too_large');
  });

  it('recognises an iCalendar body', () => {
    expect(looksLikeIcs('﻿\r\nBEGIN:VCALENDAR\r\nEND:VCALENDAR')).toBe(true);
    expect(looksLikeIcs('begin:vcalendar\nend:vcalendar')).toBe(true);
    expect(looksLikeIcs('<html>BEGIN:VCALENDAR\n')).toBe(false);
  });
});
