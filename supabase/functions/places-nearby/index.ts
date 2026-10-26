// Supabase Edge Function (Deno). Deploy: `supabase functions deploy places-nearby` (JWT required).
// No secret. Nothing about the request (position, query) is logged.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { callOverpass, handlePlacesNearby, type PlacesBody } from './handler.ts';

const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const USER_AGENT = 'ProjectYou/1.0 (fitness and nutrition coach; nearby places search; +https://github.com/souhayb-abdourahimi/project-you)';

// Per-instance quota and a 10-minute cache of answers by rounded area (no position is kept longer).
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 60;
const calls = new Map<string, number[]>();
const CACHE_MS = 10 * 60 * 1000;
const answers = new Map<string, { at: number; body: PlacesBody }>();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => null);
  const result = await handlePlacesNearby(
    { method: req.method, authorization: req.headers.get('Authorization'), body },
    {
      getUserId: async (token) => (await auth.auth.getUser(token)).data.user?.id ?? null,
      overpass: (query) => callOverpass(query, { userAgent: USER_AGENT }),
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
