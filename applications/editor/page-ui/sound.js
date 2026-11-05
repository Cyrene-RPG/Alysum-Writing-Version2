import {
    SOUND_STORAGE_KEY,
    normalizeSongUrl,
    readSoundPrefs,
    songProviderLabel,
    youtubeEmbedUrl,
} from '/core/atmosphere/model.js';

export function mountEditorSound({
    root = document,
    storage,
    actions = root.getElementById('editorActions'),
} = {}) {
    const store = storage || root.defaultView?.localStorage;
    if (!root.getElementById('editorSoundPanel') && !actions) return { destroy() {} };

    const button = ensureButton();
    const panel = ensurePanel();
    const embedHost = ensureEmbed();
    const errorEl = panel.querySelector('[data-sound-error]');
    const copyEl = panel.querySelector('.writer-sound-copy');
    const songInput = panel.querySelector('#editorSoundSong');
    const songOpen = panel.querySelector('#editorSoundOpen');
    let prefs = readStored();
    let holdCloseUntil = 0;

    function readStored() {
        try { return readSoundPrefs(JSON.parse(store?.getItem(SOUND_STORAGE_KEY) || 'null')); }
        catch { return readSoundPrefs(null); }
    }
    function writeStored() {
        try { store?.setItem(SOUND_STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore quota */ }
    }
    function ensureButton() {
        let node = root.getElementById('editorSound');
        const row = root.getElementById('editorActionRow');
        const focus = root.getElementById('focusMode');
        if (!node) {
            node = root.createElement('button');
            node.type = 'button';
            node.id = 'editorSound';
            node.className = 'quote-button';
            node.setAttribute('aria-expanded', 'false');
            node.setAttribute('aria-controls', 'editorSoundPanel');
            node.textContent = 'Sound';
        }
        if (row) {
            if (focus) focus.before(node);
            else if (node.parentNode !== row) row.append(node);
        } else if (!node.parentNode) (actions || root.body).append(node);
        return node;
    }
    function ensurePanel() {
        let node = root.getElementById('editorSoundPanel');
        if (node) return node;
        node = root.createElement('div');
        node.id = 'editorSoundPanel';
        node.className = 'writer-sound-panel';
        node.hidden = true;
        node.innerHTML = `
            <p class="writer-sound-copy">Paste a YouTube link, then tap play on the video below. Spotify and Apple Music open in their own apps.</p>
            <label class="writer-sound-song" for="editorSoundSong">Favorite song
                <input id="editorSoundSong" type="url" inputmode="url" enterkeyhint="done" maxlength="2000" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="https://youtu.be/…">
            </label>
            <a class="quote-button" id="editorSoundOpen" hidden target="_blank" rel="noopener noreferrer">Open song</a>
            <p class="writer-sound-error" data-sound-error role="alert" hidden></p>
        `;
        const row = root.getElementById('editorActionRow');
        if (row) row.after(node);
        else (actions || root.body).after(node);
        return node;
    }
    function ensureEmbed() {
        let node = root.getElementById('editorSoundEmbed');
        if (node) return node;
        node = root.createElement('div');
        node.id = 'editorSoundEmbed';
        node.className = 'writer-sound-embed';
        node.hidden = true;
        const panelNode = root.getElementById('editorSoundPanel');
        if (panelNode) panelNode.after(node);
        else root.body.append(node);
        return node;
    }
    function paintEmbed() {
        const src = youtubeEmbedUrl(prefs.songUrl);
        embedHost.hidden = !src;
        let frame = embedHost.querySelector('iframe');
        if (!src) {
            frame?.remove();
            return;
        }
        if (!frame) {
            frame = root.createElement('iframe');
            frame.title = 'YouTube';
            frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
            frame.setAttribute('allowfullscreen', '');
            frame.referrerPolicy = 'strict-origin-when-cross-origin';
            embedHost.append(frame);
        }
        if (frame.dataset.embed !== src) {
            frame.dataset.embed = src;
            frame.src = src;
        }
    }
    function showError(message) {
        errorEl.textContent = message || '';
        errorEl.hidden = !message;
    }
    function paint() {
        const provider = songProviderLabel(prefs.songUrl);
        const embed = youtubeEmbedUrl(prefs.songUrl);
        button.textContent = provider === 'YouTube' ? 'Sound · YouTube' : 'Sound';
        button.classList.toggle('is-active', Boolean(prefs.songUrl) || panel.hidden === false);
        if (root.activeElement !== songInput) songInput.value = prefs.songUrl;
        if (copyEl) {
            copyEl.textContent = embed
                ? 'Tap play on the video below. It stays on this page.'
                : 'Paste a YouTube link, then tap play on the video below. Spotify and Apple Music open in their own apps.';
        }
        songOpen.hidden = !provider || Boolean(embed);
        songOpen.href = prefs.songUrl || '#';
        songOpen.textContent = provider ? `Open in ${provider}` : 'Open song';
        paintEmbed();
    }
    function setOpen(open) {
        panel.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        paint();
    }
    button.addEventListener('click', () => setOpen(panel.hidden));
    songInput.addEventListener('focus', () => {
        holdCloseUntil = Date.now() + 700;
    });
    function applySong(raw, persistEmpty) {
        const next = normalizeSongUrl(raw);
        const typed = String(raw || '').trim();
        if (typed && !next) {
            if (!persistEmpty) return;
            showError('Use a YouTube, Spotify, or Apple Music link.');
            prefs = { songUrl: '' };
        } else if (next || persistEmpty) {
            showError('');
            prefs = { songUrl: next };
        } else return;
        writeStored();
        paint();
    }
    songInput.addEventListener('input', () => applySong(songInput.value, false));
    songInput.addEventListener('change', () => applySong(songInput.value, true));
    function onPointerDown(event) {
        if (panel.hidden) return;
        if (Date.now() < holdCloseUntil) return;
        if (panel.contains(event.target) || button.contains(event.target) || embedHost.contains(event.target)) return;
        setOpen(false);
    }
    function onKey(event) {
        if (event.key !== 'Escape' || panel.hidden) return;
        if (root.documentElement.classList.contains('is-typewriter')) return;
        event.preventDefault();
        setOpen(false);
        button.focus();
    }
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('keydown', onKey);
    paint();

    return {
        getPrefs: () => ({ ...prefs }),
        destroy() {
            root.removeEventListener('pointerdown', onPointerDown);
            root.removeEventListener('keydown', onKey);
        },
    };
}
