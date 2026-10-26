/**
 * Fetches an iCal feed safely (D-049): HTTPS only, every hop checked by the guard, every resolved
 * address public, at most 3 redirects, a short timeout, a size cap read as it streams, and the body
 * must look like iCalendar whatever its content type (HTML login pages are refused). The remote
 * content is only ever parsed as text, never executed. The link and the body are never logged.
 */
import { checkUrl, hostOf, isIpLiteral, isPublicIp, readFeedUrl } from './guard.ts';

export type FeedFailure =
  | 'invalid_url'
  | 'not_https'
  | 'blocked_address'
  | 'timeout'
  | 'access_denied'
  | 'not_found'
  | 'not_ics'
  | 'too_large'
  | 'unavailable';

export class FeedError extends Error {
  readonly failure: FeedFailure;
  constructor(failure: FeedFailure) {
    super(`feed ${failure}`);
    this.failure = failure;
  }
}

export interface FetchFeedDeps {
  fetchImpl: typeof fetch;
  /** Every IPv4 and IPv6 address of a host name (empty when it does not resolve). */
  resolve: (host: string) => Promise<string[]>;
  userAgent: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export const FEED_TIMEOUT_MS = 8_000;
export const FEED_MAX_BYTES = 3 * 1024 * 1024;
export const FEED_MAX_REDIRECTS = 3;

async function assertPublic(url: URL, resolve: FetchFeedDeps['resolve']) {
  const checked = checkUrl(url);
  if (!checked.ok) throw new FeedError(checked.failure);
  const host = hostOf(url);
  if (isIpLiteral(host)) return;
  const addresses = await resolve(host).catch(() => [] as string[]);
  // Unknown host, or any address inside a private network: refused (DNS pointing inside is the
  // classic SSRF trick).
  if (addresses.length === 0) throw new FeedError('not_found');
  if (!addresses.every(isPublicIp)) throw new FeedError('blocked_address');
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new FeedError('too_large');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new FeedError('too_large');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(all);
}

/** True when the text is an iCalendar object (a BOM and blank lines are allowed before it). */
export function looksLikeIcs(text: string): boolean {
  return /^﻿?\s*BEGIN:VCALENDAR\r?\n/i.test(text);
}

export async function fetchFeed(raw: unknown, deps: FetchFeedDeps): Promise<{ text: string; host: string }> {
  const first = readFeedUrl(raw);
  if (!first.ok) throw new FeedError(first.failure);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? FEED_TIMEOUT_MS);
  try {
    let url = first.url;
    for (let hop = 0; ; hop++) {
      await assertPublic(url, deps.resolve);
      let response: Response;
      try {
        response = await deps.fetchImpl(url.href, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { Accept: 'text/calendar, text/plain;q=0.5, */*;q=0.1', 'User-Agent': deps.userAgent },
        });
      } catch {
        throw new FeedError(controller.signal.aborted ? 'timeout' : 'unavailable');
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => undefined);
        if (!location || hop >= (deps.maxRedirects ?? FEED_MAX_REDIRECTS)) throw new FeedError('unavailable');
        try {
          url = new URL(location, url);
        } catch {
          throw new FeedError('invalid_url');
        }
        continue;
      }
      if (response.status === 401 || response.status === 403) throw new FeedError('access_denied');
      if (response.status === 404 || response.status === 410) throw new FeedError('not_found');
      if (response.status === 408 || response.status === 504) throw new FeedError('timeout');
      if (!response.ok) throw new FeedError('unavailable');
      let text: string;
      try {
        text = await readCapped(response, deps.maxBytes ?? FEED_MAX_BYTES);
      } catch (error) {
        if (error instanceof FeedError) throw error;
        throw new FeedError(controller.signal.aborted ? 'timeout' : 'unavailable');
      }
      if (!looksLikeIcs(text)) throw new FeedError('not_ics');
      return { text, host: hostOf(first.url) };
    }
  } finally {
    clearTimeout(timer);
  }
}
