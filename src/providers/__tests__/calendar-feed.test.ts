import { busyOnly, calendarFeedProvider, setInvokeCalendarFeed } from '../calendar-feed';

jest.mock('@/services/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));

const summary = {
  ok: true,
  host: 'edt.example.fr',
  eventCount: 3,
  busyCount: 2,
  from: '2026-10-25T00:00:00.000Z',
  to: '2026-12-07T00:00:00.000Z',
  truncated: false,
  syncedAt: '2026-10-26T08:00:00.000Z',
};

afterEach(() => setInvokeCalendarFeed(null));

describe('calendarFeedProvider', () => {
  it('sends the action, the link and the device time zone, and reads the summary', async () => {
    const invoke = jest.fn(async (_body: unknown) => ({ status: 200, data: summary }));
    setInvokeCalendarFeed(invoke);
    const r = await calendarFeedProvider.test('webcal://edt.example.fr/a.ics');
    expect(invoke.mock.calls[0][0]).toEqual({
      action: 'test',
      url: 'webcal://edt.example.fr/a.ics',
      timeZone: expect.any(String),
    });
    expect(r).toEqual({
      status: 'ok',
      data: expect.objectContaining({ host: 'edt.example.fr', eventCount: 3, truncated: false, busy: [] }),
    });
  });

  it('keeps only the times of busy ranges, whatever else a response carries', async () => {
    setInvokeCalendarFeed(async () => ({
      status: 200,
      data: {
        ...summary,
        busy: [
          { start: '2026-10-27T07:00:00Z', end: '2026-10-27T12:00:00Z', allDay: false, title: 'Maths' },
          { start: 'x' },
          'nope',
        ],
      },
    }));
    const r = await calendarFeedProvider.save('https://edt.example.fr/a.ics');
    expect(r.status === 'ok' && r.data.busy).toEqual([
      { start: '2026-10-27T07:00:00Z', end: '2026-10-27T12:00:00Z', allDay: false },
    ]);
    expect(busyOnly(null)).toEqual([]);
  });

  it.each([
    [400, { error: 'invalid_url' }, 'invalid_url'],
    [400, { error: 'not_https' }, 'not_https'],
    [422, { error: 'blocked_address' }, 'blocked_address'],
    [422, { error: 'access_denied' }, 'access_denied'],
    [422, { error: 'not_found' }, 'not_found'],
    [422, { error: 'not_ics' }, 'not_ics'],
    [422, { error: 'too_large' }, 'too_large'],
    [422, { error: 'unavailable' }, 'unavailable'],
    [504, { error: 'timeout' }, 'timeout'],
    [504, null, 'timeout'],
    [503, { error: 'not_configured', missing: ['CALENDAR_FEED_KEY'] }, 'not_configured'],
    [429, { error: 'too_many_requests' }, 'too_many_requests'],
    [401, { error: 'unauthorized' }, 'auth'],
    [404, null, 'not_deployed'],
    [404, { error: 'no_feed' }, 'unavailable'],
    [500, 'boom', 'unavailable'],
  ])('maps HTTP %i %j to the issue %s', async (status, data, issue) => {
    setInvokeCalendarFeed(async () => ({ status, data }));
    expect(await calendarFeedProvider.refresh()).toEqual({ status: 'error', issue });
  });

  it('a malformed success is not trusted', async () => {
    setInvokeCalendarFeed(async () => ({ status: 200, data: { ok: true, host: 3 } }));
    expect(await calendarFeedProvider.test('https://a.example/x.ics')).toEqual({
      status: 'error',
      issue: 'unavailable',
    });
  });

  it('a network failure says offline', async () => {
    setInvokeCalendarFeed(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await calendarFeedProvider.test('https://a.example/x.ics')).toEqual({ status: 'error', issue: 'offline' });
  });

  it('without an account service, reading, switching off and deleting say not configured', async () => {
    expect(await calendarFeedProvider.load()).toEqual({ status: 'error', issue: 'not_configured' });
    expect(await calendarFeedProvider.setEnabled('u', false)).toEqual({ status: 'error', issue: 'not_configured' });
    expect(await calendarFeedProvider.remove('u')).toEqual({ status: 'error', issue: 'not_configured' });
  });
});
