import type { Page, Route } from '@playwright/test';

/**
 * A fake Supabase project for the account-mode E2E build (`npm run build:web:e2e-account`, URL
 * https://e2e.supabase.test). Every request is answered by the page itself: nothing leaves the
 * test. Signed in as one MOCK user; the sync sees an empty account; `calendar_feeds` and the
 * `calendar-feed` function keep a tiny in-memory state so a whole iCal journey can be played.
 */
export const E2E_SUPABASE = 'https://e2e.supabase.test';
export const USER_ID = '00000000-0000-4000-8000-0000000000e2';

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
  sub: USER_ID,
  role: 'authenticated',
  exp: 4102444800,
})}.e2e`;
const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e@example.test',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-09-01T00:00:00Z',
};
const session = {
  access_token: accessToken,
  refresh_token: 'e2e-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  // Far in the future: the client never tries to refresh (2100-01-01).
  expires_at: 4102444800,
  user,
};

export interface FeedRow {
  url_host: string;
  enabled: boolean;
  busy: { start: string; end: string; allDay: boolean }[];
  event_count: number;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface MockState {
  feed: FeedRow | null;
  /** Bodies sent to the calendar-feed function, to check what the app sends. */
  calls: Record<string, unknown>[];
  /** The busy ranges the function answers with (times only, as the real one). */
  busy: FeedRow['busy'];
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS,HEAD',
  'access-control-expose-headers': 'content-range',
};

const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
  route.fulfill({
    status,
    headers: { ...cors, 'content-type': 'application/json', ...headers },
    body: body === undefined ? '' : JSON.stringify(body),
  });

/** Signs in (stored session) and answers every Supabase call. */
export async function mockAccount(page: Page, state: MockState) {
  await page.addInitScript((value) => {
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value));
  }, session);

  await page.route(`${E2E_SUPABASE}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname === '/auth/v1/user') return json(route, 200, user);
      if (url.pathname === '/auth/v1/token') return json(route, 200, session);
      return json(route, 204, undefined);
    }

    if (url.pathname === '/functions/v1/calendar-feed') return calendarFeed(route, state);

    if (url.pathname === '/rest/v1/calendar_feeds') {
      if (method === 'GET') {
        const single = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
        if (single) return state.feed ? json(route, 200, state.feed) : json(route, 406, { code: 'PGRST116' });
        return json(route, 200, state.feed ? [state.feed] : []);
      }
      if (method === 'PATCH') {
        if (state.feed) state.feed = { ...state.feed, ...(request.postDataJSON() as Partial<FeedRow>) };
        return json(route, 204, undefined);
      }
      if (method === 'DELETE') {
        state.feed = null;
        return json(route, 204, undefined);
      }
    }

    // The sync and everything else: an empty account that accepts writes.
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(route, 200, null);
    if (method === 'GET' || method === 'HEAD') return json(route, 200, [], { 'content-range': '*/0' });
    if (method === 'POST') return json(route, 201, []);
    return json(route, 204, undefined);
  });
}

/** The calendar-feed Edge Function, as its contract says (handler.ts). */
function calendarFeed(route: Route, state: MockState) {
  const body = route.request().postDataJSON() as { action: string; url?: string };
  state.calls.push(body);
  const summary = (host: string) => ({
    ok: true,
    host,
    eventCount: state.busy.length,
    busyCount: state.busy.length,
    from: '2026-09-27T00:00:00.000Z',
    to: '2026-11-09T00:00:00.000Z',
    truncated: false,
    syncedAt: new Date().toISOString(),
  });
  if (body.action === 'refresh') {
    if (!state.feed) return json(route, 404, { error: 'no_feed' });
    const s = summary(state.feed.url_host);
    state.feed = { ...state.feed, busy: state.busy, event_count: s.eventCount, last_synced_at: s.syncedAt };
    return json(route, 200, { ...s, busy: state.busy });
  }
  const raw = (body.url ?? '').trim().replace(/^webcal:\/\//i, 'https://');
  if (!/^https:\/\//i.test(raw)) return json(route, 400, { error: 'not_https' });
  const host = new URL(raw).hostname;
  if (host === 'localhost' || /^(10|127|192\.168)\./.test(host)) return json(route, 422, { error: 'blocked_address' });
  if (raw.includes('expired')) return json(route, 422, { error: 'access_denied' });
  if (raw.includes('login')) return json(route, 422, { error: 'not_ics' });
  const s = summary(host);
  if (body.action === 'test') return json(route, 200, s);
  state.feed = {
    url_host: host,
    enabled: true,
    busy: state.busy,
    event_count: s.eventCount,
    last_synced_at: s.syncedAt,
    last_error: null,
  };
  return json(route, 200, { ...s, busy: state.busy });
}
