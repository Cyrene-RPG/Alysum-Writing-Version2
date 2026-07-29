/* Alysum service worker
 * Strategy:
 *   - HTML documents: network-first (fall back to cache, then offline page)
 *   - Same-origin static assets (css/js/fonts/images): stale-while-revalidate
 *   - Cross-origin (Firebase, gstatic, googleapis, etc.): bypass entirely
 *   - On activate: clean up old caches
 *
 * Bump SW_VERSION when shipping breaking shell changes to force a refresh.
 */

const SW_VERSION = 'v2.5.3';
const SHELL_CACHE = `alysum-shell-${SW_VERSION}`;
const ASSET_CACHE = `alysum-assets-${SW_VERSION}`;

const APP_SHELL = [
  'index.html',
  'login.html',
  'reset-password.html',
  'signup.html',
  'library.html',
  'lore-wiki.html',
  'editor.html',
  'studio.html',
  'writer-dashboard.html',
  'read.html',
  'beta-read.html',
  'beta-rooms.html',
  'beta-room.html',
  'beta-room-manage.html',
  'beta-notes-library.html',
  'reader-home.html',
  'vault.html',
  'writer-resources.html',
  'world-encyclopedia.html',
  'encyclopedia.html',
  'magic-system-soft.html',
  'magic-system-hard.html',
  'magic-system-undecided.html',
  'peoples-cultures.html',
  'peoples-culture.html',
  'geography-worlds.html',
  'geography-world.html',
  'histories.html',
  'history-record.html',
  'css/magic-codex.css',
  'css/story-bible.css',
  'css/story-bible-v10.css',
  'js/story-bible-cards.js',
  'js/story-bible-story.js',
  'character-profile.html',
  'worldbuilding.html',
  'settings.html',
  'moderation-dashboard.html',
  'moderation-users.html',
  'moderation-user.html',
  'css/library-reports.css',
  'js/moderation-access.js',
  'js/moderation-users-panel.js',
  'js/moderation-reports-panel.js',
  'js/moderation-user-detail.js',
  'js/moderation-dialog.js',
  'js/staff-users-api.js',
  'js/library-reports-api.js',
  'badges.html',
  'author-dashboard.html',
  'scratch.html',
  'prompt-notebook.html',
  'plotweave.html',
  'css/plotweave.css',
  'js/plotweave.js',
  'js/plotweave-templates.js',
  'js/plotweave-supabase.js',
  'note-graph.html',
  'css/note-graph.css',
  'js/note-graph-app.js',
  'js/note-graph-store.js',
  'js/vault-graph.js',
  'publish.html',
  'pdf-editor.html',
  'Novel_Exporter.html',
  'manifest.webmanifest',
  'Alysum-3.png',
  'css/site-responsive.css',
  'css/notebook.css',
  'css/gradient-themes.css',
  'css/workspace-nav.css',
  'js/workspace-nav.js',
  'js/feature-highlights.js',
  'js/gradient-theme-sync.js',
  'js/alysum-appearance-boot.js',
  'js/display-text-style.js',
  'js/display-text-color.js',
  'js/story-bible-fact-rules.js',
  'js/story-bible-facts-api.js',
  'js/story-bible-continuity.js',
  'js/story-bible-utils.js',
  'js/story-bible-overview.js',
  'js/story-bible-atlas.js',
  'js/story-bible-graph.js',
  'js/story-bible-command-palette.js',
  'js/story-bible-page.js',
  'js/story-bible-unified.js',
  'css/wiki-vector.css?v=8',
  'js/wiki/boot.js',
  'js/wiki/app.js',
  'js/wiki/api.js',
  'js/wiki/render.js',
  'js/wiki/links.js',
  'js/wiki/toc.js',
  'js/wiki/search.js',
  'js/wiki/editor.js',
  'js/wiki/link-toolbar.js',
  'js/wiki/publish.js',
  'js/wiki/creator-render.js',
  'js/lore-wiki-api.js',
  'js/lore-wiki-page.js',
  'lore-wiki.html',
  'css/plot-doctor.css',
  'css/book-version.css',
  'js/book-version-api.js',
  'js/book-version-diff.js',
  'js/book-version-panel.js',
  'js/book-media-format.js',
  'wiki.html',
  'story-bible.html',
  'story-bible-legacy.html',
  'Story-Bible-New.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(
      APP_SHELL.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {
          /* ignore individual failures so install still succeeds */
        })
      )
    );
    await self.skipWaiting();
  })());
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
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
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
  if (url.pathname === '/firebase.js' || url.pathname.endsWith('/firebase.js')) return false;
  return /\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|eot|json|webmanifest)$/i
    .test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Firebase / Google APIs / auth flows / analytics
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/__/') ||              // Firebase Hosting init scripts
    url.pathname.startsWith('/.well-known/')
  ) return;

  if (isHtmlRequest(request)) {
    event.respondWith(networkFirstHtml(event));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

async function networkFirstHtml(event) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const fresh = preload || await fetch(event.request, { cache: 'no-store' });
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

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((resp) => {
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  }).catch(() => null);
  return cached || network || new Response('', { status: 504 });
}
