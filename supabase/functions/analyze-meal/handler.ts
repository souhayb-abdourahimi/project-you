/**
 * Meal photo analysis (W-10, docs/MEAL_PHOTO_ANALYSIS.md). Runtime-agnostic so it is unit-tested
 * with Jest; `index.ts` wires it to Deno, Supabase Auth and the configured vision model.
 *
 * - The caller is authenticated from their own JWT; the vision secret lives only here.
 * - The photo is sent to the model for this one request and never stored or logged.
 * - The model only names foods from the catalogue the app sends (ids + names) with an optional
 *   portion in grams. It never returns calories: the app computes them from Ciqual.
 * - Output is checked here (ids outside the catalogue become "unmatched") and parsed again by the
 *   client against `MealPhotoDetection` (src/domain/ai/schemas.ts).
 */

export const MAX_IMAGE_BASE64 = 2_000_000; // ≈ 1.5 MB of JPEG
export const MAX_CATALOG = 200;
export const MAX_ITEMS = 12;
export const MAX_PORTION_G = 1500;
export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export interface CatalogEntry {
  id: string;
  name: string;
}

export interface VisionInput {
  imageBase64: string;
  mediaType: MediaType;
  catalog: CatalogEntry[];
  signal: AbortSignal;
}

/** The configured vision model: returns the model's raw JSON answer, checked by the handler. */
export interface VisionModel {
  name: string;
  detect(input: VisionInput): Promise<unknown>;
}

export interface AnalyzeMealDeps {
  getUserId: (accessToken: string) => Promise<string | null>;
  /** Null when no vision provider is configured (missing secrets): the app says "unavailable". */
  model: VisionModel | null;
  /** False when the user exceeded their quota (optional). */
  allow?: (userId: string) => Promise<boolean>;
  timeoutMs?: number;
}

export interface DetectedItem {
  label: string;
  foodId: string | null;
  grams: number | null;
  confidence: number | null;
}

export type AnalyzeMealBody =
  | { items: DetectedItem[]; model: string }
  | {
      error:
        | 'method_not_allowed'
        | 'unauthorized'
        | 'invalid_request'
        | 'not_configured'
        | 'rate_limited'
        | 'timeout'
        | 'invalid_output'
        | 'analysis_failed';
    };

export interface HandlerResponse {
  status: number;
  body: AnalyzeMealBody;
}

const ID = /^[a-z0-9_]{1,64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function readRequest(body: unknown): Omit<VisionInput, 'signal'> | null {
  if (!body || typeof body !== 'object') return null;
  const { image, mediaType, catalog } = body as Record<string, unknown>;
  if (typeof image !== 'string' || image.length === 0 || image.length > MAX_IMAGE_BASE64 || !BASE64.test(image))
    return null;
  if (!MEDIA_TYPES.includes(mediaType as MediaType)) return null;
  if (!Array.isArray(catalog) || catalog.length === 0 || catalog.length > MAX_CATALOG) return null;
  const entries: CatalogEntry[] = [];
  for (const entry of catalog) {
    if (!entry || typeof entry !== 'object') return null;
    const { id, name } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !ID.test(id) || typeof name !== 'string' || !name.trim() || name.length > 80)
      return null;
    entries.push({ id, name: name.trim() });
  }
  return { imageBase64: image, mediaType: mediaType as MediaType, catalog: entries };
}

const finiteOrNull = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

/** "800 kcal", "350 cal", "520 kJ", "30 g protéines", "7,5 g de lipides", "31 g of protein"… */
const NUTRIENT_FIGURE =
  /[~≈]?\s*\d+(?:[.,]\d+)?\s*(?:k?cal(?:ories?)?|kj|g\s*(?:(?:de|of|d')\s*)?(?:prot\p{L}*|gluc\p{L}*|lip\p{L}*|carb\p{L}*|fats?|graisses?|sucres?|sugars?|fibres?|fibers?))(?![\p{L}])/giu;

/**
 * The label is the model's free text, shown to the user for a food the catalogue does not match.
 * Nutrition never comes from the model: any calorie or macro figure is removed (then the empty
 * brackets and dangling separators it leaves). An empty result falls back to the catalogue name.
 */
export function cleanLabel(label: string, fallback: string | null): string {
  const cleaned = label
    .replace(NUTRIENT_FIGURE, '')
    .replace(/\(\s*[,;:/\-–~≈\s]*\)/g, '')
    .replace(/\s*[,;:/\-–]\s*(?=[,;:/\-–)]|$)/g, '')
    .replace(/\(\s*[,;:/\-–]\s*/g, '(')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,;:/\-–\s]+|[,;:/\-–\s]+$/g, '');
  return (cleaned || fallback || '?').slice(0, 80);
}

/**
 * Keeps only what the contract allows. A food id outside the catalogue sent by the app is set to
 * null (unmatched), an impossible portion to null (unknown). A malformed answer is rejected whole.
 */
export function sanitizeDetection(raw: unknown, catalog: readonly CatalogEntry[]): DetectedItem[] | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { items?: unknown }).items)) return null;
  const ids = new Set(catalog.map((c) => c.id));
  const items = (raw as { items: unknown[] }).items;
  if (items.length > MAX_ITEMS) return null;
  const out: DetectedItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') return null;
    const { label, foodId, grams, confidence } = item as Record<string, unknown>;
    if (typeof label !== 'string' || !label.trim()) return null;
    const matched = typeof foodId === 'string' && ids.has(foodId) ? foodId : null;
    // Rounded first: a portion under 0.5 g is unknown, never 0 g (the app refuses 0).
    const grams_ = finiteOrNull(grams, 0, MAX_PORTION_G);
    const rounded = grams_ === null ? null : Math.round(grams_);
    out.push({
      label: cleanLabel(label, matched ? (catalog.find((c) => c.id === matched)?.name ?? null) : null),
      foodId: matched,
      grams: rounded !== null && rounded > 0 ? rounded : null,
      confidence: finiteOrNull(confidence, 0, 1),
    });
  }
  return out;
}

class Timeout extends Error {}

export async function handleAnalyzeMeal(
  request: { method: string; authorization: string | null; body: unknown },
  deps: AnalyzeMealDeps,
): Promise<HandlerResponse> {
  if (request.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };
  const token = request.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return { status: 401, body: { error: 'unauthorized' } };
  const userId = await deps.getUserId(token).catch(() => null);
  if (!userId) return { status: 401, body: { error: 'unauthorized' } };
  if (!deps.model) return { status: 503, body: { error: 'not_configured' } };
  const input = readRequest(request.body);
  if (!input) return { status: 400, body: { error: 'invalid_request' } };
  if (deps.allow && !(await deps.allow(userId).catch(() => false)))
    return { status: 429, body: { error: 'rate_limited' } };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      deps.model.detect({ ...input, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Timeout());
        }, deps.timeoutMs ?? 20_000);
      }),
    ]);
    const items = sanitizeDetection(raw, input.catalog);
    if (!items) return { status: 502, body: { error: 'invalid_output' } };
    return { status: 200, body: { items, model: deps.model.name.slice(0, 80) } };
  } catch (error) {
    // Never echo the provider's error (it may contain request details); the client retries.
    return error instanceof Timeout
      ? { status: 504, body: { error: 'timeout' } }
      : { status: 502, body: { error: 'analysis_failed' } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
