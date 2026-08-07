// Imported into the generated service worker (see vite.config.ts workbox.importScripts).
// Handles taps on the rest-timer notification: focus the already-open app if it
// is running in the background, otherwise launch it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        if (client.url.includes('/kfit/') && 'focus' in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow('/kfit/');
      }
    })()
  );
});

// Standalone Service Worker timer scheduler. Runs independently of main UI thread throttling,
// ensuring rest timer alerts fire even if the browser freezes or suspends background tabs.
let restTimerTimeoutId = null;

self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SCHEDULE_REST_TIMER') {
    if (restTimerTimeoutId) clearTimeout(restTimerTimeoutId);
    const delay = Math.max(0, event.data.endsAt - Date.now());

    restTimerTimeoutId = setTimeout(async () => {
      restTimerTimeoutId = null;
      try {
        await self.registration.showNotification('Rest Timer Complete! 🔔', {
          body: 'Time for your next set!',
          icon: '/kfit/pwa-192.png',
          badge: '/kfit/badge-96.png',
          tag: 'kfit-rest-timer',
          renotify: true,
          requireInteraction: true,
          vibrate: [400, 200, 400, 200, 400, 200, 600],
        });
      } catch (err) {
        console.warn('SW timer notification error:', err);
      }
    }, delay);
  } else if (event.data.type === 'CANCEL_REST_TIMER') {
    if (restTimerTimeoutId) {
      clearTimeout(restTimerTimeoutId);
      restTimerTimeoutId = null;
    }
  }
});
