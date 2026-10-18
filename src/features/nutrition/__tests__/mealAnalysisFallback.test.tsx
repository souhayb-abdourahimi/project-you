import { act, renderHook } from '@testing-library/react-native';

import { getFood, nutrientsFor } from '@/domain/meals/catalog';
import { edgeMealPhotoProvider } from '@/providers/meal-photo';
import { useDataStore } from '@/state/data';

import { handleAnalyzeMeal } from '../../../../supabase/functions/analyze-meal/handler';
import { visionFromEnv } from '../../../../supabase/functions/analyze-meal/vision';
import { useMealAnalysis } from '../useMealAnalysis';

/**
 * The whole chain without a network: the real Edge Function handler (with the vision model the
 * secrets select) → the real client provider → the screen's view model. Whatever goes wrong on the
 * vision side, the user is never stuck: composing by hand stays one tap away, and nothing is saved.
 */

const mockAnalyze = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/providers', () => ({
  providers: { mealPhoto: { analyze: (...args: unknown[]) => mockAnalyze(...args) } },
}));
jest.mock('@/services/supabase', () => ({ supabase: null, isSupabaseConfigured: true }));
jest.mock('@/services/mealPhoto', () => ({
  pickMealPhoto: async () => ({
    status: 'ok',
    uri: 'file://meal.jpg',
    photo: { base64: 'aGVsbG8=', mediaType: 'image/jpeg' },
  }),
}));

const OPENAI = { MEAL_VISION_PROVIDER: 'openai', OPENAI_API_KEY: 'server-key', MEAL_VISION_MODEL: 'vision-model' };

/** Wires the provider to the handler, as `supabase.functions.invoke` does over HTTP. */
function chain(env: Record<string, string>, fetchImpl?: typeof fetch) {
  const model = visionFromEnv((k) => env[k], fetchImpl);
  const provider = edgeMealPhotoProvider(
    async (body) => {
      const { status, body: data } = await handleAnalyzeMeal(
        { method: 'POST', authorization: 'Bearer valid', body },
        { getUserId: async () => 'user-a', model, timeoutMs: 50 },
      );
      return { status, data };
    },
    { retries: 0, timeoutMs: 1000 },
  );
  mockAnalyze.mockImplementation((...args: Parameters<typeof provider.analyze>) => provider.analyze(...args));
}

async function analyse() {
  const hook = await renderHook(() => useMealAnalysis('2026-10-18'));
  await act(() => hook.result.current.choose('library'));
  await act(() => hook.result.current.analyze());
  return hook;
}

async function expectManualFallback(hook: Awaited<ReturnType<typeof analyse>>) {
  await act(async () => hook.result.current.composeManually());
  expect(hook.result.current.phase).toBe('review');
  expect(hook.result.current.draft.origin).toBe('manual');
  expect(hook.result.current.draft.items).toEqual([]);
  expect(useDataStore.getState().loggedMeals).toEqual([]);
}

const answering = (status: number) =>
  jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  })) as unknown as typeof fetch;

beforeEach(() => {
  mockAnalyze.mockReset();
  useDataStore.setState({ loggedMeals: [] });
});

describe('meal photo analysis: manual fallback', () => {
  it.each([
    ['no provider', {}],
    ['an unknown provider', { ...OPENAI, MEAL_VISION_PROVIDER: 'gemini' }],
    ['OpenAI without its key', { MEAL_VISION_PROVIDER: 'openai', MEAL_VISION_MODEL: 'vision-model' }],
    ['OpenAI without a model', { MEAL_VISION_PROVIDER: 'openai', OPENAI_API_KEY: 'server-key' }],
    ['OpenAI with the Anthropic key only', { ...OPENAI, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: 'k' }],
  ])('%s: "unavailable", composing by hand', async (_, env) => {
    const fetchImpl = answering(200);
    chain(env as Record<string, string>, fetchImpl);
    const hook = await analyse();
    expect(hook.result.current.phase).toBe('unavailable');
    expect(fetchImpl).not.toHaveBeenCalled();
    await expectManualFallback(hook);
  });

  it.each([
    ['a rejected key (401)', 401],
    ['an unknown model (404)', 404],
    ['a provider quota (429)', 429],
    ['a provider failure (500)', 500],
  ])('OpenAI answers %s: an error the user can retry, composing by hand', async (_, status) => {
    chain(OPENAI, answering(status));
    const hook = await analyse();
    expect(hook.result.current.phase).toBe('error');
    expect(hook.result.current.issue).toBe('network');
    await expectManualFallback(hook);
  });

  it('OpenAI unreachable: an error, composing by hand', async () => {
    chain(OPENAI, jest.fn(async () => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch);
    const hook = await analyse();
    expect(hook.result.current.phase).toBe('error');
    await expectManualFallback(hook);
  });

  it('OpenAI too slow: the request is aborted, a timeout, composing by hand', async () => {
    let aborted = false;
    const hanging = jest.fn(
      (_url: unknown, init: { signal: AbortSignal }) =>
        new Promise((_, reject) =>
          init.signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          }),
        ),
    ) as unknown as typeof fetch;
    chain(OPENAI, hanging);
    const hook = await analyse();
    expect(aborted).toBe(true);
    expect(hook.result.current.phase).toBe('error');
    expect(hook.result.current.issue).toBe('timeout');
    await expectManualFallback(hook);
  });
});

describe('meal photo analysis with OpenAI: nutrition always from Ciqual', () => {
  it('the model names foods and grams; any nutrient it adds is ignored, the totals are Ciqual', async () => {
    const answer = JSON.stringify({
      items: [
        { label: 'Poulet grillé', foodId: 'chicken_breast', grams: 150, confidence: 0.8, kcal: 9999, protein_g: 1 },
      ],
    });
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer }] }],
      }),
    })) as unknown as typeof fetch;
    chain(OPENAI, fetchImpl);
    const hook = await analyse();
    expect(hook.result.current.phase).toBe('review');
    const ciqual = nutrientsFor(getFood('chicken_breast')!, 150);
    expect(hook.result.current.draft.totals).toEqual({
      kcal: Math.round(ciqual.kcal),
      proteinG: Math.round(ciqual.proteinG * 10) / 10,
      carbsG: Math.round(ciqual.carbsG * 10) / 10,
      fatG: Math.round(ciqual.fatG * 10) / 10,
    });
    expect(hook.result.current.draft.totals?.kcal).not.toBe(9999);
    // Nothing is saved before the user confirms.
    expect(useDataStore.getState().loggedMeals).toEqual([]);
  });
});
