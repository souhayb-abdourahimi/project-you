// Minimal comparison of the free Workers AI vision models for analyze-meal (D-048), run by the
// owner on real meal photos (the cloud sandbox cannot reach Cloudflare):
//
//   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_AI_TOKEN=… npx tsx scripts/vision/compare-cloudflare.ts photo1.jpg photo2.jpg
//
// Same prompt and catalogue as the Edge Function. Prints, per model and photo: HTTP status, time,
// foods found (catalogue id + grams), tokens used. Nothing is written anywhere; the token is read
// from the environment and never printed. Llama 3.2 Vision asks once for its licence: run with
// AGREE_LLAMA=1 to send Meta's "agree" first (you accept the Llama 3.2 licence by doing so).
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

import { FOOD_CATALOG } from '../../src/domain/meals/catalog';
import { MEAL_DETECTION_SCHEMA, visionPrompt } from '../../supabase/functions/analyze-meal/vision.ts';

/** The catalogue the app sends (ids and French names), as in useMealAnalysis. */
const FOOD_CATALOG_FOR_VISION = FOOD_CATALOG.map((f) => ({ id: f.id, name: f.name.fr }));

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_AI_TOKEN;
if (!account || !token) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN (API token with Workers AI permission).');
  process.exit(1);
}
const photos = process.argv.slice(2);
if (photos.length === 0) {
  console.error('Give one or more meal photos (JPEG, PNG or WebP, under 1.5 MB).');
  process.exit(1);
}

const MODELS = (process.env.MODELS ?? '')
  .split(',')
  .map((m: string) => m.trim())
  .filter(Boolean);
if (MODELS.length === 0)
  MODELS.push(
    '@cf/mistralai/mistral-small-3.1-24b-instruct',
    '@cf/meta/llama-4-scout-17b-16e-instruct',
    '@cf/meta/llama-3.2-11b-vision-instruct',
  );

const url = (model: string) => `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`;
const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const prompt = visionPrompt(FOOD_CATALOG_FOR_VISION);

async function main() {
  if (process.env.AGREE_LLAMA === '1')
    await fetch(url('@cf/meta/llama-3.2-11b-vision-instruct'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt: 'agree' }),
    });

  for (const photo of photos) {
    const type = TYPES[extname(photo).toLowerCase()];
    if (!type) {
      console.log(`${photo}: skipped (not JPEG/PNG/WebP)`);
      continue;
    }
    const base64 = readFileSync(photo).toString('base64');
    console.log(`\n== ${photo} (${Math.round((base64.length * 3) / 4 / 1024)} KB)`);
    for (const model of MODELS) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const response = await fetch(url(model), {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            messages: [
              { role: 'system', content: prompt },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'List the foods of this meal as JSON.' },
                  { type: 'image_url', image_url: { url: `data:${type};base64,${base64}` } },
                ],
              },
            ],
            guided_json: MEAL_DETECTION_SCHEMA,
            temperature: 0,
            max_tokens: 700,
          }),
        });
        const ms = Date.now() - started;
        const json = await response.json().catch(() => null);
        const answer = json?.result?.response;
        const parsed = typeof answer === 'string' ? safeJson(answer) : answer;
        const items = Array.isArray(parsed?.items) ? parsed.items : null;
        const usage = json?.result?.usage;
        console.log(
          `${model}\n  HTTP ${response.status} · ${ms} ms · ${usage ? `${usage.prompt_tokens} in / ${usage.completion_tokens} out tokens` : 'no usage'}`,
        );
        if (!response.ok)
          console.log(
            `  error: ${(json?.errors ?? []).map((e: { code: number; message: string }) => `${e.code} ${e.message}`).join('; ')}`,
          );
        else if (!items) console.log('  unusable answer (no items list)');
        else
          for (const i of items as { foodId?: string; grams?: number; confidence?: number; label?: string }[])
            console.log(
              `  - ${i.foodId ?? '(no match)'} · ${i.grams ?? '?'} g · conf ${i.confidence ?? '?'} · "${i.label}"`,
            );
      } catch (error) {
        console.log(
          `${model}\n  ${controller.signal.aborted ? 'timeout after 60 s' : `network error: ${(error as Error).message}`}`,
        );
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

void main();

function safeJson(text: string): { items?: unknown } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  try {
    return start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
  } catch {
    return null;
  }
}
