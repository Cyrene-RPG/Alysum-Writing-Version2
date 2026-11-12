/* Alysum service worker
 * Strategy:
 *   - Studio/Editor HTML: network-first, ignore navigation preload, offline cache fallback
 *   - Other HTML documents: network-first (fall back to cache, then offline page)
 *   - Studio CSS/JS: wait for the network. A saved copy is only for when the network fails.
 *   - Other same-origin assets: network-first, 4s timeout -> cache
 *   - Cross-origin (Firebase, gstatic, googleapis, etc.): bypass entirely
 *   - Install activates immediately. Precache must not delay a phone onto the new worker.
 *
 * Bump SW_VERSION when shipping breaking shell changes to force a refresh.
 */

const SW_VERSION = 'v2.59.0';
const SHELL_CACHE = `alysum-shell-${SW_VERSION}`;
const ASSET_CACHE = `alysum-assets-${SW_VERSION}`;

self.addEventListener('install', (event) => {
  // Activate as soon as the script is downloaded. Waiting on a precache list lets
  // the previous worker keep painting the phone while those requests stall.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
        .map((k) => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isHtmlRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  // Never cache Supabase client config — must update immediately after project migration.
  if (url.pathname === '/core/authentication/client.js') return false;
  return /\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|eot|json|webmanifest)$/i
    .test(url.pathname);
}

function isWorkspaceHtml(url) {
  // Only the offline-writing surfaces are cache-first. The library and Word Wars
  // are live/collaborative — serving a stale document (and stale page code) makes
  // a deploy show up only on the *second* load, so keep them network-first.
  // Artist uses this path too: networkFirstHtml awaits navigation preload, and
  // that promise never settles on Android, so /artist stays hung on "Loading…".
  return /\/(?:studio|editor|artist|artist-gallery|artist-character|artist-profile|artist-shop|character)(?:\.html)?$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // File attachments are real network responses, never offline documents.
  if (url.pathname === '/api/snippet-download' || url.pathname === '/api/paid-access' || url.pathname === '/api/author-access' || url.pathname === '/api/purchase-passes') return;

  // Never intercept Firebase / Google APIs / auth flows / analytics
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith('/__/') ||              // Firebase Hosting init scripts
    url.pathname.startsWith('/.well-known/')
  ) return;

  if (isHtmlRequest(request)) {
    if (isWorkspaceHtml(url)) {
      const pretty = url.pathname.replace(/\.html$/i, "");
      if (pretty !== url.pathname && request.mode === "navigate") {
        const dest = new URL(url.href);
        dest.pathname = pretty;
        event.respondWith(Response.redirect(dest.href, 302));
        return;
      }
      // Fetch the current shell so new scripts never start against stale controls.
      event.respondWith(networkFirstWorkspaceHtml(event));
      return;
    }
    event.respondWith(networkFirstHtml(event));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(networkFirstAsset(event));
    return;
  }
});

async function networkFirstWorkspaceHtml(event) {
  const cache = await caches.open(SHELL_CACHE);
  // Drop a preload that Android may satisfy from the HTTP cache. Studio has to
  // come from the network, or a phone keeps painting the shelf it saved earlier.
  if (event.preloadResponse) event.preloadResponse.catch(() => {});
  const network = (async () => {
    try {
      const fresh = await fetch(event.request, { cache: 'no-store' });
      if (fresh && fresh.ok) await cache.put(event.request, fresh.clone());
      return fresh;
    } catch (_) {
      return null;
    }
  })();
  let timer;
  const first = await Promise.race([
    network,
    new Promise(resolve => { timer = setTimeout(() => resolve(null), 12000); }),
  ]);
  clearTimeout(timer);
  if (first && first.ok) return first;

  event.waitUntil(network);
  const cached = await cache.match(event.request)
    || await cache.match(new URL(event.request.url).pathname)
    || await cache.match(new URL(event.request.url).pathname + '.html');
  if (cached) return cached;
  const late = await network;
  if (late) return late;
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
    '<h1>Offline</h1><p>Reconnect to open this workspace for the first time on this device.</p>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
  );
}

async function networkFirstHtml(event) {
  const cache = await caches.open(SHELL_CACHE);
  // Same Android hang as Studio: awaiting navigation preload never resolves.
  if (event.preloadResponse) event.preloadResponse.catch(() => {});
  try {
    const fresh = await fetch(event.request, { cache: 'no-store' });
    if (fresh && fresh.ok) cache.put(event.request, fresh.clone());
    return fresh;
  } catch (_) {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const fallback = await cache.match('index.html');
    if (fallback) return fallback;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
      '<body style="background:#020b18;color:#f8fafc;font-family:system-ui;padding:32px">' +
      '<h1>Offline</h1><p>Alysum couldn\u2019t reach the network. ' +
      'Reconnect and reload to continue.</p></body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
    );
  }
}

function isStudioPaintAsset(url) {
  return url.pathname.startsWith('/css/studio/')
    || url.pathname.startsWith('/js/studio/')
    || /\/pwa-register\.js$/i.test(url.pathname);
}

// Network-first: online users see a deploy on the *first* reload, not the second.
// Studio paint files wait for the network so a saved stylesheet cannot keep the
// sliced shelf on screen. Other assets still fall back after 4s.
async function networkFirstAsset(event) {
  const request = event.request;
  const url = new URL(request.url);
  const cache = await caches.open(ASSET_CACHE);
  const shell = await caches.open(SHELL_CACHE);
  // The .then is async and awaits the cache write, so `network` settles only once
  // the fresh copy is persisted — no lost writes, no waitUntil-after-finish error.
  const network = fetch(request, { cache: 'no-store' }).then(async (resp) => {
    if (resp && resp.status === 200) {
      try { await cache.put(request, resp.clone()); } catch (_) {}
    }
    return resp;
  }).catch(() => null);

  if (isStudioPaintAsset(url)) {
    const fresh = await network;
    if (fresh && fresh.ok) return fresh;
    const saved = await cache.match(request)
      || await cache.match(request, { ignoreSearch: true })
      || await shell.match(request, { ignoreSearch: true });
    return saved || fresh || new Response('', { status: 504 });
  }

  const first = await Promise.race([
    network,
    new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 4000)),
  ]);
  if (first && first !== 'TIMEOUT' && first.ok) return first;

  // Timed out or failed: keep the worker alive for the in-flight write, serve cache.
  event.waitUntil(network);
  const cached = await cache.match(request)
    || await cache.match(request, { ignoreSearch: true })
    || await shell.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const late = await network;
  return late || new Response('', { status: 504 });
}
