import type { CalendarBusyEvent } from '@/domain/calendar/calendar';
import { supabase } from '@/services/supabase';
import type { CalendarFeedIssue, CalendarFeedLink } from '@/state/calendarFeed';

/**
 * The iCal link (D-049) through the `calendar-feed` Edge Function: the server fetches and parses
 * the feed (the browser never does: SSRF guards, no CORS issue, the link stays sealed) and keeps
 * only busy times. Reading, switching off and deleting the link go straight to the user's row
 * (RLS); the sealed link column is never read by the app.
 */
export type FeedSummary = { host: string; eventCount: number; busyCount: number; truncated: boolean; syncedAt: string };

export type FeedResult<T> = { status: 'ok'; data: T } | { status: 'error'; issue: CalendarFeedIssue };

export type InvokeCalendarFeed = (body: Record<string, unknown>) => Promise<{ status: number; data: unknown }>;

const ISSUES: CalendarFeedIssue[] = [
  'invalid_url',
  'not_https',
  'blocked_address',
  'timeout',
  'access_denied',
  'not_found',
  'not_ics',
  'too_large',
  'unavailable',
  'not_configured',
  'too_many_requests',
];

/** The user's zone, for times the feed gives without one (never their position). */
const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

function issueOf(status: number, data: unknown): CalendarFeedIssue {
  const code =
    data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : null;
  if (status === 401) return 'auth';
  if (status === 404 && code !== 'no_feed') return 'not_deployed';
  if (code && (ISSUES as string[]).includes(code)) return code as CalendarFeedIssue;
  if (status === 504) return 'timeout';
  if (status === 429) return 'too_many_requests';
  return 'unavailable';
}

const isRange = (r: unknown): r is CalendarBusyEvent =>
  !!r &&
  typeof r === 'object' &&
  typeof (r as CalendarBusyEvent).start === 'string' &&
  typeof (r as CalendarBusyEvent).end === 'string' &&
  typeof (r as CalendarBusyEvent).allDay === 'boolean';

/** Keeps only the three time fields: anything else a response might carry is dropped. */
export const busyOnly = (list: unknown): CalendarBusyEvent[] =>
  Array.isArray(list) ? list.filter(isRange).map(({ start, end, allDay }) => ({ start, end, allDay })) : [];

function summaryOf(data: unknown): (FeedSummary & { busy: CalendarBusyEvent[] }) | null {
  if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.host !== 'string' || typeof d.eventCount !== 'number' || typeof d.syncedAt !== 'string') return null;
  return {
    host: d.host,
    eventCount: d.eventCount,
    busyCount: typeof d.busyCount === 'number' ? d.busyCount : 0,
    truncated: d.truncated === true,
    syncedAt: d.syncedAt,
    busy: busyOnly(d.busy),
  };
}

const invokeSupabase: InvokeCalendarFeed = async (body) => {
  if (!supabase) return { status: 503, data: { error: 'not_configured' } };
  const { data, error } = await supabase.functions.invoke('calendar-feed', { body });
  if (!error) return { status: 200, data };
  const response = (error as { context?: unknown }).context;
  if (response instanceof Response) return { status: response.status, data: await response.json().catch(() => null) };
  throw error;
};

let invoke: InvokeCalendarFeed = invokeSupabase;
/** Tests only. */
export function setInvokeCalendarFeed(fn: InvokeCalendarFeed | null) {
  invoke = fn ?? invokeSupabase;
}

async function call(action: 'test' | 'save' | 'refresh', url?: string) {
  try {
    const { status, data } = await invoke({ action, url, timeZone: timeZone() });
    if (status !== 200) return { status: 'error', issue: issueOf(status, data) } as const;
    const summary = summaryOf(data);
    return summary ? ({ status: 'ok', data: summary } as const) : ({ status: 'error', issue: 'unavailable' } as const);
  } catch {
    return { status: 'error', issue: 'offline' } as const;
  }
}

export const calendarFeedProvider = {
  /** Fetches and counts, stores nothing. */
  test: (url: string) => call('test', url),
  /** Seals and keeps the link, and the busy times of the coming weeks. */
  save: (url: string) => call('save', url),
  refresh: () => call('refresh'),

  /** The account's link, without the sealed URL. */
  async load(): Promise<FeedResult<CalendarFeedLink | null>> {
    if (!supabase) return { status: 'error', issue: 'not_configured' };
    const { data, error } = await supabase
      .from('calendar_feeds')
      .select('url_host, enabled, busy, event_count, last_synced_at, last_error')
      .maybeSingle();
    if (error) return { status: 'error', issue: 'unavailable' };
    if (!data) return { status: 'ok', data: null };
    return {
      status: 'ok',
      data: {
        host: data.url_host,
        enabled: data.enabled,
        busy: busyOnly(data.busy),
        eventCount: data.event_count ?? 0,
        syncedAt: data.last_synced_at,
        issue: data.last_error && (ISSUES as string[]).includes(data.last_error) ? data.last_error : null,
      },
    };
  },

  async setEnabled(userId: string, enabled: boolean): Promise<FeedResult<null>> {
    if (!supabase) return { status: 'error', issue: 'not_configured' };
    const { error } = await supabase.from('calendar_feeds').update({ enabled }).eq('user_id', userId);
    return error ? { status: 'error', issue: 'unavailable' } : { status: 'ok', data: null };
  },

  /** Deletes the sealed link and every busy time kept with it. */
  async remove(userId: string): Promise<FeedResult<null>> {
    if (!supabase) return { status: 'error', issue: 'not_configured' };
    const { error } = await supabase.from('calendar_feeds').delete().eq('user_id', userId);
    return error ? { status: 'error', issue: 'unavailable' } : { status: 'ok', data: null };
  },
};
