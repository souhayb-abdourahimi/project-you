/**
 * `calendar-feed` (D-049, docs/CALENDAR_FEED.md): test, save and refresh the user's iCal link.
 * Runtime-agnostic (Jest); `index.ts` wires Deno, Supabase Auth, the table and the secrets.
 *
 * - Only an authenticated user, only their own row (RLS, with their own JWT).
 * - The link is fetched here, never by the app's browser (SSRF guards in guard.ts/fetch-feed.ts),
 *   stored encrypted, never returned and never logged.
 * - Only busy ranges are kept: no event title or detail ever leaves `ics.ts`.
 */
import type { FeedFailure } from './fetch-feed.ts';
import { FeedError } from './fetch-feed.ts';
import type { BusyRange, ParsedFeed } from './ics.ts';

export const CALENDAR_FEED_VERSION = '2026-10-26';
/** The planning window kept: from yesterday to six weeks ahead. */
export const WINDOW_PAST_MS = 24 * 3600_000;
export const WINDOW_AHEAD_MS = 42 * 24 * 3600_000;

export interface FeedRow {
  url_ciphertext: string;
  url_host: string;
  enabled: boolean;
}

export interface FeedPatch {
  url_ciphertext?: string;
  url_host?: string;
  enabled?: boolean;
  status: 'ok' | 'error';
  last_error: FeedFailure | null;
  last_synced_at?: string;
  busy?: BusyRange[];
  busy_from?: string;
  busy_to?: string;
  event_count?: number;
}

export interface CalendarFeedDeps {
  getUserId: (token: string) => Promise<string | null>;
  /** Null when CALENDAR_FEED_KEY is missing or invalid. */
  encrypt: ((url: string, userId: string) => Promise<string>) | null;
  decrypt: (sealed: string, userId: string) => Promise<string | null>;
  fetchFeed: (url: string) => Promise<{ text: string; host: string }>;
  parse: (text: string, options: { from: Date; to: Date; timeZone: string }) => ParsedFeed;
  /** The user's row (with their JWT: RLS applies). */
  read: (userId: string) => Promise<FeedRow | null>;
  write: (userId: string, patch: FeedPatch) => Promise<void>;
  allow?: (userId: string) => Promise<boolean>;
  now?: () => Date;
}

export type FeedSummary = {
  host: string;
  eventCount: number;
  busyCount: number;
  from: string;
  to: string;
  truncated: boolean;
  syncedAt: string;
};

export type CalendarFeedBody =
  | ({ ok: true } & FeedSummary)
  | ({ ok: true; busy: BusyRange[] } & FeedSummary)
  | { error: 'method_not_allowed' | 'unauthorized' | 'invalid_request' | 'too_many_requests' | 'no_feed' }
  | { error: 'not_configured'; missing: string[]; version: string }
  | { error: FeedFailure };

export interface CalendarFeedResponse {
  status: number;
  body: CalendarFeedBody;
}

const failureStatus = (failure: FeedFailure) =>
  failure === 'timeout' ? 504 : failure === 'invalid_url' || failure === 'not_https' ? 400 : 422;

function readBody(body: unknown): { action: 'test' | 'save' | 'refresh'; url?: string; timeZone: string } | null {
  if (!body || typeof body !== 'object') return null;
  const { action, url, timeZone } = body as Record<string, unknown>;
  if (action !== 'test' && action !== 'save' && action !== 'refresh') return null;
  if (action !== 'refresh' && typeof url !== 'string') return null;
  const zone = typeof timeZone === 'string' && /^[A-Za-z0-9_+\-/]{1,64}$/.test(timeZone) ? timeZone : 'UTC';
  return { action, url: action === 'refresh' ? undefined : (url as string), timeZone: zone };
}

export async function handleCalendarFeed(
  request: { method: string; authorization: string | null; body: unknown },
  deps: CalendarFeedDeps,
): Promise<CalendarFeedResponse> {
  if (request.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };
  const token = request.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return { status: 401, body: { error: 'unauthorized' } };
  const userId = await deps.getUserId(token).catch(() => null);
  if (!userId) return { status: 401, body: { error: 'unauthorized' } };
  const input = readBody(request.body);
  if (!input) return { status: 400, body: { error: 'invalid_request' } };
  if (input.action !== 'test' && !deps.encrypt)
    return {
      status: 503,
      body: { error: 'not_configured', missing: ['CALENDAR_FEED_KEY'], version: CALENDAR_FEED_VERSION },
    };
  if (deps.allow && !(await deps.allow(userId).catch(() => false)))
    return { status: 429, body: { error: 'too_many_requests' } };

  let url = input.url;
  if (input.action === 'refresh') {
    const row = await deps.read(userId);
    if (!row) return { status: 404, body: { error: 'no_feed' } };
    url = (await deps.decrypt(row.url_ciphertext, userId)) ?? undefined;
    if (!url) {
      // Altered, or encrypted with another key: the user pastes the link again.
      await deps.write(userId, { status: 'error', last_error: 'invalid_url' as FeedFailure });
      return { status: 422, body: { error: 'invalid_url' } };
    }
  }

  const now = (deps.now ?? (() => new Date()))();
  const from = new Date(now.getTime() - WINDOW_PAST_MS);
  const to = new Date(now.getTime() + WINDOW_AHEAD_MS);
  let summary: FeedSummary;
  let busy: BusyRange[];
  let host: string;
  try {
    const feed = await deps.fetchFeed(url!);
    host = feed.host;
    let parsed: ParsedFeed;
    try {
      parsed = deps.parse(feed.text, { from, to, timeZone: input.timeZone });
    } catch {
      throw new FeedError('not_ics');
    }
    busy = parsed.busy;
    summary = {
      host,
      eventCount: parsed.eventCount,
      busyCount: parsed.busy.length,
      from: from.toISOString(),
      to: to.toISOString(),
      truncated: parsed.truncated,
      syncedAt: now.toISOString(),
    };
  } catch (error) {
    const failure: FeedFailure = error instanceof FeedError ? error.failure : 'unavailable';
    // A refresh that fails keeps the last busy times and says the link has a problem.
    if (input.action === 'refresh') await deps.write(userId, { status: 'error', last_error: failure });
    return { status: failureStatus(failure), body: { error: failure } };
  }

  if (input.action === 'test') return { status: 200, body: { ok: true, ...summary } };
  const patch: FeedPatch = {
    status: 'ok',
    last_error: null,
    last_synced_at: summary.syncedAt,
    busy,
    busy_from: summary.from,
    busy_to: summary.to,
    event_count: summary.eventCount,
  };
  if (input.action === 'save') {
    patch.url_ciphertext = await deps.encrypt!(url!, userId);
    patch.url_host = host;
    patch.enabled = true;
  }
  await deps.write(userId, patch);
  return { status: 200, body: { ok: true, busy, ...summary } };
}
