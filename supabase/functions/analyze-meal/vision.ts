/**
 * Vision model adapters for `analyze-meal`. The provider is a product decision (cost, latency,
 * data processing terms): it is chosen with the `MEAL_VISION_PROVIDER` secret, one provider or an
 * ordered list (`openai,cloudflare`: the next one answers when the first fails), and isolated
 * behind `VisionModel`, so changing it never touches the app. Every adapter sends the same prompt
 * and returns the same raw shape (foods, grams, confidence; never a nutrient), checked by the
 * handler. Vision identifies, Ciqual computes. Without the secrets the function answers
 * `not_configured` with the names of the missing secrets (never a value).
 */
import { VisionError, type CatalogEntry, type VisionFailure, type VisionInput, type VisionModel } from './handler.ts';

/**
 * What a provider's HTTP status means. The body is read only to tell a spent quota from a short
 * burst; it is never logged nor returned (it may echo request details).
 */
export function failureOf(status: number, body: string): VisionFailure {
  if (status === 401 || status === 403) return 'provider_auth';
  if (status === 402 || /insufficient_quota|billing|credit|neurons|daily free allocation|quota/i.test(body))
    return 'quota';
  if (status === 429) return 'rate_limited';
  if (status === 408 || status === 504 || status === 524) return 'timeout';
  if (status === 404) return 'model_not_found';
  if (status === 400 || status === 413 || status === 415 || status === 422) return 'bad_request';
  return 'unavailable';
}

async function fail(response: Response): Promise<never> {
  const body = typeof response.text === 'function' ? await response.text().catch(() => '') : '';
  throw new VisionError(failureOf(response.status, body), response.status);
}

export function visionPrompt(catalog: readonly CatalogEntry[]): string {
  return [
    'You identify the foods visible on a meal photo for a nutrition app.',
    'Answer with JSON only, exactly: {"items":[{"label":string,"foodId":string|null,"grams":number|null,"confidence":number|null}]}.',
    'label is the short name of the food as seen, without any number or nutrition fact.',
    'foodId must be one of the ids below, or null when no id clearly matches. Never invent an id.',
    'grams is your estimate of the edible portion, or null when you cannot estimate it.',
    'confidence is between 0 and 1, or null. At most 12 items. Do not return calories or macros.',
    'If the photo shows no food, return {"items":[]}.',
    'Catalogue:',
    ...catalog.map((c) => `${c.id}: ${c.name}`),
  ].join('\n');
}

/** First JSON object of a text answer (models sometimes wrap it); null when there is none. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Anthropic Messages API (vision). Secrets: ANTHROPIC_API_KEY, MEAL_VISION_MODEL. */
export function anthropicVision(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): VisionModel {
  return {
    provider: 'anthropic',
    name: model,
    async detect({ imageBase64, mediaType, catalog, signal }: VisionInput) {
      const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          temperature: 0,
          system: visionPrompt(catalog),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
                { type: 'text', text: 'List the foods of this meal as JSON.' },
              ],
            },
          ],
        }),
      });
      if (!response.ok) await fail(response);
      const json = (await response.json()) as { content?: { type: string; text?: string }[] };
      const text = (json.content ?? []).find((c) => c.type === 'text')?.text ?? '';
      return extractJson(text);
    },
  };
}

/**
 * The JSON schema OpenAI must follow (strict Structured Outputs: every field required, nullable
 * through `null`, no other key). Same fields as the prompt, and no nutrient field; the free-text
 * label is limited by the prompt and cleaned by the handler. Catalogue ids are checked by the handler, not by an enum.
 */
export const MEAL_DETECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: 12, // = MAX_ITEMS of the handler (a test keeps them equal)
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'foodId', 'grams', 'confidence'],
        properties: {
          label: { type: 'string' },
          foodId: { type: ['string', 'null'] },
          grams: { type: ['number', 'null'] },
          confidence: { type: ['number', 'null'] },
        },
      },
    },
  },
} as const;

/** Room for the low reasoning effort plus at most 12 short items. */
const OPENAI_MAX_OUTPUT_TOKENS = 4096;

interface OpenAIResponse {
  status?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
}

/**
 * OpenAI Responses API (vision). Secrets: OPENAI_API_KEY, MEAL_VISION_MODEL.
 * - `store: false`: the response (and so the photo) is not kept as application state. OpenAI may
 *   still keep it up to 30 days in abuse-monitoring logs and briefly in its prompt cache (up to
 *   24 h) unless the project has zero data retention.
 * - `reasoning.effort: 'low'`: the lowest effort every current vision model accepts; no
 *   `temperature` (refused by reasoning models).
 * - Only a `completed` answer is read; an incomplete one (token cap, content filter) is a failure,
 *   a refusal is an unusable answer. Neither is ever patched.
 */
export function openaiVision(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): VisionModel {
  return {
    provider: 'openai',
    name: model,
    async detect({ imageBase64, mediaType, catalog, signal }: VisionInput) {
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          instructions: visionPrompt(catalog),
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_image', image_url: `data:${mediaType};base64,${imageBase64}` },
                { type: 'input_text', text: 'List the foods of this meal as JSON.' },
              ],
            },
          ],
          text: { format: { type: 'json_schema', name: 'meal_foods', strict: true, schema: MEAL_DETECTION_SCHEMA } },
          reasoning: { effort: 'low' },
          max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
          store: false,
        }),
      });
      if (!response.ok) await fail(response);
      const json = (await response.json()) as OpenAIResponse;
      if (json.status !== 'completed') throw new VisionError('invalid_output', 200);
      const parts = (json.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
      // A refusal is not "no food": the answer is unusable (the handler says invalid_output).
      if (parts.some((p) => p.type === 'refusal')) return null;
      const text = parts
        .filter((p) => p.type === 'output_text')
        .map((p) => p.text ?? '')
        .join('');
      return extractJson(text);
    },
  };
}

/**
 * Free default (D-048): Mistral Small 3.1 on Workers AI. It reads images, follows a JSON schema
 * (`guided_json`) and answered vision extraction in seconds where Llama 4 Scout timed out; the
 * comparison script `scripts/vision/compare-cloudflare.mjs` lets the owner check it on real meals.
 */
export const CLOUDFLARE_DEFAULT_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
const CLOUDFLARE_MODEL = /^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i;

/**
 * Cloudflare Workers AI (REST). Secrets: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_TOKEN (an API token
 * with only "Workers AI: Read"), optional MEAL_VISION_CLOUDFLARE_MODEL. Free plan: 10,000 neurons
 * a day; past them the call fails (quota) and the next provider, or the precise message, takes over.
 */
export function cloudflareVision(
  accountId: string,
  apiToken: string,
  model: string = CLOUDFLARE_DEFAULT_MODEL,
  fetchImpl: typeof fetch = fetch,
): VisionModel {
  return {
    provider: 'cloudflare',
    name: model,
    async detect({ imageBase64, mediaType, catalog, signal }: VisionInput) {
      const response = await fetchImpl(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
        {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiToken}` },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: visionPrompt(catalog) },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'List the foods of this meal as JSON.' },
                  { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
                ],
              },
            ],
            guided_json: MEAL_DETECTION_SCHEMA,
            temperature: 0,
            max_tokens: 700,
          }),
        },
      );
      if (!response.ok) await fail(response);
      const json = (await response.json()) as { success?: boolean; result?: { response?: unknown } };
      if (json.success === false) throw new VisionError('unavailable', 200);
      const answer = json.result?.response;
      // Depending on the model the JSON comes back parsed or as text.
      if (answer && typeof answer === 'object') return answer;
      return typeof answer === 'string' ? extractJson(answer) : null;
    },
  };
}

export const VISION_PROVIDERS = ['openai', 'anthropic', 'cloudflare'] as const;

/** The providers chosen by the secrets, in order, and the secret names still missing. */
export interface VisionChain {
  models: VisionModel[];
  /** Names of missing or unknown settings (never a value), for `not_configured`. */
  missing: string[];
}

export function visionChainFromEnv(env: (key: string) => string | undefined, fetchImpl?: typeof fetch): VisionChain {
  const read = (key: string) => env(key)?.trim() || undefined;
  const names = (read('MEAL_VISION_PROVIDER') ?? '')
    .toLowerCase()
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (names.length === 0) return { models: [], missing: ['MEAL_VISION_PROVIDER'] };
  const models: VisionModel[] = [];
  const missing: string[] = [];
  const need = (...keys: string[]) => {
    const absent = keys.filter((k) => !read(k));
    missing.push(...absent);
    return absent.length === 0;
  };
  for (const name of names.slice(0, 3)) {
    if (name === 'openai') {
      if (need('OPENAI_API_KEY', 'MEAL_VISION_MODEL'))
        models.push(openaiVision(read('OPENAI_API_KEY')!, read('MEAL_VISION_MODEL')!, fetchImpl));
    } else if (name === 'anthropic') {
      // MEAL_VISION_ANTHROPIC_MODEL lets both run in one chain; MEAL_VISION_MODEL stays the default.
      const model = read('MEAL_VISION_ANTHROPIC_MODEL') ?? read('MEAL_VISION_MODEL');
      if (need('ANTHROPIC_API_KEY') && (model || need('MEAL_VISION_MODEL')))
        models.push(anthropicVision(read('ANTHROPIC_API_KEY')!, model!, fetchImpl));
    } else if (name === 'cloudflare') {
      const model = read('MEAL_VISION_CLOUDFLARE_MODEL') ?? CLOUDFLARE_DEFAULT_MODEL;
      if (!CLOUDFLARE_MODEL.test(model)) missing.push('MEAL_VISION_CLOUDFLARE_MODEL');
      else if (need('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_AI_TOKEN'))
        models.push(cloudflareVision(read('CLOUDFLARE_ACCOUNT_ID')!, read('CLOUDFLARE_AI_TOKEN')!, model, fetchImpl));
    } else {
      missing.push(`MEAL_VISION_PROVIDER (${name.replace(/[^a-z0-9_-]/g, '').slice(0, 20)} ?)`);
    }
  }
  return { models, missing };
}

/** The first model of the chain, or null (kept for callers that need a single model). */
export function visionFromEnv(env: (key: string) => string | undefined, fetchImpl?: typeof fetch): VisionModel | null {
  return visionChainFromEnv(env, fetchImpl).models[0] ?? null;
}
