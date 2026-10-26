/**
 * Provider chain and the free Cloudflare provider (D-048): if the first provider fails the next one
 * answers and the user sees nothing; if all fail the app gets the precise reason. Vision identifies,
 * Ciqual computes: no provider ever gives a nutrient to the app.
 */
import { handleAnalyzeMeal, VisionError, type VisionModel } from '../handler';
import { CLOUDFLARE_DEFAULT_MODEL, cloudflareVision, failureOf, visionChainFromEnv } from '../vision';

const catalog = [
  { id: 'chicken_breast', name: 'Blanc de poulet' },
  { id: 'rice_cooked', name: 'Riz cuit' },
];
const body = { image: 'aGVsbG8=', mediaType: 'image/jpeg', catalog };
const call = (models: VisionModel[], extra: object = {}) =>
  handleAnalyzeMeal(
    { method: 'POST', authorization: 'Bearer valid', body },
    { getUserId: async () => 'user-a', models, timeoutMs: 100, ...extra },
  );
const ok = (provider: string): VisionModel => ({
  provider,
  name: `${provider}-model`,
  detect: async () => ({
    items: [{ label: 'Poulet', foodId: 'chicken_breast', grams: 150, confidence: 0.8, kcal: 900 }],
  }),
});
const failing = (provider: string, failure: ConstructorParameters<typeof VisionError>[0]): VisionModel => ({
  provider,
  name: `${provider}-model`,
  detect: async () => {
    throw new VisionError(failure, 0);
  },
});
const env = (values: Record<string, string>) => (key: string) => values[key];
const fetchAnswering = (status: number, json: unknown, text = JSON.stringify(json)) =>
  jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => json, text: async () => text }));

describe('provider chain', () => {
  it('the first provider fails (credits spent): the second answers, the user sees a normal result', async () => {
    const r = await call([failing('openai', 'quota'), ok('cloudflare')]);
    expect(r).toEqual({
      status: 200,
      body: {
        items: [{ label: 'Poulet', foodId: 'chicken_breast', grams: 150, confidence: 0.8 }],
        model: 'cloudflare-model',
      },
    });
  });

  it('the first provider answers: the second is never called', async () => {
    const second = { ...ok('cloudflare'), detect: jest.fn() };
    await call([ok('openai'), second]);
    expect(second.detect).not.toHaveBeenCalled();
  });

  it('all fail: the most useful reason and what each provider did, never a provider message', async () => {
    expect(await call([failing('openai', 'quota'), failing('cloudflare', 'unavailable')])).toEqual({
      status: 502,
      body: {
        error: 'analysis_failed',
        reason: 'quota',
        tried: [
          { provider: 'openai', failure: 'quota' },
          { provider: 'cloudflare', failure: 'unavailable' },
        ],
      },
    });
    expect((await call([failing('openai', 'provider_auth')])).body).toMatchObject({ reason: 'provider_auth' });
  });

  it('a slow provider is cut and the next one still gets its chance', async () => {
    const slow: VisionModel = { provider: 'openai', name: 's', detect: () => new Promise(() => undefined) };
    const r = await call([slow, ok('cloudflare')], { timeoutMs: 30, totalTimeoutMs: 10_000 });
    expect(r.status).toBe(200);
  });

  it('no time left for another provider: stops instead of exceeding the request budget', async () => {
    let clock = 0;
    const second = { ...ok('cloudflare'), detect: jest.fn() };
    const first: VisionModel = {
      provider: 'openai',
      name: 'o',
      detect: async () => {
        clock += 42_000;
        throw new VisionError('unavailable', 500);
      },
    };
    const r = await call([first, second], { totalTimeoutMs: 45_000, timeoutMs: 25_000, now: () => clock });
    expect(second.detect).not.toHaveBeenCalled();
    expect(r.body).toMatchObject({ error: 'analysis_failed', reason: 'unavailable' });
  });

  it('GET with a signed-in token: which providers are live and which secrets are missing (names only)', async () => {
    const r = await handleAnalyzeMeal(
      { method: 'GET', authorization: 'Bearer valid', body: null },
      { getUserId: async () => 'user-a', models: [ok('cloudflare')], missing: ['OPENAI_API_KEY'] },
    );
    expect(r).toEqual({
      status: 200,
      body: {
        version: expect.any(String),
        providers: [{ provider: 'cloudflare', model: 'cloudflare-model' }],
        missing: ['OPENAI_API_KEY'],
      },
    });
  });
});

describe('secrets', () => {
  it('reads an ordered list and names what is missing, never a value', () => {
    const chain = visionChainFromEnv(
      env({
        MEAL_VISION_PROVIDER: 'openai, cloudflare',
        MEAL_VISION_MODEL: 'gpt-x',
        CLOUDFLARE_ACCOUNT_ID: 'acc',
        CLOUDFLARE_AI_TOKEN: 'tok',
      }),
    );
    expect(chain.models.map((m) => [m.provider, m.name])).toEqual([['cloudflare', CLOUDFLARE_DEFAULT_MODEL]]);
    expect(chain.missing).toEqual(['OPENAI_API_KEY']);
  });

  it('nothing set: MEAL_VISION_PROVIDER is named', () => {
    expect(visionChainFromEnv(env({}))).toEqual({ models: [], missing: ['MEAL_VISION_PROVIDER'] });
  });

  it('an unknown provider name is reported, not silently ignored', () => {
    expect(visionChainFromEnv(env({ MEAL_VISION_PROVIDER: 'gemini' })).missing).toEqual([
      'MEAL_VISION_PROVIDER (gemini ?)',
    ]);
  });

  it('a Cloudflare model that is not a @cf/ id is refused', () => {
    const chain = visionChainFromEnv(
      env({
        MEAL_VISION_PROVIDER: 'cloudflare',
        MEAL_VISION_CLOUDFLARE_MODEL: '../../x',
        CLOUDFLARE_ACCOUNT_ID: 'a',
        CLOUDFLARE_AI_TOKEN: 't',
      }),
    );
    expect(chain).toEqual({ models: [], missing: ['MEAL_VISION_CLOUDFLARE_MODEL'] });
  });
});

describe('provider failures', () => {
  it.each([
    [401, '', 'provider_auth'],
    [403, '', 'provider_auth'],
    [429, '{"error":{"code":"insufficient_quota"}}', 'quota'],
    [429, '{"errors":[{"message":"you have used up your daily free allocation of 10,000 neurons"}]}', 'quota'],
    [429, '{"error":"rate limit"}', 'rate_limited'],
    [402, '', 'quota'],
    [404, '', 'model_not_found'],
    [400, '', 'bad_request'],
    [504, '', 'timeout'],
    [500, '', 'unavailable'],
    [503, '', 'unavailable'],
  ])('%i %s → %s', (status, text, failure) => {
    expect(failureOf(status, text)).toBe(failure);
  });
});

describe('Cloudflare Workers AI', () => {
  const input = () => ({
    imageBase64: 'aGVsbG8=',
    mediaType: 'image/jpeg' as const,
    catalog,
    signal: new AbortController().signal,
  });

  it('sends the image, the catalogue prompt and the JSON schema; reads a parsed or a text answer', async () => {
    const parsed = { items: [{ label: 'Riz', foodId: 'rice_cooked', grams: 180, confidence: 0.7 }] };
    const fetchImpl = fetchAnswering(200, { success: true, result: { response: parsed } });
    expect(await cloudflareVision('acc', 'tok', undefined, fetchImpl as never).detect(input())).toEqual(parsed);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/acc/ai/run/${CLOUDFLARE_DEFAULT_MODEL}`);
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok' });
    const sent = JSON.parse(init.body as string);
    expect(sent.guided_json.properties.items.items.required).toEqual(['label', 'foodId', 'grams', 'confidence']);
    expect(sent.messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,aGVsbG8=' },
    });
    expect(sent.messages[0].content).toContain('rice_cooked: Riz cuit');
    expect(sent.messages[0].content).toContain('Do not return calories or macros');

    const text = fetchAnswering(200, { success: true, result: { response: `Voici: ${JSON.stringify(parsed)}` } });
    expect(await cloudflareVision('acc', 'tok', undefined, text as never).detect(input())).toEqual(parsed);
  });

  it('a refused token or a spent daily allocation is a typed failure', async () => {
    const auth = cloudflareVision('acc', 'tok', undefined, fetchAnswering(401, {}) as never);
    await expect(auth.detect(input())).rejects.toMatchObject({ failure: 'provider_auth' });
    const spent = fetchAnswering(
      429,
      {},
      '{"errors":[{"code":3036,"message":"daily free allocation of 10,000 neurons"}]}',
    );
    await expect(cloudflareVision('acc', 'tok', undefined, spent as never).detect(input())).rejects.toMatchObject({
      failure: 'quota',
    });
  });

  it('through the handler: nutrients it may add never reach the app', async () => {
    const answer = {
      items: [{ label: 'Riz 250 kcal', foodId: 'rice_cooked', grams: 180, confidence: 0.7, kcal: 250 }],
    };
    const model = cloudflareVision(
      'acc',
      'tok',
      undefined,
      fetchAnswering(200, { success: true, result: { response: answer } }) as never,
    );
    const r = await call([model]);
    expect(r).toEqual({
      status: 200,
      body: {
        items: [{ label: 'Riz', foodId: 'rice_cooked', grams: 180, confidence: 0.7 }],
        model: CLOUDFLARE_DEFAULT_MODEL,
      },
    });
  });
});
