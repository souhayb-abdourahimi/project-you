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

/** Shown by the diagnostic call and in `not_configured`: tells which code is deployed. */
export const ANALYZE_MEAL_VERSION = '2026-10-26';

/** Why a provider failed, from its HTTP answer (never its text). */
export type VisionFailure =
  | 'provider_auth'
  | 'quota'
  | 'rate_limited'
  | 'timeout'
  | 'model_not_found'
  | 'bad_request'
  | 'invalid_output'
  | 'unavailable';

export class VisionError extends Error {
  readonly failure: VisionFailure;
  readonly status: number;
  constructor(failure: VisionFailure, status: number) {
    super(`vision ${failure} ${status}`);
    this.failure = failure;
    this.status = status;
  }
}

/** The configured vision model: returns the model's raw JSON answer, checked by the handler. */
export interface VisionModel {
  /** `openai`, `anthropic`, `cloudflare`… (no secret, shown in diagnostics). */
  provider?: string;
  name: string;
  detect(input: VisionInput): Promise<unknown>;
}

export interface AnalyzeMealDeps {
  getUserId: (accessToken: string) => Promise<string | null>;
  /** The providers to try, in order (MEAL_VISION_PROVIDER=openai,cloudflare). */
  models?: VisionModel[];
  /** A single provider (older wiring); ignored when `models` is given. Null: not configured. */
  model?: VisionModel | null;
  /** Names of the missing secrets, returned with `not_configured` (never a value). */
  missing?: string[];
  /** False when the user exceeded their quota (optional). */
  allow?: (userId: string) => Promise<boolean>;
  /** Time given to each provider. */
  timeoutMs?: number;
  /** Time for the whole chain: no provider is started after it. */
  totalTimeoutMs?: number;
  now?: () => number;
}

export interface DetectedItem {
  label: string;
  foodId: string | null;
  grams: number | null;
  confidence: number | null;
}

export type AnalyzeMealBody =
  | { items: DetectedItem[]; model: string }
  | { version: string; providers: { provider: string; model: string }[]; missing: string[] }
  | { error: 'not_configured'; missing: string[]; version: string }
  | { error: 'analysis_failed'; reason: VisionFailure; tried: { provider: string; failure: VisionFailure }[] }
  | {
      error: 'method_not_allowed' | 'unauthorized' | 'invalid_request' | 'rate_limited' | 'timeout' | 'invalid_output';
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

/** The failure most useful to the user when every provider failed (what to fix first). */
const PRIORITY: VisionFailure[] = [
  'quota',
  'provider_auth',
  'model_not_found',
  'rate_limited',
  'bad_request',
  'unavailable',
  'timeout',
  'invalid_output',
];

async function attempt(model: VisionModel, input: Omit<VisionInput, 'signal'>, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      model.detect({ ...input, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Timeout());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function handleAnalyzeMeal(
  request: { method: string; authorization: string | null; body: unknown },
  deps: AnalyzeMealDeps,
): Promise<HandlerResponse> {
  if (request.method !== 'POST' && request.method !== 'GET')
    return { status: 405, body: { error: 'method_not_allowed' } };
  const token = request.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return { status: 401, body: { error: 'unauthorized' } };
  const userId = await deps.getUserId(token).catch(() => null);
  if (!userId) return { status: 401, body: { error: 'unauthorized' } };
  const models = deps.models ?? (deps.model ? [deps.model] : []);
  const missing = (deps.missing ?? []).slice(0, 10);
  const label = (m: VisionModel) => (m.provider ?? 'vision').slice(0, 20);
  // Diagnostic for the owner (curl with a signed-in token): which code and which providers are
  // live. Names only: no key, no part of a key.
  if (request.method === 'GET')
    return {
      status: 200,
      body: {
        version: ANALYZE_MEAL_VERSION,
        providers: models.map((m) => ({ provider: label(m), model: m.name.slice(0, 80) })),
        missing,
      },
    };
  if (models.length === 0)
    return { status: 503, body: { error: 'not_configured', missing, version: ANALYZE_MEAL_VERSION } };
  const input = readRequest(request.body);
  if (!input) return { status: 400, body: { error: 'invalid_request' } };
  if (deps.allow && !(await deps.allow(userId).catch(() => false)))
    return { status: 429, body: { error: 'rate_limited' } };

  const now = deps.now ?? Date.now;
  const started = now();
  const perModel = deps.timeoutMs ?? 20_000;
  const total = deps.totalTimeoutMs ?? perModel * models.length;
  const tried: { provider: string; failure: VisionFailure }[] = [];
  for (const model of models) {
    const left = total - (now() - started);
    // Not enough time for one more provider to answer: stop with what is known.
    if (tried.length > 0 && left < Math.min(5_000, perModel)) break;
    try {
      const raw = await attempt(model, input, Math.min(perModel, left));
      const items = sanitizeDetection(raw, input.catalog);
      // Same 200 body as before the chain (the app parses it strictly).
      if (items) return { status: 200, body: { items, model: model.name.slice(0, 80) } };
      tried.push({ provider: label(model), failure: 'invalid_output' });
    } catch (error) {
      // Never echo the provider's error (it may contain request details): only its kind.
      const failure: VisionFailure =
        error instanceof Timeout ? 'timeout' : error instanceof VisionError ? error.failure : 'unavailable';
      tried.push({ provider: label(model), failure });
    }
  }
  // Same answers as with one provider when every failure is of one plain kind.
  if (tried.every((t) => t.failure === 'invalid_output')) return { status: 502, body: { error: 'invalid_output' } };
  if (tried.every((t) => t.failure === 'timeout')) return { status: 504, body: { error: 'timeout' } };
  const reason = PRIORITY.find((p) => tried.some((t) => t.failure === p)) ?? 'unavailable';
  return { status: 502, body: { error: 'analysis_failed', reason, tried } };
}
