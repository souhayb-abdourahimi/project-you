import { Platform } from 'react-native';

/**
 * Web / installed web app (PWA) glue. Every function is a no-op outside the browser, so native
 * builds are unaffected. Nothing personal is read or written here.
 */
const isBrowser = Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined';

/** Registers the app-shell service worker (public/sw.js) in production web builds only. */
export function registerServiceWorker(): void {
  if (!isBrowser || __DEV__ || !('serviceWorker' in navigator)) return;
  // A failure only means no offline shell: the app works the same online.
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => {
      // Files loaded before the worker took over (icon font, images): the worker keeps the
      // same-origin static ones so the app opens offline. URLs only, nothing personal.
      const keep = (urls: string[]) => registration.active?.postMessage({ type: 'keep-loaded-files', urls });
      keep(performance.getEntriesByType('resource').map((entry) => entry.name));
      // Files still loading at that moment (the icon font) are reported when they finish.
      if (typeof PerformanceObserver === 'undefined') return;
      const observer = new PerformanceObserver((list) => keep(list.getEntries().map((entry) => entry.name)));
      observer.observe({ type: 'resource' });
      setTimeout(() => observer.disconnect(), 30_000);
    })
    .catch(() => undefined);
}

/** Browser bars and the page behind the app follow the theme chosen in the app, not only the system's. */
export function applyWebChrome(background: string, language: string): void {
  if (!isBrowser) return;
  document.documentElement.lang = language;
  document.documentElement.style.backgroundColor = background;
  document.body.style.backgroundColor = background;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', background));
}

/**
 * True when "take a photo" really opens a camera: always on the phone apps; on the web only on
 * touch devices, where the browser's file field offers the camera. On a computer it would only
 * open a file dialog, so the app offers "choose a photo" alone.
 */
export function cameraCaptureAvailable(): boolean {
  if (Platform.OS !== 'web') return true;
  return isBrowser && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/** True when the web app runs from the home screen (no Safari bars). */
export function isInstalledWebApp(): boolean {
  if (!isBrowser) return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    iosStandalone ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  );
}

/**
 * Hands a file to the user on the web: the share sheet on phones (Save to Files on iPhone, where a
 * plain download is unreliable in a home-screen app), otherwise a download.
 */
export async function saveFileOnWeb(content: string, fileName: string, type: string): Promise<void> {
  if (!isBrowser) return;
  if (cameraCaptureAvailable() && typeof File !== 'undefined' && navigator.canShare) {
    const file = new File([content], fileName, { type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName });
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        // Share refused (for example after a slow network call): fall back to the download.
      }
    }
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari starts the download asynchronously: revoking at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
