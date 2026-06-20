/* Alysum PWA bootstrap
 *
 * - Registers /sw.js (only over https or on localhost)
 * - Surfaces a small "Update available" toast when a new SW is waiting
 * - Captures the beforeinstallprompt event so any page can call
 *   window.Alysum.installApp() to show the native install dialog
 * - Exposes window.Alysum.canInstall() and an "alysum:install-available" event
 */
(function () {
  'use strict';

  // Drop auth tokens for the deleted Supabase project before any client loads.
  (function purgeLegacySupabaseAuth() {
    const dead = 'tiqmhozzxhiydjnyuuaw';
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-' + dead)) localStorage.removeItem(key);
      }
    } catch (_) {}
  })();

  const isSecure = location.protocol === 'https:' ||
                   location.hostname === 'localhost' ||
                   location.hostname === '127.0.0.1';

  if (!('serviceWorker' in navigator) || !isSecure) return;

  let deferredInstallPrompt = null;

  window.Alysum = window.Alysum || {};
  window.Alysum.canInstall = () => !!deferredInstallPrompt;
  window.Alysum.installApp = async () => {
    if (!deferredInstallPrompt) return { outcome: 'unavailable' };
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.dispatchEvent(new CustomEvent('alysum:install-available', { detail: { available: false } }));
    return choice;
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.dispatchEvent(new CustomEvent('alysum:install-available', { detail: { available: true } }));
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    document.dispatchEvent(new CustomEvent('alysum:install-available', { detail: { available: false } }));
  });

  function showUpdateToast(reg) {
    if (document.getElementById('alysum-pwa-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'alysum-pwa-toast';
    toast.setAttribute('role', 'status');
    toast.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
      'background:rgba(15,23,42,0.96)', 'color:#f8fafc',
      'border:1px solid rgba(255,255,255,0.12)', 'border-radius:14px',
      'padding:12px 16px', 'box-shadow:0 18px 40px rgba(0,0,0,0.45)',
      'font:500 14px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'z-index:2147483647', 'display:flex', 'gap:12px', 'align-items:center',
      'backdrop-filter:blur(10px)'
    ].join(';');
    toast.innerHTML =
      '<span>A new version of Alysum is available.</span>' +
      '<button id="alysum-pwa-reload" style="background:#7c3aed;color:#fff;border:0;border-radius:10px;padding:8px 12px;font-weight:600;cursor:pointer">Reload</button>' +
      '<button id="alysum-pwa-dismiss" style="background:transparent;color:#cbd5e1;border:0;cursor:pointer;font-weight:500">Later</button>';
    document.body.appendChild(toast);
    document.getElementById('alysum-pwa-reload').addEventListener('click', () => {
      if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
    });
    document.getElementById('alysum-pwa-dismiss').addEventListener('click', () => toast.remove());
  }

  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    const swScript = new URL('sw.js', window.location.href);
    const swScope = new URL('./', swScript).pathname;
    navigator.serviceWorker.register(swScript.href, { scope: swScope })
      .then((reg) => {
        if (reg.waiting) showUpdateToast(reg);

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast(reg);
            }
          });
        });

        // Re-check for updates when the tab becomes visible after a while
        let lastUpdateCheck = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          if (Date.now() - lastUpdateCheck < 60_000) return;
          lastUpdateCheck = Date.now();
          reg.update().catch(() => {});
        });
      })
      .catch((err) => {
        console.warn('[Alysum PWA] Service worker registration failed', err);
      });
  });
})();
