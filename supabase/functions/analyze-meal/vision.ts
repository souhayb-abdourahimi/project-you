/**
 * Vision model adapters for `analyze-meal`. The provider is a product decision (cost, latency,
 * data processing terms): it is chosen with the `MEAL_VISION_PROVIDER` secret (`anthropic` or
 * `openai`) and isolated behind `VisionModel`, so changing it never touches the app. Every adapter
 * sends the same prompt and returns the same raw shape (foods, grams, confidence; never a nutrient),
 * checked by the handler. Without the secrets the function answers `not_configured` and the app
 * keeps its manual composition.
 */
import type { CatalogEntry, VisionInput, VisionModel } from './handler.ts';

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
      if (!response.ok) throw new Error(`vision ${response.status}`);
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
      if (!response.ok) throw new Error(`vision ${response.status}`);
      const json = (await response.json()) as OpenAIResponse;
      if (json.status !== 'completed') throw new Error(`vision ${json.status ?? 'unknown'}`);
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

/** The model chosen by the secrets, or null (not configured: the app offers composing by hand). */
export function visionFromEnv(env: (key: string) => string | undefined, fetchImpl?: typeof fetch): VisionModel | null {
  const provider = env('MEAL_VISION_PROVIDER')?.trim().toLowerCase();
  const model = env('MEAL_VISION_MODEL')?.trim();
  if (!model) return null;
  if (provider === 'anthropic') {
    const key = env('ANTHROPIC_API_KEY')?.trim();
    return key ? anthropicVision(key, model, fetchImpl) : null;
  }
  if (provider === 'openai') {
    const key = env('OPENAI_API_KEY')?.trim();
    return key ? openaiVision(key, model, fetchImpl) : null;
  }
  return null;
}
