import { mockFoodProvider } from '../mock-food';
import { providers } from '../unavailable';

describe('providers', () => {
  it('report unavailable data instead of inventing it', async () => {
    expect(await providers.price.pricesFor(['rice'], { lat: 0, lng: 0 })).toEqual({
      status: 'unavailable',
      reason: 'not_configured',
    });
    expect(await providers.gym.nearby({ lat: 0, lng: 0 }, 1000)).toMatchObject({ status: 'unavailable' });
  });

  it('flags mock food results as MOCK', async () => {
    const result = await mockFoodProvider.search('riz', 'fr');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.meta.isMock).toBe(true);
    expect((await mockFoodProvider.search('zzz', 'fr')).status).toBe('unavailable');
  });
});
