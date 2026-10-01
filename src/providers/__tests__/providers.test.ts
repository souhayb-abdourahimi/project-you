import { ciqualFoodProvider } from '../ciqual-food';
import { providers } from '../unavailable';

describe('providers', () => {
  it('report unavailable data instead of inventing it', async () => {
    expect(await providers.price.pricesFor(['rice'], { lat: 0, lng: 0 })).toEqual({
      status: 'unavailable',
      reason: 'not_configured',
    });
    expect(await providers.gym.nearby({ lat: 0, lng: 0 }, 1000)).toMatchObject({ status: 'unavailable' });
  });

  it('returns catalogue foods with their Ciqual provenance, never as MOCK', async () => {
    const result = await ciqualFoodProvider.search('riz', 'fr');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.meta).toMatchObject({ provider: 'anses-ciqual', isMock: false, confidence: 'high' });
      expect(result.data.map((f) => f.id)).toContain('rice');
    }
    expect((await ciqualFoodProvider.search('zzz', 'fr')).status).toBe('unavailable');
  });
});
