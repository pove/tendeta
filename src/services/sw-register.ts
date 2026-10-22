/** Registers the offline service worker (production builds only). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  try {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
        /* the game works without offline support */
      });
    });
  } catch {
    /* ignore */
  }
}
