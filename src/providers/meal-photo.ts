import { parseMealPhotoDetection, type MealPhotoDetection } from '@/domain/ai/schemas';
import { supabase } from '@/services/supabase';

import type { MealPhotoProvider, ProviderResult } from './types';

/** One call of the `analyze-meal` Edge Function: its HTTP status and JSON body. */
export type InvokeAnalyzeMeal = (body: unknown, signal: AbortSignal) => Promise<{ status: number; data: unknown }>;

/** Above the server's whole provider chain (45 s, analyze-meal/index.ts): the app never gives up first. */
export const MEAL_PHOTO_TIMEOUT_MS = 50_000;
const RETRY_DELAY_MS = 800;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The meal photo provider over the `analyze-meal` Edge Function (secrets stay on the server). One
 * bounded retry on a network or unexplained 5xx failure (the server already tries its providers in
 * turn, so a timeout or a known provider failure is not sent again), a timeout per attempt,
 * cancellable by the caller. Each failure keeps its precise reason (D-048). The answer is parsed
 * against `MealPhotoDetection`: anything else is an error, never "repaired".
 */
export function edgeMealPhotoProvider(
  invoke: InvokeAnalyzeMeal,
  options: { timeoutMs?: number; retries?: number; now?: () => Date } = {},
): MealPhotoProvider {
  const { timeoutMs = MEAL_PHOTO_TIMEOUT_MS, retries = 1, now = () => new Date() } = options;
  return {
    async analyze(photo, catalog, signal) {
      const body = { image: photo.base64, mediaType: photo.mediaType, catalog };
      for (let attempt = 0; ; attempt++) {
        const result = await once(invoke, body, timeoutMs, now, signal);
        const retryable = result.status === 'error' && result.retryable;
        if (!retryable || attempt >= retries || signal?.aborted) return result;
        await wait(RETRY_DELAY_MS);
        // Cancelled while waiting: the photo is not sent again.
        if (signal?.aborted) return { status: 'error', error: 'timeout', retryable: false };
      }
    },
  };
}

async function once(
  invoke: InvokeAnalyzeMeal,
  body: unknown,
  timeoutMs: number,
  now: () => Date,
  outer?: AbortSignal,
): Promise<ProviderResult<MealPhotoDetection>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  outer?.addEventListener('abort', abort);
  const timer = setTimeout(abort, timeoutMs);
  try {
    const { status, data } = await invoke(body, controller.signal);
    if (status === 200) {
      const parsed = parseMealPhotoDetection(data);
      if (!parsed.ok) return { status: 'error', error: 'unknown', retryable: false };
      const at = now().toISOString();
      return {
        status: 'ok',
        data: parsed.detection,
        meta: {
          provider: 'analyze-meal',
          externalId: null,
          source: parsed.detection.model,
          fetchedAt: at,
          updatedAt: null,
          // A photo estimate: the user checks every food and portion before saving.
          confidence: 'low',
          isMock: false,
        },
      };
    }
    // Each "unavailable" says why, and the screen says it too (never a vague "not yet available").
    if (status === 404) return { status: 'unavailable', reason: 'not_deployed' };
    if (status === 503)
      // Our own body names the missing settings; anything else is the platform (function not starting).
      return errorCode(data) === 'not_configured'
        ? { status: 'unavailable', reason: 'not_configured', missing: missingOf(data) }
        : { status: 'unavailable', reason: 'boot_error' };
    if (status === 401) return { status: 'error', error: 'auth', retryable: false };
    if (status === 429) return { status: 'error', error: 'rate_limited', retryable: false };
    // The server already gave every provider its time: asking again would only double the wait.
    if (status === 504) return { status: 'error', error: 'timeout', retryable: false };
    // The service answered with something unusable: asking again sends the same photo for nothing.
    if (status === 502 && errorCode(data) === 'invalid_output')
      return { status: 'error', error: 'unknown', retryable: false };
    if (status === 502 && errorCode(data) === 'analysis_failed') return failure(reasonOf(data));
    // The connection works: the analysis service itself failed (worth one more try, not "check your connection").
    if (status >= 500) return { status: 'error', error: 'service', retryable: true };
    return { status: 'error', error: 'unknown', retryable: false };
  } catch {
    return controller.signal.aborted
      ? { status: 'error', error: 'timeout', retryable: !outer?.aborted }
      : { status: 'error', error: 'network', retryable: true };
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', abort);
  }
}

function failure(reason: string | null): ProviderResult<MealPhotoDetection> {
  if (reason === 'quota') return { status: 'error', error: 'quota', retryable: false };
  if (reason === 'provider_auth' || reason === 'model_not_found')
    return { status: 'error', error: 'provider_auth', retryable: false };
  if (reason === 'rate_limited') return { status: 'error', error: 'rate_limited', retryable: false };
  if (reason === 'timeout') return { status: 'error', error: 'timeout', retryable: false };
  if (reason === 'bad_request' || reason === 'invalid_output')
    return { status: 'error', error: 'unknown', retryable: false };
  return { status: 'error', error: 'service', retryable: false };
}

const field = (data: unknown, key: string): unknown =>
  data !== null && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined;

const reasonOf = (data: unknown): string | null => {
  const reason = field(data, 'reason');
  return typeof reason === 'string' ? reason : null;
};

/** Setting names only (`OPENAI_API_KEY`…), never shown if they look like anything else. */
const missingOf = (data: unknown): string[] => {
  const missing = field(data, 'missing');
  return Array.isArray(missing)
    ? missing
        .filter((m): m is string => typeof m === 'string' && /^[A-Z_]{3,40}( \([a-z0-9_-]{1,20} \?\))?$/.test(m))
        .slice(0, 5)
    : [];
};

const errorCode = (data: unknown): string | null =>
  data !== null && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
    ? (data as { error: string }).error
    : null;

/** Supabase client wiring: the user's session JWT is attached by supabase-js. */
const invokeSupabase: InvokeAnalyzeMeal = async (body, signal) => {
  if (!supabase) return { status: 503, data: null };
  const { data, error } = await supabase.functions.invoke('analyze-meal', {
    body: body as Record<string, unknown>,
    signal,
  });
  if (!error) return { status: 200, data };
  const response = (error as { context?: unknown }).context;
  if (response instanceof Response) {
    // The body says which failure it was (`{ error: 'invalid_output' }`); never anything personal.
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, data: body };
  }
  // Relay / fetch errors (offline, DNS): a network failure.
  throw error;
};

export const supabaseMealPhotoProvider: MealPhotoProvider = edgeMealPhotoProvider(invokeSupabase);
