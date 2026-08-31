/* Service worker: receives Web Push and opens the right page on click.
 *
 * Deliberately minimal. This is NOT yet a full PWA service worker - there is
 * no offline caching here, because caching an app shell is a separate decision
 * with its own failure mode (a stale app that refuses to update). That is the
 * PWA backlog item; this is only the push half, which M5 needs.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // A malformed payload must never mean showing nothing: browsers can revoke
    // push permission from a worker that receives a push and displays no
    // notification.
    payload = { title: 'Media Vault', body: 'Something changed on your watchlist.' };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url || '/' },
      // Same item replaces rather than stacks - two notifications about one
      // game is how people turn them off.
      tag: payload.url || 'mv',
      renotify: false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an open tab rather than opening a fourth copy of the app.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
