/*
 * Project You service worker: app shell only.
 *
 * - Pages (navigations): network first. Offline, the last app shell is shown so the app opens; the
 *   app itself then says it is offline. Supabase, Overpass and the analysis service are never
 *   intercepted, so a network error always reaches the app as an error.
 * - Same-origin static files (hashed JS bundles, fonts, images, icons): cache first.
 * - Never cached: other origins, non-GET requests, API responses, anything personal. User data
 *   lives in the app's own storage, never in this cache.
 */
const VERSION = 'v1';
const SHELL = `py-shell-${VERSION}`;
const STATIC = `py-static-${VERSION}`;
const STATIC_LIMIT = 150;
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];

const isStatic = (url) =>
  url.pathname.startsWith('/_expo/static/') ||
  url.pathname.startsWith('/assets/') ||
  url.pathname.startsWith('/icons/') ||
  url.pathname === '/favicon.ico' ||
  url.pathname === '/manifest.webmanifest';

async function precache() {
  const shell = await caches.open(SHELL);
  await shell.addAll(SHELL_URLS);
  // The current bundles, read from the page, so the app opens offline after the first visit.
  const html = await (await shell.match('/')).text();
  const scripts = [...html.matchAll(/src="(\/_expo\/static\/[^"]+)"/g)].map((m) => m[1]);
  if (scripts.length) await (await caches.open(STATIC)).addAll(scripts);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('py-') && k !== SHELL && k !== STATIC).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT))) await cache.delete(key);
}

async function page(request) {
  try {
    const response = await fetch(request);
    // A redirected response cannot be replayed for a navigation (Safari refuses it).
    if (response.ok && response.type === 'basic' && !response.redirected) {
      const copy = response.clone();
      caches.open(SHELL).then((cache) => cache.put('/', copy));
    }
    return response;
  } catch (error) {
    const shell = await caches.match('/', { cacheName: SHELL });
    if (shell) return shell;
    throw error;
  }
}

async function asset(request) {
  const cached = await caches.match(request, { cacheName: STATIC });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(STATIC);
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

/* The page lists the files it loaded before this worker took over (fonts, images): keep them too. */
async function keep(urls) {
  const cache = await caches.open(STATIC);
  for (const raw of urls.slice(0, STATIC_LIMIT)) {
    let url;
    try {
      url = new URL(raw, self.location.origin);
    } catch {
      continue;
    }
    if (url.origin !== self.location.origin || !isStatic(url) || (await cache.match(url.href))) continue;
    try {
      const response = await fetch(url.href);
      if (response.ok && response.type === 'basic') await cache.put(url.href, response);
    } catch {
      // Offline or gone: it will be cached the next time it is loaded.
    }
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'keep-loaded-files' && Array.isArray(data.urls)) event.waitUntil(keep(data.urls));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(page(request));
  else if (isStatic(url)) event.respondWith(asset(request));
});
