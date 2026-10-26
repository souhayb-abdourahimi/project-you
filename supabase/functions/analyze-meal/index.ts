// Supabase Edge Function (Deno). Deploy: `supabase functions deploy analyze-meal`.
// Secrets (server only, never in the app), docs/MEAL_PHOTO_ANALYSIS.md:
// - MEAL_VISION_PROVIDER: `openai`, `anthropic`, `cloudflare`, or an ordered list
//   (`openai,cloudflare`: the next provider answers when the first one fails);
// - openai: OPENAI_API_KEY + MEAL_VISION_MODEL; anthropic: ANTHROPIC_API_KEY + MEAL_VISION_MODEL
//   (or MEAL_VISION_ANTHROPIC_MODEL); cloudflare (free): CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN,
//   optional MEAL_VISION_CLOUDFLARE_MODEL.
// Missing ones: 503 not_configured with their names. GET with a signed-in token: which providers
// are live and which secrets are missing (names only).
import { createClient } from 'npm:@supabase/supabase-js@2';

import { ANALYZE_MEAL_VERSION, handleAnalyzeMeal } from './handler.ts';
import { visionChainFromEnv } from './vision.ts';

const env = (key: string) => Deno.env.get(key);
const chain = visionChainFromEnv(env);

/** The project's public key: the legacy anon key, or the first new publishable key. */
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

// Built at the first request and never at boot: a missing setting answers a clear error instead
// of a gateway BOOT_ERROR (seen by the app as "service unavailable").
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
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// A small per-instance quota (best effort; a shared quota table can replace it before launch).
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;
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
  const body = req.method === 'POST' ? await req.json().catch(() => null) : null;
  const client = authClient();
  const headers = { ...cors, 'Content-Type': 'application/json' };
  if (!client)
    return new Response(
      JSON.stringify({ error: 'not_configured', missing: ['SUPABASE_ANON_KEY'], version: ANALYZE_MEAL_VERSION }),
      { status: 503, headers },
    );
  const result = await handleAnalyzeMeal(
    { method: req.method, authorization: req.headers.get('Authorization'), body },
    {
      getUserId: async (token) => (await client.auth.getUser(token)).data.user?.id ?? null,
      models: chain.models,
      missing: chain.missing,
      allow,
      // Each provider gets 25 s, the chain 45 s: under the app's 50 s and the platform limit.
      timeoutMs: 25_000,
      totalTimeoutMs: 45_000,
    },
  );
  // Nothing about the request (photo, foods) is logged.
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
});
