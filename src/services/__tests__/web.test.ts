/**
 * @jest-environment jsdom
 */
import {
  applyWebChrome,
  cameraCaptureAvailable,
  isInstalledWebApp,
  registerServiceWorker,
  saveFileOnWeb,
} from '../web';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

function setPointer(coarse: boolean, standalone = false) {
  window.matchMedia = jest.fn((query: string) => ({
    matches: query.includes('pointer: coarse') ? coarse : query.includes('standalone') ? standalone : false,
  })) as unknown as typeof window.matchMedia;
}

describe('web / installed app glue', () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#F5F6F8" media="(prefers-color-scheme: light)">' +
      '<meta name="theme-color" content="#0B0D12" media="(prefers-color-scheme: dark)">';
    setPointer(false);
  });

  it('browser bars, page background and language follow the app, not only the system', () => {
    applyWebChrome('#0B0D12', 'en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.body.style.backgroundColor).toBe('rgb(11, 13, 18)');
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content'));
    expect(metas).toEqual(['#0B0D12', '#0B0D12']);
  });

  it('offers the camera only where the browser really opens one (phones, tablets)', () => {
    setPointer(true);
    expect(cameraCaptureAvailable()).toBe(true);
    setPointer(false);
    expect(cameraCaptureAvailable()).toBe(false);
  });

  it('knows when it runs from the home screen', () => {
    setPointer(true, true);
    expect(isInstalledWebApp()).toBe(true);
    setPointer(true, false);
    expect(isInstalledWebApp()).toBe(false);
  });

  it('never registers the service worker in development', () => {
    const register = jest.fn(async () => undefined);
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } });
    registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
  });

  describe('saving the data export', () => {
    const url = { createObjectURL: jest.fn(() => 'blob:export'), revokeObjectURL: jest.fn() };
    beforeEach(() => {
      url.createObjectURL.mockClear();
      url.revokeObjectURL.mockClear();
      Object.defineProperty(globalThis, 'URL', { configurable: true, writable: true, value: url });
    });
    afterEach(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    });

    it('uses the share sheet on a phone (Save to Files on iPhone)', async () => {
      setPointer(true);
      const share = jest.fn(async () => undefined);
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: share });
      await saveFileOnWeb('{}', 'export.json', 'application/json');
      expect(share).toHaveBeenCalledTimes(1);
      expect(url.createObjectURL).not.toHaveBeenCalled();
    });

    it('closing the share sheet is not an error and starts no download', async () => {
      setPointer(true);
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async () => {
          throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
        },
      });
      await saveFileOnWeb('{}', 'export.json', 'application/json');
      expect(url.createObjectURL).not.toHaveBeenCalled();
    });

    it('falls back to a download when sharing is refused, and keeps the link alive for Safari', async () => {
      jest.useFakeTimers();
      setPointer(true);
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async () => {
          throw Object.assign(new Error('no gesture'), { name: 'NotAllowedError' });
        },
      });
      const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      await saveFileOnWeb('{}', 'export.json', 'application/json');
      expect(click).toHaveBeenCalledTimes(1);
      expect(url.revokeObjectURL).not.toHaveBeenCalled();
      jest.advanceTimersByTime(60_000);
      expect(url.revokeObjectURL).toHaveBeenCalledWith('blob:export');
      jest.useRealTimers();
    });

    it('downloads directly on a computer', async () => {
      const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      await saveFileOnWeb('{}', 'export.json', 'application/json');
      expect(click).toHaveBeenCalled();
    });
  });
});
