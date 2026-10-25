import { act, renderHook } from '@testing-library/react-native';

import { useDataStore } from '@/state/data';

import { useMealAnalysis } from '../useMealAnalysis';

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

const detection = (grams: number | null) => ({
  status: 'ok',
  data: { items: [{ label: 'Saumon', foodId: 'salmon', grams, confidence: 0.7 }], model: 'vision-x' },
  meta: {},
});

beforeEach(() => {
  mockAnalyze.mockReset();
  useDataStore.setState({ loggedMeals: [] });
});

async function analysed(result: unknown) {
  mockAnalyze.mockResolvedValueOnce(result);
  const hook = await renderHook(() => useMealAnalysis('2026-10-08'));
  await act(() => hook.result.current.choose('library'));
  expect(hook.result.current.phase).toBe('preview');
  // Nothing is sent before the explicit "Analyser".
  expect(mockAnalyze).not.toHaveBeenCalled();
  await act(() => hook.result.current.analyze());
  return hook;
}

describe('useMealAnalysis', () => {
  it('sends the photo with the catalogue only after "Analyser", then saves only on confirmation', async () => {
    const hook = await analysed(detection(120));
    const [photo, catalog] = mockAnalyze.mock.calls[0];
    expect(photo).toEqual({ base64: 'aGVsbG8=', mediaType: 'image/jpeg' });
    expect(catalog).toContainEqual({ id: 'salmon', name: expect.any(String) });
    expect(hook.result.current.phase).toBe('review');
    expect(hook.result.current.draft.status).toBe('complete');
    expect(useDataStore.getState().loggedMeals).toEqual([]);
    await act(async () => hook.result.current.setSlot('dinner'));
    let saved = false;
    await act(async () => {
      saved = hook.result.current.confirm();
    });
    expect(saved).toBe(true);
    expect(useDataStore.getState().loggedMeals).toEqual([
      expect.objectContaining({
        date: '2026-10-08',
        slot: 'dinner',
        source: 'photo_estimate',
        items: [{ foodId: 'salmon', grams: 120 }],
      }),
    ]);
  });

  it('an unknown portion cannot be saved until the user enters it', async () => {
    const hook = await analysed(detection(null));
    let saved = true;
    await act(async () => {
      saved = hook.result.current.confirm();
    });
    expect(saved).toBe(false);
    expect(useDataStore.getState().loggedMeals).toEqual([]);
    await act(async () => hook.result.current.edit.portion('d0', 150));
    expect(hook.result.current.draft.status).toBe('complete');
  });

  it('service not configured: says so and offers composing by hand', async () => {
    const hook = await analysed({ status: 'unavailable', reason: 'not_configured' });
    expect(hook.result.current.phase).toBe('unavailable');
    await act(async () => hook.result.current.composeManually());
    expect(hook.result.current.phase).toBe('review');
    expect(hook.result.current.draft.origin).toBe('manual');
  });

  it('a failure keeps the photo, says why and nothing is added', async () => {
    const hook = await analysed({ status: 'error', error: 'timeout', retryable: true });
    expect(hook.result.current.phase).toBe('error');
    expect(hook.result.current.issue).toBe('timeout');
    expect(hook.result.current.uri).toBe('file://meal.jpg');
    expect(useDataStore.getState().loggedMeals).toEqual([]);
  });

  it('a second tap on "Confirmer" does not add the meal twice', async () => {
    const hook = await analysed(detection(120));
    await act(async () => {
      hook.result.current.confirm();
      hook.result.current.confirm();
    });
    expect(useDataStore.getState().loggedMeals).toHaveLength(1);
  });

  it('a second tap on "Analyser" while it runs sends nothing more', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockAnalyze.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const hook = await renderHook(() => useMealAnalysis('2026-10-08'));
    await act(() => hook.result.current.choose('library'));
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = hook.result.current.analyze();
    });
    await act(() => hook.result.current.analyze());
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(detection(120));
      await first;
    });
    expect(hook.result.current.phase).toBe('review');
  });

  it('leaving the screen during the analysis cancels the request', async () => {
    let signal: AbortSignal | undefined;
    mockAnalyze.mockImplementationOnce((_photo, _catalog, s: AbortSignal) => {
      signal = s;
      return new Promise(() => undefined);
    });
    const hook = await renderHook(() => useMealAnalysis('2026-10-08'));
    await act(() => hook.result.current.choose('library'));
    await act(async () => {
      void hook.result.current.analyze();
    });
    expect(signal?.aborted).toBe(false);
    await act(async () => hook.unmount());
    expect(signal?.aborted).toBe(true);
  });

  it('a service failure is not reported as a connection problem', async () => {
    const hook = await analysed({ status: 'error', error: 'service', retryable: true });
    expect(hook.result.current.issue).toBe('service');
  });
});
