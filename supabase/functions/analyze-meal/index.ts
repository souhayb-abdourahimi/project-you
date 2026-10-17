// Supabase Edge Function (Deno). Deploy: `supabase functions deploy analyze-meal`.
// Secrets (server only, never in the app): MEAL_VISION_PROVIDER=anthropic, ANTHROPIC_API_KEY,
// MEAL_VISION_MODEL. Without them the function answers 503 not_configured.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { handleAnalyzeMeal } from './handler.ts';
import { visionFromEnv } from './vision.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const model = visionFromEnv((key) => Deno.env.get(key));
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  const body = await req.json().catch(() => null);
  const result = await handleAnalyzeMeal(
    { method: req.method, authorization: req.headers.get('Authorization'), body },
    {
      getUserId: async (token) => (await auth.auth.getUser(token)).data.user?.id ?? null,
      model,
      allow,
      timeoutMs: 20_000,
    },
  );
  // Nothing about the request (photo, foods) is logged.
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
