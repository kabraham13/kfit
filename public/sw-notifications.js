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
