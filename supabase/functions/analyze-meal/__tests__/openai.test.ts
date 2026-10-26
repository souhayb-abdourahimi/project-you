import { ANALYZE_MEAL_VERSION, handleAnalyzeMeal, MAX_ITEMS, type VisionModel } from '../handler';
import { MEAL_DETECTION_SCHEMA, openaiVision, visionFromEnv, visionPrompt } from '../vision';

const catalog = [
  { id: 'chicken_breast', name: 'Blanc de poulet (cru)' },
  { id: 'broccoli', name: 'Brocoli' },
];
const input = (signal = new AbortController().signal) => ({
  imageBase64: 'aGVsbG8=',
  mediaType: 'image/jpeg' as const,
  catalog,
  signal,
});

/** A raw Responses API answer: a reasoning item (as with store:false), then the message. */
const completed = (text: string, extra: object[] = []) => ({
  id: 'resp_1',
  status: 'completed',
  output: [
    { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque' },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }, ...extra] },
  ],
});

function fetchAnswering(status: number, json: unknown) {
  return jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  })) as unknown as typeof fetch & jest.Mock;
}
const sentBody = (fetchImpl: jest.Mock) => JSON.parse(fetchImpl.mock.calls[0][1].body);

const env = (values: Record<string, string>) => (k: string) => values[k];
const OPENAI = { MEAL_VISION_PROVIDER: 'openai', OPENAI_API_KEY: 'server-key', MEAL_VISION_MODEL: 'vision-model' };

describe('OpenAI provider: selection by MEAL_VISION_PROVIDER', () => {
  it('openai + OPENAI_API_KEY + MEAL_VISION_MODEL selects the OpenAI adapter', async () => {
    const fetchImpl = fetchAnswering(200, completed('{"items":[]}'));
    const model = visionFromEnv(env(OPENAI), fetchImpl);
    expect(model?.name).toBe('vision-model');
    await model!.detect(input());
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
  });

  it('is not configured (null → 503 → manual composition) when a variable is missing or wrong', () => {
    expect(visionFromEnv(env({ ...OPENAI, OPENAI_API_KEY: '' }))).toBeNull();
    expect(visionFromEnv(env({ ...OPENAI, OPENAI_API_KEY: '   ' }))).toBeNull();
    expect(visionFromEnv(env({ MEAL_VISION_PROVIDER: 'openai', MEAL_VISION_MODEL: 'm' }))).toBeNull();
    expect(visionFromEnv(env({ MEAL_VISION_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }))).toBeNull();
    // The other provider's key does not count.
    expect(
      visionFromEnv(env({ MEAL_VISION_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'k', MEAL_VISION_MODEL: 'm' })),
    ).toBeNull();
    expect(visionFromEnv(env({ ...OPENAI, MEAL_VISION_PROVIDER: 'gpt' }))).toBeNull();
    expect(visionFromEnv(env({ OPENAI_API_KEY: 'k', MEAL_VISION_MODEL: 'm' }))).toBeNull();
  });

  it('tolerates case and spaces in the provider name; Anthropic is unchanged', async () => {
    expect(visionFromEnv(env({ ...OPENAI, MEAL_VISION_PROVIDER: ' OpenAI ' }))?.name).toBe('vision-model');
    const fetchImpl = fetchAnswering(200, { content: [{ type: 'text', text: '{"items":[]}' }] });
    const anthropic = visionFromEnv(
      env({
        MEAL_VISION_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'a-key',
        MEAL_VISION_MODEL: 'claude-x',
        OPENAI_API_KEY: 'o',
      }),
      fetchImpl,
    );
    await anthropic!.detect(input());
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(fetchImpl.mock.calls[0][1].headers['x-api-key']).toBe('a-key');
  });
});

describe('OpenAI provider: request', () => {
  it('sends the photo as a data URL with the server key, without storing the response', async () => {
    const fetchImpl = fetchAnswering(200, completed('{"items":[]}'));
    const signal = new AbortController().signal;
    await openaiVision('server-key', 'vision-model', fetchImpl).detect({ ...input(signal), mediaType: 'image/png' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.method).toBe('POST');
    expect(init.signal).toBe(signal);
    expect(init.headers.authorization).toBe('Bearer server-key');
    const body = sentBody(fetchImpl);
    expect(body.model).toBe('vision-model');
    expect(body.store).toBe(false);
    expect(body.input[0].content).toContainEqual({ type: 'input_image', image_url: 'data:image/png;base64,aGVsbG8=' });
  });

  it('same prompt as Anthropic: the catalogue, ids only, no calories', async () => {
    const fetchImpl = fetchAnswering(200, completed('{"items":[]}'));
    await openaiVision('k', 'm', fetchImpl).detect(input());
    const body = sentBody(fetchImpl);
    expect(body.instructions).toBe(visionPrompt(catalog));
    expect(body.instructions).toContain('chicken_breast: Blanc de poulet (cru)');
    expect(body.instructions).toMatch(/Do not return calories or macros/);
  });

  it('strict JSON schema: label, food id, grams, confidence; no nutrient field in the schema', async () => {
    const fetchImpl = fetchAnswering(200, completed('{"items":[]}'));
    await openaiVision('k', 'm', fetchImpl).detect(input());
    const format = sentBody(fetchImpl).text.format;
    expect(format).toMatchObject({ type: 'json_schema', strict: true, schema: MEAL_DETECTION_SCHEMA });
    const item = MEAL_DETECTION_SCHEMA.properties.items.items;
    expect(Object.keys(item.properties).sort()).toEqual(['confidence', 'foodId', 'grams', 'label']);
    expect([...item.required].sort()).toEqual(['confidence', 'foodId', 'grams', 'label']);
    expect(item.additionalProperties).toBe(false);
    expect(MEAL_DETECTION_SCHEMA.additionalProperties).toBe(false);
    expect(MEAL_DETECTION_SCHEMA.properties.items.maxItems).toBe(MAX_ITEMS);
    expect(JSON.stringify(MEAL_DETECTION_SCHEMA)).not.toMatch(/kcal|calor|energ|prot|carb|glucid|fat|lipid|macro/i);
  });

  it('parameters every current vision model accepts: low reasoning, bounded output, no temperature', async () => {
    const fetchImpl = fetchAnswering(200, completed('{"items":[]}'));
    await openaiVision('k', 'm', fetchImpl).detect(input());
    const body = sentBody(fetchImpl);
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.max_output_tokens).toBeGreaterThan(0);
    for (const key of ['temperature', 'top_p', 'tools', 'previous_response_id', 'background', 'response_format'])
      expect(body).not.toHaveProperty(key);
  });
});

describe('OpenAI provider: answer', () => {
  it('reads the JSON text of the message, skipping reasoning items', async () => {
    const answer = '{"items":[{"label":"Poulet","foodId":"chicken_breast","grams":150,"confidence":0.8}]}';
    const out = await openaiVision('k', 'm', fetchAnswering(200, completed(answer))).detect(input());
    expect(out).toEqual({ items: [{ label: 'Poulet', foodId: 'chicken_breast', grams: 150, confidence: 0.8 }] });
  });

  it('joins a text split over several parts', async () => {
    const json = completed('{"items":', [{ type: 'output_text', text: '[]}' }]);
    expect(await openaiVision('k', 'm', fetchAnswering(200, json)).detect(input())).toEqual({ items: [] });
  });

  it('a refusal or an empty answer is unusable (null), never "no food"', async () => {
    const refusal = completed('', [{ type: 'refusal', refusal: 'I cannot help with that.' }]);
    expect(await openaiVision('k', 'm', fetchAnswering(200, refusal)).detect(input())).toBeNull();
    const empty = { status: 'completed', output: [{ type: 'reasoning', encrypted_content: 'x' }] };
    expect(await openaiVision('k', 'm', fetchAnswering(200, empty)).detect(input())).toBeNull();
  });

  it('an incomplete or failed response is an error, not a partial result', async () => {
    const incomplete = { ...completed('{"items":[{"label":"Po'), status: 'incomplete' };
    await expect(openaiVision('k', 'm', fetchAnswering(200, incomplete)).detect(input())).rejects.toThrow();
    await expect(openaiVision('k', 'm', fetchAnswering(200, { status: 'failed' })).detect(input())).rejects.toThrow();
    await expect(openaiVision('k', 'm', fetchAnswering(200, {})).detect(input())).rejects.toThrow();
  });

  it('an HTTP error throws without the key or the provider message', async () => {
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      const failing = fetchAnswering(status, { error: { message: 'Incorrect API key provided: server-key' } });
      const error = await openaiVision('server-key', 'm', failing)
        .detect(input())
        .catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(new RegExp(`^vision [a-z_]+ ${status}$`));
      expect((error as Error).message).not.toContain('server-key');
    }
  });
});

describe('OpenAI provider through the Edge Function handler', () => {
  const body = { image: 'aGVsbG8=', mediaType: 'image/jpeg', catalog };
  const call = (model: VisionModel | null) =>
    handleAnalyzeMeal(
      { method: 'POST', authorization: 'Bearer valid', body },
      { getUserId: async () => 'user-a', model, timeoutMs: 50 },
    );

  it('same contract as Anthropic: foods, grams, confidence; nutrients the model adds are dropped', async () => {
    const answer = JSON.stringify({
      items: [
        { label: 'Poulet', foodId: 'chicken_breast', grams: 150, confidence: 0.8, kcal: 999, protein_g: 80 },
        { label: 'Pizza', foodId: 'pizza', grams: 300, confidence: 0.5, carbs_g: 90, fat_g: 30 },
      ],
      totals: { kcal: 1500 },
    });
    const r = await call(openaiVision('k', 'gpt-test', fetchAnswering(200, completed(answer))));
    expect(r).toEqual({
      status: 200,
      body: {
        items: [
          { label: 'Poulet', foodId: 'chicken_breast', grams: 150, confidence: 0.8 },
          { label: 'Pizza', foodId: null, grams: 300, confidence: 0.5 },
        ],
        model: 'gpt-test',
      },
    });
  });

  it('missing configuration: 503 not_configured (the app offers composing by hand)', async () => {
    expect(await call(visionFromEnv(env({ MEAL_VISION_PROVIDER: 'openai' })))).toEqual({
      status: 503,
      body: { error: 'not_configured', missing: [], version: ANALYZE_MEAL_VERSION },
    });
  });

  it('a provider error: 502, the provider message is not passed on', async () => {
    const r = await call(openaiVision('k', 'm', fetchAnswering(401, { error: { message: 'bad key k' } })));
    expect(r).toEqual({
      status: 502,
      body: {
        error: 'analysis_failed',
        reason: 'provider_auth',
        tried: [{ provider: 'openai', failure: 'provider_auth' }],
      },
    });
    expect(JSON.stringify(r)).not.toContain('bad key');
  });

  it('a refusal: 502 invalid_output', async () => {
    const refusal = completed('', [{ type: 'refusal', refusal: 'no' }]);
    expect(await call(openaiVision('k', 'm', fetchAnswering(200, refusal)))).toEqual({
      status: 502,
      body: { error: 'invalid_output' },
    });
  });

  it('a slow answer: 504 timeout and the OpenAI request is aborted', async () => {
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
    expect(await call(openaiVision('k', 'm', hanging))).toEqual({ status: 504, body: { error: 'timeout' } });
    expect(aborted).toBe(true);
  });
});
