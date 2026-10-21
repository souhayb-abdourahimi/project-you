import { parseMealPhotoDetection, type MealPhotoDetection } from '@/domain/ai/schemas';
import { supabase } from '@/services/supabase';

import type { MealPhotoProvider, ProviderResult } from './types';

/** One call of the `analyze-meal` Edge Function: its HTTP status and JSON body. */
export type InvokeAnalyzeMeal = (body: unknown, signal: AbortSignal) => Promise<{ status: number; data: unknown }>;

export const MEAL_PHOTO_TIMEOUT_MS = 25_000;
const RETRY_DELAY_MS = 800;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The meal photo provider over the `analyze-meal` Edge Function (secrets stay on the server). One
 * bounded retry on a network or 5xx failure, a timeout per attempt, cancellable by the caller. The
 * answer is parsed against `MealPhotoDetection`: anything else is an error, never "repaired".
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
    // 503: no vision secrets; 404: the function is not deployed. Both fall back to the composition by hand.
    if (status === 503 || status === 404) return { status: 'unavailable', reason: 'not_configured' };
    if (status === 401) return { status: 'error', error: 'auth', retryable: false };
    if (status === 429) return { status: 'error', error: 'rate_limited', retryable: false };
    if (status === 504) return { status: 'error', error: 'timeout', retryable: true };
    if (status >= 500) return { status: 'error', error: 'network', retryable: true };
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

/** Supabase client wiring: the user's session JWT is attached by supabase-js. */
const invokeSupabase: InvokeAnalyzeMeal = async (body, signal) => {
  if (!supabase) return { status: 503, data: null };
  const { data, error } = await supabase.functions.invoke('analyze-meal', {
    body: body as Record<string, unknown>,
    signal,
  });
  if (!error) return { status: 200, data };
  const response = (error as { context?: unknown }).context;
  if (response instanceof Response) return { status: response.status, data: null };
  // Relay / fetch errors (offline, DNS): a network failure.
  throw error;
};

export const supabaseMealPhotoProvider: MealPhotoProvider = edgeMealPhotoProvider(invokeSupabase);
