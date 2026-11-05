/** Official YouTube IFrame API. Used only to start/pause the in-page player. */

function pageWindow(root) {
    return root.defaultView || globalThis;
}

export function withPlayerOrigin(src, origin) {
    if (!src || !origin) return src;
    try {
        const url = new URL(src);
        url.searchParams.set('origin', origin);
        return url.href;
    } catch {
        return src;
    }
}

export function loadYoutubeApi(root) {
    const win = pageWindow(root);
    if (win.YT?.Player) return Promise.resolve(win.YT);
    if (win.__alysumYoutubeApi) return win.__alysumYoutubeApi;
    win.__alysumYoutubeApi = new Promise((resolve) => {
        const ready = () => resolve(win.YT);
        const previous = win.onYouTubeIframeAPIReady;
        win.onYouTubeIframeAPIReady = () => {
            previous?.();
            ready();
        };
        if (!win.document.querySelector('script[data-sound-youtube-api]')) {
            const script = win.document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            script.dataset.soundYoutubeApi = '1';
            script.addEventListener('error', () => resolve(null));
            win.document.head.append(script);
        }
        const started = Date.now();
        const timer = win.setInterval(() => {
            if (win.YT?.Player) {
                win.clearInterval(timer);
                ready();
            } else if (Date.now() - started > 2500) {
                win.clearInterval(timer);
                resolve(null);
            }
        }, 50);
    });
    return win.__alysumYoutubeApi;
}

export function bindYoutubePlayer(getIframe, { root, onState } = {}) {
    let player = null;
    let boundEl = null;
    let boundSrc = '';
    let ready = false;
    let pendingPlay = false;
    let attaching = null;
    let attachingSrc = '';

    function iframeNode() {
        return typeof getIframe === 'function' ? getIframe() : getIframe;
    }

    function post(func, args = []) {
        const iframe = iframeNode();
        try {
            iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
        } catch { /* iframe not ready */ }
    }

    function start(next) {
        if (!ready || !next) return false;
        try {
            next.unMute?.();
            next.setVolume?.(100);
            next.playVideo?.();
            pendingPlay = false;
            return true;
        } catch {
            return false;
        }
    }

    function stop(next) {
        if (!next) return false;
        try {
            next.pauseVideo?.();
            return true;
        } catch {
            return false;
        }
    }

    function attachNow() {
        const iframe = iframeNode();
        if (!iframe?.isConnected) return null;
        if (player && boundEl === iframe && boundSrc === iframe.src) return player;
        const win = pageWindow(root || iframe.ownerDocument);
        if (!win.YT?.Player) return null;
        if (player?.destroy) {
            try { player.destroy(); } catch { /* player already gone */ }
            player = null;
        }
        ready = false;
        boundEl = iframe;
        boundSrc = iframe.src;
        try {
            player = new win.YT.Player(iframe, {
                events: {
                    onReady() {
                        ready = true;
                        if (pendingPlay) start(player);
                    },
                    onStateChange(event) { onState?.(event.data); },
                },
            });
        } catch {
            player = null;
            boundEl = null;
            boundSrc = '';
            return null;
        }
        return player;
    }

    function attach() {
        const iframe = iframeNode();
        if (!iframe?.isConnected) return Promise.resolve(null);
        if (player && boundEl === iframe && boundSrc === iframe.src) return Promise.resolve(player);
        if (attaching && attachingSrc === iframe.src) return attaching;
        attachingSrc = iframe.src;
        attaching = loadYoutubeApi(root || iframe.ownerDocument)
            .then(() => attachNow())
            .finally(() => { attaching = null; attachingSrc = ''; });
        return attaching;
    }

    return {
        attach,
        isReady() { return Boolean(ready && player && boundEl === iframeNode()); },
        play() {
            pendingPlay = true;
            if (start(player)) return true;
            post('playVideo');
            void attach();
            return false;
        },
        pause() {
            pendingPlay = false;
            if (stop(player)) return true;
            post('pauseVideo');
            return false;
        },
        destroy() {
            pendingPlay = false;
            ready = false;
            if (player?.destroy) {
                try { player.destroy(); } catch { /* ignore */ }
            }
            player = null;
            boundEl = null;
            boundSrc = '';
            attaching = null;
            attachingSrc = '';
        },
    };
}
