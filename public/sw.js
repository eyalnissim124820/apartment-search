// Service worker: receives Web Push messages and opens the right screen on tap.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data && event.data.text() }; }
  const { title = 'מוצאים בית', body = '', url = '/', tag } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: !!tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
      dir: 'auto',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
