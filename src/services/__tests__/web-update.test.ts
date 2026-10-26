/**
 * @jest-environment jsdom
 */
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

type Listener = (event?: unknown) => void;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeWorker(state = 'installing') {
  const listeners: Listener[] = [];
  return {
    state,
    postMessage: jest.fn(),
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    become(next: string) {
      this.state = next;
      listeners.forEach((fn) => fn());
    },
  };
}

/** A production-like browser: a registration, an optional controller and waiting worker. */
function setup({ controlled = true, waiting = null as ReturnType<typeof fakeWorker> | null } = {}) {
  const regListeners: Record<string, Listener[]> = {};
  const swListeners: Record<string, Listener[]> = {};
  const registration = {
    waiting,
    installing: null as ReturnType<typeof fakeWorker> | null,
    active: { postMessage: jest.fn() },
    update: jest.fn(async () => undefined),
    addEventListener: (type: string, fn: Listener) => (regListeners[type] ??= []).push(fn),
  };
  const register = jest.fn(async () => registration);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register,
      controller: controlled ? {} : null,
      ready: Promise.resolve(registration),
      addEventListener: (type: string, fn: Listener) => (swListeners[type] ??= []).push(fn),
    },
  });
  const reload = jest.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
  return {
    registration,
    register,
    reload,
    fire: (type: string) => (regListeners[type] ?? []).forEach((fn) => fn()),
    takeOver: () => (swListeners.controllerchange ?? []).forEach((fn) => fn()),
  };
}

function load() {
  let web!: typeof import('../web');
  jest.isolateModules(() => {
    web = require('../web');
  });
  return web;
}

describe('service worker updates (D-048)', () => {
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  beforeAll(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver = undefined;
  });
  afterAll(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
  });

  it('always revalidates the worker file, so a new build is seen', async () => {
    const env = setup();
    load().registerServiceWorker();
    await flush();
    expect(env.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  });

  it('a new version installed while the app runs is offered; "Mettre à jour" switches and reloads', async () => {
    const env = setup();
    const web = load();
    const ready = jest.fn();
    web.onUpdateReady(ready);
    web.registerServiceWorker();
    await flush();
    const next = fakeWorker();
    env.registration.installing = next;
    env.fire('updatefound');
    next.become('installed');
    expect(ready).toHaveBeenCalledTimes(1);
    // Nothing switches until the user asks.
    expect(next.postMessage).not.toHaveBeenCalled();
    expect(env.reload).not.toHaveBeenCalled();
    web.applyUpdate();
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'skip-waiting' });
    env.takeOver();
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it('the first install is not an update: no banner, no reload', async () => {
    const env = setup({ controlled: false });
    const web = load();
    const ready = jest.fn();
    web.onUpdateReady(ready);
    web.registerServiceWorker();
    await flush();
    const first = fakeWorker();
    env.registration.installing = first;
    env.fire('updatefound');
    first.become('installed');
    env.takeOver();
    expect(ready).not.toHaveBeenCalled();
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('a version already waiting at launch takes over quietly (this page is already the new one)', async () => {
    const waiting = fakeWorker('installed');
    const env = setup({ waiting });
    const web = load();
    const ready = jest.fn();
    web.onUpdateReady(ready);
    web.registerServiceWorker();
    await flush();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'skip-waiting' });
    env.takeOver();
    expect(env.reload).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
  });

  it('looks for a new version when the installed app comes back to the foreground, at most once a minute', async () => {
    const env = setup();
    load().registerServiceWorker();
    await flush();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(env.registration.update).toHaveBeenCalledTimes(1);
  });
});
