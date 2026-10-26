// Supabase Edge Function (Deno). Deploy: `supabase functions deploy places-nearby` (JWT required).
// Optional secret GEOAPIFY_API_KEY (D-051): Geoapify first, Overpass as fallback; without it,
// Overpass only. The key stays on the server: never logged, never returned, never sent to the app.
// Nothing about the request (position, query) is logged.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { callGeoapify, geoapifyUrl } from './geoapify.ts';
import { callOverpass, handlePlacesNearby, type PlacesBody } from './handler.ts';

const env = (name: string) => Deno.env.get(name) || undefined;
/** The project's public key: the legacy anon key, or the first publishable key (new API keys). */
function publicKey() {
  const anon = env('SUPABASE_ANON_KEY');
  if (anon) return anon;
  try {
    const keys = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>;
    return Object.values(keys).find((k) => typeof k === 'string' && k.length > 0);
  } catch {
    return undefined;
  }
}
// Created on the first request, never at boot: a missing key is a clear 503, not a BOOT_ERROR (D-048).
let auth: ReturnType<typeof createClient> | null = null;
function authClient() {
  const url = env('SUPABASE_URL');
  const key = publicKey();
  if (!url || !key) return null;
  auth ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return auth;
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const USER_AGENT =
  'ProjectYou/1.0 (fitness and nutrition coach; nearby places search; +https://github.com/souhayb-abdourahimi/project-you)';

// Per-instance quota and a 10-minute cache of answers by rounded area (no position is kept longer).
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 60;
const calls = new Map<string, number[]>();
const CACHE_MS = 10 * 60 * 1000;
const answers = new Map<string, { at: number; body: PlacesBody }>();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const client = authClient();
  if (!client)
    return new Response(JSON.stringify({ error: 'not_configured', missing: ['SUPABASE_ANON_KEY'] }), {
      status: 503,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  const body = req.method === 'POST' ? await req.json().catch(() => null) : null;
  const geoapifyKey = env('GEOAPIFY_API_KEY');
  const result = await handlePlacesNearby(
    { method: req.method, authorization: req.headers.get('Authorization'), body },
    {
      getUserId: async (token) => (await client.auth.getUser(token)).data.user?.id ?? null,
      overpass: (query) => callOverpass(query, { userAgent: USER_AGENT }),
      ...(geoapifyKey
        ? {
            geoapify: (kind, at, radius, lang) =>
              callGeoapify(geoapifyUrl(kind, at, radius, geoapifyKey, lang), kind, at),
          }
        : {}),
      allow: async (userId) => {
        const now = Date.now();
        const recent = (calls.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
        if (recent.length >= MAX_PER_WINDOW) return false;
        calls.set(userId, [...recent, now]);
        return true;
      },
      cache: {
        get: (key) => {
          const hit = answers.get(key);
          return hit && Date.now() - hit.at < CACHE_MS ? hit.body : undefined;
        },
        set: (key, value) => {
          if (answers.size > 500) answers.clear();
          answers.set(key, { at: Date.now(), body: value });
        },
      },
    },
  );
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
