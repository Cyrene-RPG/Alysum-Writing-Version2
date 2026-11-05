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
    let boundSrc = '';

    function iframeNode() {
        return typeof getIframe === 'function' ? getIframe() : getIframe;
    }

    async function attach() {
        const iframe = iframeNode();
        if (!iframe?.isConnected) return null;
        if (player && boundSrc === iframe.src) return player;
        const YT = await loadYoutubeApi(root || iframe.ownerDocument);
        if (!YT?.Player) return null;
        if (player?.destroy) {
            try { player.destroy(); } catch { /* player already gone */ }
        }
        boundSrc = iframe.src;
        player = new YT.Player(iframe, {
            events: {
                onStateChange(event) { onState?.(event.data); },
            },
        });
        return player;
    }

    return {
        async playFirst() {
            const next = await attach();
            if (next?.playVideoAt) {
                next.playVideoAt(0);
                return true;
            }
            if (next?.playVideo) {
                next.playVideo();
                return true;
            }
            return false;
        },
        async pause() {
            const next = await attach();
            if (!next?.pauseVideo) return false;
            next.pauseVideo();
            return true;
        },
        destroy() {
            if (player?.destroy) {
                try { player.destroy(); } catch { /* ignore */ }
            }
            player = null;
            boundSrc = '';
        },
    };
}
