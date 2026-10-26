/** calendar-feed function (D-049): test, save, refresh; the link stays sealed, only times are kept. */
import { webcrypto } from 'node:crypto';

import { decryptUrl, encryptUrl, importFeedKey } from '../crypto';
import { FeedError } from '../fetch-feed';
import { handleCalendarFeed, type CalendarFeedDeps, type FeedPatch, type FeedRow } from '../handler';
import { parseBusy } from '../ics';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const LINK = 'https://edt.univ-exemple.fr/direct_cal.jsp?data=PERSONAL_TOKEN';
const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:1',
  'DTSTART:20261027T080000Z',
  'DTEND:20261027T120000Z',
  'SUMMARY:Partiel de maths',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
const KEY = Buffer.alloc(32, 7).toString('base64');

async function setup(over: Partial<CalendarFeedDeps> = {}) {
  const key = (await importFeedKey(KEY))!;
  const rows = new Map<string, FeedRow & Partial<FeedPatch>>();
  const writes: FeedPatch[] = [];
  const fetchFeed = jest.fn(async () => ({ text: ICS, host: 'edt.univ-exemple.fr' }));
  const deps: CalendarFeedDeps = {
    getUserId: async (t) => (t === 'tok-a' ? 'user-a' : t === 'tok-b' ? 'user-b' : null),
    encrypt: (url, user) => encryptUrl(key, url, user),
    decrypt: (sealed, user) => decryptUrl(key, sealed, user),
    fetchFeed,
    parse: parseBusy,
    read: async (user) => rows.get(user) ?? null,
    write: async (user, patch) => {
      writes.push(patch);
      rows.set(user, { ...(rows.get(user) as FeedRow), ...patch } as FeedRow);
    },
    now: () => new Date('2026-10-26T09:00:00Z'),
    ...over,
  };
  const call = (body: unknown, token = 'tok-a') =>
    handleCalendarFeed({ method: 'POST', authorization: `Bearer ${token}`, body }, deps);
  return { call, rows, writes, fetchFeed, deps };
}

describe('calendar-feed', () => {
  it('requires a signed-in user and a known action', async () => {
    const { call } = await setup();
    expect((await call({ action: 'test', url: LINK }, 'nope')).status).toBe(401);
    expect((await call({ action: 'delete-everything' })).status).toBe(400);
    expect((await call({ action: 'test' })).status).toBe(400);
  });

  it('"Tester le lien": counts events and busy ranges, stores nothing', async () => {
    const { call, writes } = await setup();
    const r = await call({ action: 'test', url: LINK, timeZone: 'Europe/Paris' });
    expect(r).toEqual({
      status: 200,
      body: {
        ok: true,
        host: 'edt.univ-exemple.fr',
        eventCount: 1,
        busyCount: 1,
        from: '2026-10-25T09:00:00.000Z',
        to: '2026-12-07T09:00:00.000Z',
        truncated: false,
        syncedAt: '2026-10-26T09:00:00.000Z',
      },
    });
    expect(writes).toEqual([]);
    expect(JSON.stringify(r)).not.toMatch(/Partiel|PERSONAL_TOKEN/);
  });

  it('"Utiliser ce calendrier": stores the sealed link, the host and busy times, never the link or a title', async () => {
    const { call, rows } = await setup();
    const r = await call({ action: 'save', url: LINK });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      busy: [{ start: '2026-10-27T08:00:00.000Z', end: '2026-10-27T12:00:00.000Z', allDay: false }],
    });
    const row = rows.get('user-a')!;
    expect(row).toMatchObject({
      url_host: 'edt.univ-exemple.fr',
      enabled: true,
      status: 'ok',
      last_error: null,
      event_count: 1,
    });
    expect(row.url_ciphertext).toMatch(/^v1\./);
    const stored = JSON.stringify(row);
    expect(stored).not.toContain('PERSONAL_TOKEN');
    expect(stored).not.toContain('direct_cal');
    expect(stored).not.toContain('Partiel');
  });

  it('"Actualiser": reads the sealed link back and refreshes the busy times', async () => {
    const { call, fetchFeed } = await setup();
    await call({ action: 'save', url: LINK });
    const r = await call({ action: 'refresh' });
    expect(r.status).toBe(200);
    expect(fetchFeed).toHaveBeenLastCalledWith(LINK);
  });

  it('a refresh that fails keeps the last busy times and records the reason', async () => {
    const fetchFeed = jest
      .fn()
      .mockResolvedValueOnce({ text: ICS, host: 'edt.univ-exemple.fr' })
      .mockRejectedValueOnce(new FeedError('access_denied'));
    const { call, rows } = await setup({ fetchFeed });
    await call({ action: 'save', url: LINK });
    const r = await call({ action: 'refresh' });
    expect(r).toEqual({ status: 422, body: { error: 'access_denied' } });
    expect(rows.get('user-a')).toMatchObject({ status: 'error', last_error: 'access_denied', event_count: 1 });
    expect(rows.get('user-a')!.busy).toHaveLength(1);
  });

  it('another account cannot use a copied sealed link', async () => {
    const { call, rows } = await setup();
    await call({ action: 'save', url: LINK });
    rows.set('user-b', { ...rows.get('user-a')! });
    expect(await call({ action: 'refresh' }, 'tok-b')).toEqual({ status: 422, body: { error: 'invalid_url' } });
  });

  it('refresh without a link: no_feed', async () => {
    const { call } = await setup();
    expect(await call({ action: 'refresh' })).toEqual({ status: 404, body: { error: 'no_feed' } });
  });

  it('each feed problem has its own answer', async () => {
    for (const [failure, status] of [
      ['invalid_url', 400],
      ['not_https', 400],
      ['blocked_address', 422],
      ['not_ics', 422],
      ['too_large', 422],
      ['not_found', 422],
      ['timeout', 504],
    ] as const) {
      const { call } = await setup({ fetchFeed: async () => Promise.reject(new FeedError(failure)) });
      expect(await call({ action: 'test', url: LINK })).toEqual({ status, body: { error: failure } });
    }
    const { call } = await setup({ fetchFeed: async () => ({ text: 'BEGIN:VCALENDAR\r\nnonsense', host: 'x.fr' }) });
    expect((await call({ action: 'test', url: LINK })).body).toEqual({ error: 'not_ics' });
  });

  it('without CALENDAR_FEED_KEY a link cannot be saved (test still works); quota answered', async () => {
    const { call } = await setup({ encrypt: null });
    expect(await call({ action: 'save', url: LINK })).toMatchObject({
      status: 503,
      body: { missing: ['CALENDAR_FEED_KEY'] },
    });
    expect((await call({ action: 'test', url: LINK })).status).toBe(200);
    const limited = await setup({ allow: async () => false });
    expect(await limited.call({ action: 'test', url: LINK })).toEqual({
      status: 429,
      body: { error: 'too_many_requests' },
    });
  });
});

describe('sealed link', () => {
  it('round-trips for its owner only, refuses tampering and a wrong key', async () => {
    const key = (await importFeedKey(KEY))!;
    const sealed = await encryptUrl(key, LINK, 'user-a');
    expect(sealed).not.toContain('edt');
    expect(await decryptUrl(key, sealed, 'user-a')).toBe(LINK);
    expect(await decryptUrl(key, sealed, 'user-b')).toBeNull();
    expect(await decryptUrl(key, sealed.slice(0, -2) + 'AA', 'user-a')).toBeNull();
    const other = (await importFeedKey(Buffer.alloc(32, 9).toString('base64')))!;
    expect(await decryptUrl(other, sealed, 'user-a')).toBeNull();
    expect(await encryptUrl(key, LINK, 'user-a')).not.toBe(sealed); // fresh IV each time
  });

  it('a missing or short key is no key', async () => {
    expect(await importFeedKey(undefined)).toBeNull();
    expect(await importFeedKey(Buffer.alloc(16).toString('base64'))).toBeNull();
    expect(await importFeedKey('%%%')).toBeNull();
  });
});
