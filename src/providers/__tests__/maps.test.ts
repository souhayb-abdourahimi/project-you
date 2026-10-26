import { Linking } from 'react-native';

import { deviceMapsProvider, mapTargets } from '../maps';

const AT = { lat: 48.8531, lng: 2.3694 };

describe('mapTargets: no key, no billed service', () => {
  it('iPhone app: Apple Maps, then its web link, then OpenStreetMap', () => {
    expect(mapTargets(AT, 'Club Bastille', 'ios', false).map((t) => t.url)).toEqual([
      'maps://?ll=48.8531,2.3694&q=Club%20Bastille',
      'https://maps.apple.com/?ll=48.8531,2.3694&q=Club%20Bastille',
      'https://www.openstreetmap.org/?mlat=48.8531&mlon=2.3694#map=18/48.8531/2.3694',
    ]);
  });

  it('Android: the geo: link (any maps app), then OpenStreetMap', () => {
    expect(mapTargets(AT, 'Club & co', 'android', false).map((t) => t.url)).toEqual([
      'geo:48.8531,2.3694?q=48.8531,2.3694(Club%20%26%20co)',
      'https://www.openstreetmap.org/?mlat=48.8531&mlon=2.3694#map=18/48.8531/2.3694',
    ]);
  });

  it('web: Plans on an iPhone (PWA), OpenStreetMap elsewhere', () => {
    expect(mapTargets(AT, null, 'web', true).map((t) => t.provider)).toEqual(['apple-maps', 'openstreetmap']);
    expect(mapTargets(AT, null, 'web', false).map((t) => t.provider)).toEqual(['openstreetmap']);
  });

  it('never a Google link', () => {
    for (const p of ['ios', 'android', 'web'])
      for (const ios of [true, false]) for (const t of mapTargets(AT, 'x', p, ios)) expect(t.url).not.toMatch(/google/i);
  });
});

describe('deviceMapsProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('falls back to the next link when no app opens the first one', async () => {
    const opened: string[] = [];
    jest.spyOn(Linking, 'openURL').mockImplementation(async (url: string) => {
      opened.push(url);
      if (!url.startsWith('https://www.openstreetmap.org')) throw new Error('no app');
      return true;
    });
    const result = await deviceMapsProvider.open(AT, 'Club');
    expect(result).toMatchObject({ status: 'ok', meta: { provider: 'openstreetmap' } });
    expect(opened.at(-1)).toContain('openstreetmap.org');
  });

  it('nothing opens at all: an error, never a crash', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no'));
    expect(await deviceMapsProvider.open(AT)).toEqual({ status: 'error', error: 'unknown', retryable: false });
  });
});
