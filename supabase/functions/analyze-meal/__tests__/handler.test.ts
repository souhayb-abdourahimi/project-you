import { parseMealPhotoDetection } from '@/domain/ai/schemas';

import { handleAnalyzeMeal, sanitizeDetection, type AnalyzeMealDeps, type VisionModel } from '../handler';
import { anthropicVision, extractJson, visionFromEnv, visionPrompt } from '../vision';

const catalog = [
  { id: 'chicken_breast', name: 'Blanc de poulet (cru)' },
  { id: 'broccoli', name: 'Brocoli' },
];
const body = { image: 'aGVsbG8=', mediaType: 'image/jpeg', catalog };

function deps(model: VisionModel | null, overrides: Partial<AnalyzeMealDeps> = {}): AnalyzeMealDeps {
  return { getUserId: async (t) => (t === 'valid' ? 'user-a' : null), model, timeoutMs: 50, ...overrides };
}
const answering = (raw: unknown): VisionModel => ({ name: 'test-vision', detect: async () => raw });
const call = (
  d: AnalyzeMealDeps,
  overrides: Partial<{ method: string; authorization: string | null; body: unknown }> = {},
) => handleAnalyzeMeal({ method: 'POST', authorization: 'Bearer valid', body, ...overrides }, d);

describe('analyze-meal', () => {
  it('returns the detected foods, never any calorie', async () => {
    const r = await call(
      deps(
        answering({
          items: [{ label: 'Poulet grillé', foodId: 'chicken_breast', grams: 150, confidence: 0.8, kcal: 250 }],
        }),
      ),
    );
    expect(r).toEqual({
      status: 200,
      body: {
        items: [{ label: 'Poulet grillé', foodId: 'chicken_breast', grams: 150, confidence: 0.8 }],
        model: 'test-vision',
      },
    });
  });

  it('refuses an unauthenticated caller before touching the model', async () => {
    const detect = jest.fn();
    for (const authorization of [null, 'Bearer nope', 'Basic x']) {
      const r = await call(deps({ name: 'x', detect }), { authorization });
      expect(r.status).toBe(401);
    }
    expect(detect).not.toHaveBeenCalled();
    expect((await call(deps(null), { method: 'GET' })).status).toBe(405);
  });

  it('no vision secrets: not configured (the app keeps manual composition)', async () => {
    expect(await call(deps(null))).toEqual({ status: 503, body: { error: 'not_configured' } });
  });

  it('rejects malformed requests: image, media type, catalogue', async () => {
    const d = deps(answering({ items: [] }));
    for (const bad of [
      null,
      { ...body, image: '' },
      { ...body, image: 'not base64 !' },
      { ...body, image: 'a'.repeat(2_000_004) },
      { ...body, mediaType: 'image/gif' },
      { ...body, catalog: [] },
      { ...body, catalog: [{ id: 'Bad Id', name: 'x' }] },
      { ...body, catalog: Array(201).fill(catalog[0]) },
    ]) {
      expect((await call(d, { body: bad })).status).toBe(400);
    }
  });

  it('quota exceeded: 429, the model is not called', async () => {
    const detect = jest.fn();
    const r = await call(deps({ name: 'x', detect }, { allow: async () => false }));
    expect(r).toEqual({ status: 429, body: { error: 'rate_limited' } });
    expect(detect).not.toHaveBeenCalled();
  });

  it('a slow model times out (504) and its request is aborted', async () => {
    let aborted = false;
    const slow: VisionModel = {
      name: 'slow',
      detect: ({ signal }) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => (aborted = true));
          setTimeout(() => resolve({ items: [] }), 500);
        }),
    };
    expect(await call(deps(slow))).toEqual({ status: 504, body: { error: 'timeout' } });
    expect(aborted).toBe(true);
  });

  it('a model error or a malformed answer is never passed on', async () => {
    const failing: VisionModel = { name: 'x', detect: async () => Promise.reject(new Error('secret details 401')) };
    expect(await call(deps(failing))).toEqual({ status: 502, body: { error: 'analysis_failed' } });
    expect(await call(deps(answering('free text')))).toEqual({ status: 502, body: { error: 'invalid_output' } });
    expect(await call(deps(answering({ items: [{ foodId: 'broccoli' }] })))).toEqual({
      status: 502,
      body: { error: 'invalid_output' },
    });
  });
});

describe('sanitizeDetection', () => {
  it('an id outside the app catalogue becomes unmatched; impossible portions become unknown', () => {
    expect(
      sanitizeDetection(
        {
          items: [
            { label: 'Pizza', foodId: 'pizza', grams: 300, confidence: 2 },
            { label: 'Brocoli', foodId: 'broccoli', grams: -4, confidence: 0.4 },
            { label: 'Riz', foodId: null, grams: 99999, confidence: null },
          ],
        },
        catalog,
      ),
    ).toEqual([
      { label: 'Pizza', foodId: null, grams: 300, confidence: null },
      { label: 'Brocoli', foodId: 'broccoli', grams: null, confidence: 0.4 },
      { label: 'Riz', foodId: null, grams: null, confidence: null },
    ]);
    expect(sanitizeDetection({ items: Array(13).fill({ label: 'x' }) }, catalog)).toBeNull();
  });

  it('a portion under 0.5 g is unknown (never 0 g): the rest of the answer stays usable', async () => {
    const r = await call(
      deps(
        answering({
          items: [
            { label: 'Brocoli', foodId: 'broccoli', grams: 120, confidence: 0.7 },
            { label: 'Sel', foodId: null, grams: 0.4, confidence: 0.3 },
          ],
        }),
      ),
    );
    expect(r.status).toBe(200);
    expect((r.body as { items: { grams: number | null }[] }).items.map((i) => i.grams)).toEqual([120, null]);
    expect(parseMealPhotoDetection(r.body).ok).toBe(true);
  });

  it('a label never carries a calorie or macro figure (the model never provides nutrition)', () => {
    const labels = (raw: { label: string; foodId?: string | null }[]) =>
      sanitizeDetection(
        { items: raw.map((r) => ({ foodId: null, grams: 100, confidence: null, ...r })) },
        catalog,
      )!.map((i) => i.label);
    expect(
      labels([
        { label: 'Pizza margherita (~800 kcal, 30 g protéines)' },
        { label: 'Salade composée 120 kcal' },
        { label: 'Poulet, 31 g of protein, 3.6 g fat' },
        { label: 'Riz (≈ 350 cal / 7,5 g de lipides)' },
        { label: 'Wrap - 520 kJ' },
        { label: 'Brocoli', foodId: 'broccoli' },
        { label: 'Riz (150 g)' },
        { label: '250 kcal', foodId: 'chicken_breast' },
        { label: '45 g glucides' },
      ]),
    ).toEqual([
      'Pizza margherita',
      'Salade composée',
      'Poulet',
      'Riz',
      'Wrap',
      'Brocoli',
      'Riz (150 g)',
      'Blanc de poulet (cru)',
      '?',
    ]);
  });
});

describe('vision adapters', () => {
  it('the prompt lists the catalogue and forbids calories', () => {
    const prompt = visionPrompt(catalog);
    expect(prompt).toContain('chicken_breast: Blanc de poulet (cru)');
    expect(prompt).toMatch(/Do not return calories/);
    expect(prompt).toMatch(/label is the short name of the food/);
  });

  it('extracts the JSON answer, or nothing', () => {
    expect(extractJson('Here: {"items":[]} done')).toEqual({ items: [] });
    expect(extractJson('no json')).toBeNull();
    expect(extractJson('{broken')).toBeNull();
  });

  it('configured only with provider, key and model', () => {
    const env = (values: Record<string, string>) => (k: string) => values[k];
    expect(visionFromEnv(env({}))).toBeNull();
    expect(visionFromEnv(env({ MEAL_VISION_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }))).toBeNull();
    expect(
      visionFromEnv(env({ MEAL_VISION_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', MEAL_VISION_MODEL: 'm' }))?.name,
    ).toBe('m');
  });

  it('sends the photo as a base64 image block with the server key, reads the text answer', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '{"items":[]}' }] }),
    })) as unknown as typeof fetch;
    const model = anthropicVision('server-key', 'vision-model', fetchImpl);
    const out = await model.detect({
      imageBase64: 'aGVsbG8=',
      mediaType: 'image/jpeg',
      catalog,
      signal: new AbortController().signal,
    });
    expect(out).toEqual({ items: [] });
    const [, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(init.headers['x-api-key']).toBe('server-key');
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe('vision-model');
    expect(sent.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' },
    });
  });
});
