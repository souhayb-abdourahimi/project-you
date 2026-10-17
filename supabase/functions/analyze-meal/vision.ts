/**
 * Vision model adapters for `analyze-meal`. The provider is a product decision (cost, latency,
 * data processing terms): it is chosen with the `MEAL_VISION_PROVIDER` secret and isolated behind
 * `VisionModel`, so changing it never touches the app. Without the secrets the function answers
 * `not_configured` and the app keeps its manual composition.
 */
import type { CatalogEntry, VisionInput, VisionModel } from './handler.ts';

export function visionPrompt(catalog: readonly CatalogEntry[]): string {
  return [
    'You identify the foods visible on a meal photo for a nutrition app.',
    'Answer with JSON only, exactly: {"items":[{"label":string,"foodId":string|null,"grams":number|null,"confidence":number|null}]}.',
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

/** The model chosen by the secrets, or null (not configured). */
export function visionFromEnv(env: (key: string) => string | undefined, fetchImpl?: typeof fetch): VisionModel | null {
  const provider = env('MEAL_VISION_PROVIDER');
  if (provider === 'anthropic') {
    const key = env('ANTHROPIC_API_KEY');
    const model = env('MEAL_VISION_MODEL');
    return key && model ? anthropicVision(key, model, fetchImpl) : null;
  }
  return null;
}
