const CACHE_NAME = 'sst-staff-v6';
const PRECACHE_URLS = ['index.html', 'cashier.html', 'style.css', 'manifest.json', 'dashboard-fix.js'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then(async (response) => {
                if (event.request.destination === 'document') {
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('text/html')) {
                        const url = new URL(event.request.url);
                        const pathname = url.pathname.toLowerCase();
                        const html = await response.text();

                        let injected = html;
                        const scripts = [];

                        // Only the staff dashboard page gets dashboard-fix.js.
                        // cashier.html must NOT get it — it has its own session/auth
                        // flow and was never designed to run alongside this patch.
                        if (pathname.endsWith('/index.html') || pathname.endsWith('/')) {
                            scripts.push('<script src="dashboard-fix.js?v=4"></script>');
                        }

                        if (scripts.length) {
                            injected = html.replace('</body>', `${scripts.join('')}</body>`);
                        }

                        const headers = new Headers(response.headers);
                        headers.set('content-type', 'text/html; charset=utf-8');
                        const patchedResponse = new Response(injected, {
                            status: response.status,
                            statusText: response.statusText,
                            headers
                        });

                        const clone = patchedResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                        return patchedResponse;
                    }
                }

                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// ============ WEB PUSH ============
self.addEventListener('push', (event) => {
    let payload = { title: 'Sky Sweet Treats', body: 'New order activity.' };
    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload = { title: 'Sky Sweet Treats', body: event.data.text() };
        }
    }

    const options = {
        body: payload.body || '',
        data: payload.data || {},
        vibrate: [100, 50, 100],
        tag: (payload.data && payload.data.order_number) || 'sst-new-order',
        renotify: true
    };

    event.waitUntil(self.registration.showNotification(payload.title || 'Sky Sweet Treats', options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || 'index.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});