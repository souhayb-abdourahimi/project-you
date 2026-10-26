// Supabase Edge Function (Deno). Deploy: `supabase functions deploy calendar-feed` (JWT required).
// Secret: CALENDAR_FEED_KEY (32 random bytes, base64: `openssl rand -base64 32`), server only.
// Table: public.calendar_feeds (migration 20261026000001), written with the caller's JWT (RLS).
// Nothing about the request is logged: not the link (it may carry a personal token), not the feed.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { decryptUrl, encryptUrl, importFeedKey } from './crypto.ts';
import { fetchFeed } from './fetch-feed.ts';
import { CALENDAR_FEED_VERSION, handleCalendarFeed, type FeedPatch } from './handler.ts';
import { parseBusy } from './ics.ts';

const env = (key: string) => Deno.env.get(key);
const USER_AGENT = 'ProjectYou/1.0 (fitness coach; reads busy times of a calendar the user linked)';
const key = await importFeedKey(env('CALENDAR_FEED_KEY'));

function publicKey(): string | undefined {
  const anon = env('SUPABASE_ANON_KEY');
  if (anon) return anon;
  try {
    const keys = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>;
    return Object.values(keys).find((k) => typeof k === 'string' && k.length > 0);
  } catch {
    return undefined;
  }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function resolve(host: string): Promise<string[]> {
  const [v4, v6] = await Promise.all([
    Deno.resolveDns(host, 'A').catch(() => [] as string[]),
    Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
  ]);
  return [...v4, ...v6];
}

// A small per-instance quota (each test or refresh fetches a remote calendar).
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const calls = new Map<string, number[]>();
async function allow(userId: string) {
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return false;
  calls.set(userId, [...recent, now]);
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const headers = { ...cors, 'Content-Type': 'application/json' };
  const url = env('SUPABASE_URL');
  const anon = publicKey();
  if (!url || !anon)
    return new Response(
      JSON.stringify({ error: 'not_configured', missing: ['SUPABASE_ANON_KEY'], version: CALENDAR_FEED_VERSION }),
      { status: 503, headers },
    );
  const authorization = req.headers.get('Authorization');
  // The caller's own JWT: every read and write below goes through RLS.
  const db = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: authorization ? { Authorization: authorization } : {} },
  });
  const body = await req.json().catch(() => null);
  const result = await handleCalendarFeed(
    { method: req.method, authorization, body },
    {
      getUserId: async (token) => (await db.auth.getUser(token)).data.user?.id ?? null,
      encrypt: key ? (link, userId) => encryptUrl(key, link, userId) : null,
      decrypt: async (sealed, userId) => (key ? decryptUrl(key, sealed, userId) : null),
      fetchFeed: (link) => fetchFeed(link, { fetchImpl: fetch, resolve, userAgent: USER_AGENT }),
      parse: parseBusy,
      read: async (userId) => {
        const { data } = await db
          .from('calendar_feeds')
          .select('url_ciphertext, url_host, enabled')
          .eq('user_id', userId)
          .maybeSingle();
        return data;
      },
      write: async (userId, patch: FeedPatch) => {
        const { error } = patch.url_ciphertext
          ? await db.from('calendar_feeds').upsert({ user_id: userId, ...patch })
          : await db.from('calendar_feeds').update(patch).eq('user_id', userId);
        if (error) throw new Error('store');
      },
      allow,
    },
  ).catch(() => ({ status: 500, body: { error: 'unavailable' } }));
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
});
