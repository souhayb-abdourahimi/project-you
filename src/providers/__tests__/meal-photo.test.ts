jest.mock('@/services/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));

import { edgeMealPhotoProvider, type InvokeAnalyzeMeal } from '../meal-photo';

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

  it('maps the function answers: not configured, auth, quota', async () => {
    const answer = (status: number) => edgeMealPhotoProvider(async () => ({ status, data: null }), { retries: 0 });
    expect(await answer(503).analyze(photo, catalog)).toEqual({ status: 'unavailable', reason: 'not_configured' });
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
    expect(await edgeMealPhotoProvider(failing).analyze(photo, catalog)).toMatchObject({ error: 'network' });
    expect(failing).toHaveBeenCalledTimes(2);
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
});
