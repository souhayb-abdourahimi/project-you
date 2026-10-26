import { edgeMealPhotoProvider, type InvokeAnalyzeMeal } from '../meal-photo';

jest.mock('@/services/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));

const photo = { base64: 'aGVsbG8=', mediaType: 'image/jpeg' as const };
const catalog = [{ id: 'broccoli', name: 'Brocoli' }];
const ok = { items: [{ label: 'Brocoli', foodId: 'broccoli', grams: 100, confidence: 0.7 }], model: 'vision-x' };
const now = () => new Date('2026-10-08T12:00:00Z');

describe('edgeMealPhotoProvider', () => {
  it('sends the photo and the catalogue, returns a validated detection labelled low confidence', async () => {
    const invoke = jest.fn<ReturnType<InvokeAnalyzeMeal>, Parameters<InvokeAnalyzeMeal>>(async () => ({
      status: 200,
      data: ok,
    }));
    const result = await edgeMealPhotoProvider(invoke, { now }).analyze(photo, catalog);
    expect(invoke.mock.calls[0][0]).toEqual({ image: 'aGVsbG8=', mediaType: 'image/jpeg', catalog });
    expect(result).toEqual({
      status: 'ok',
      data: ok,
      meta: expect.objectContaining({ provider: 'analyze-meal', source: 'vision-x', confidence: 'low', isMock: false }),
    });
  });

  it('a body with calories (or any other shape) is an error, never repaired', async () => {
    const invoke: InvokeAnalyzeMeal = async () => ({ status: 200, data: { ...ok, totals: { kcal: 400 } } });
    expect(await edgeMealPhotoProvider(invoke).analyze(photo, catalog)).toEqual({
      status: 'error',
      error: 'unknown',
      retryable: false,
    });
  });

  it('maps the function answers: each unavailable case keeps its own reason (D-048)', async () => {
    const answer = (status: number, data: unknown = null) =>
      edgeMealPhotoProvider(async () => ({ status, data }), { retries: 0 });
    const missing = { error: 'not_configured', missing: ['OPENAI_API_KEY', 'sk-leak?'], version: 'x' };
    expect(await answer(503, missing).analyze(photo, catalog)).toEqual({
      status: 'unavailable',
      reason: 'not_configured',
      missing: ['OPENAI_API_KEY'],
    });
    // The platform's own 503 (the function does not start), without our body.
    expect(await answer(503, { code: 'BOOT_ERROR' }).analyze(photo, catalog)).toEqual({
      status: 'unavailable',
      reason: 'boot_error',
    });
    expect(await answer(404).analyze(photo, catalog)).toEqual({ status: 'unavailable', reason: 'not_deployed' });
    expect(await answer(401).analyze(photo, catalog)).toMatchObject({ error: 'auth', retryable: false });
    expect(await answer(429).analyze(photo, catalog)).toMatchObject({ error: 'rate_limited', retryable: false });
    expect(await answer(400).analyze(photo, catalog)).toMatchObject({ error: 'unknown', retryable: false });
  });

  it('retries once after a network or server failure, then gives up', async () => {
    const invoke = jest
      .fn<ReturnType<InvokeAnalyzeMeal>, Parameters<InvokeAnalyzeMeal>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 200, data: ok });
    expect((await edgeMealPhotoProvider(invoke).analyze(photo, catalog)).status).toBe('ok');
    expect(invoke).toHaveBeenCalledTimes(2);

    const failing = jest.fn<ReturnType<InvokeAnalyzeMeal>, Parameters<InvokeAnalyzeMeal>>(async () => ({
      status: 502,
      data: null,
    }));
    expect(await edgeMealPhotoProvider(failing).analyze(photo, catalog)).toMatchObject({ error: 'service' });
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('an unusable answer (502 invalid_output) is not sent again and is not called a connection problem', async () => {
    const invoke = jest.fn<ReturnType<InvokeAnalyzeMeal>, Parameters<InvokeAnalyzeMeal>>(async () => ({
      status: 502,
      data: { error: 'invalid_output' },
    }));
    expect(await edgeMealPhotoProvider(invoke).analyze(photo, catalog)).toEqual({
      status: 'error',
      error: 'unknown',
      retryable: false,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('every provider failed (502 analysis_failed): the precise reason, not sent again', async () => {
    const answer = async (reason: string) => {
      const invoke = jest.fn<ReturnType<InvokeAnalyzeMeal>, Parameters<InvokeAnalyzeMeal>>(async () => ({
        status: 502,
        data: { error: 'analysis_failed', reason, tried: [] },
      }));
      const result = await edgeMealPhotoProvider(invoke).analyze(photo, catalog);
      expect(invoke).toHaveBeenCalledTimes(1);
      return result;
    };
    expect(await answer('quota')).toEqual({ status: 'error', error: 'quota', retryable: false });
    expect(await answer('provider_auth')).toEqual({ status: 'error', error: 'provider_auth', retryable: false });
    expect(await answer('model_not_found')).toEqual({ status: 'error', error: 'provider_auth', retryable: false });
    expect(await answer('rate_limited')).toMatchObject({ error: 'rate_limited' });
    expect(await answer('unavailable')).toEqual({ status: 'error', error: 'service', retryable: false });
  });

  it('504: the server already gave every provider its time, the app does not ask again', async () => {
    const invoke = jest.fn<ReturnType<InvokeAnalyzeMeal>, Parameters<InvokeAnalyzeMeal>>(async () => ({
      status: 504,
      data: { error: 'timeout' },
    }));
    expect(await edgeMealPhotoProvider(invoke).analyze(photo, catalog)).toMatchObject({
      error: 'timeout',
      retryable: false,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('times out an attempt and aborts its request', async () => {
    let aborted = false;
    const hanging: InvokeAnalyzeMeal = (_body, signal) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });
    const result = await edgeMealPhotoProvider(hanging, { timeoutMs: 20, retries: 0 }).analyze(photo, catalog);
    expect(result).toEqual({ status: 'error', error: 'timeout', retryable: true });
    expect(aborted).toBe(true);
  });

  it('cancelled by the user: no retry', async () => {
    const controller = new AbortController();
    const invoke = jest.fn<ReturnType<InvokeAnalyzeMeal>, Parameters<InvokeAnalyzeMeal>>(
      (_body, signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
          controller.abort();
        }),
    );
    const result = await edgeMealPhotoProvider(invoke).analyze(photo, catalog, controller.signal);
    expect(result).toMatchObject({ error: 'timeout', retryable: false });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('cancelled while waiting to retry: the photo is not sent again', async () => {
    jest.useFakeTimers();
    try {
      const controller = new AbortController();
      const invoke = jest.fn<ReturnType<InvokeAnalyzeMeal>, Parameters<InvokeAnalyzeMeal>>(async () => ({
        status: 502,
        data: null,
      }));
      const pending = edgeMealPhotoProvider(invoke).analyze(photo, catalog, controller.signal);
      await jest.advanceTimersByTimeAsync(100); // first attempt failed, the retry is waiting
      controller.abort(); // "Annuler" or "Composer mon repas à la main"
      await jest.advanceTimersByTimeAsync(5_000);
      expect(await pending).toMatchObject({ status: 'error', retryable: false });
      expect(invoke).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
