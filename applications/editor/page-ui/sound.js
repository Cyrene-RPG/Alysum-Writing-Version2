import {
    SOUND_STORAGE_KEY,
    SOUND_LINKS_MAX,
    parseSongLinks,
    readSoundPrefs,
    songProviderLabel,
    youtubeEmbedUrl,
} from '/core/atmosphere/model.js';
import { bindYoutubePlayer, loadYoutubeApi, withPlayerOrigin } from '/js/editor/sound-youtube.js';

export function mountEditorSound({
    root = document,
    storage,
    actions = root.getElementById('editorActions'),
} = {}) {
    const store = storage || root.defaultView?.localStorage;
    if (!root.getElementById('editorSoundPanel') && !actions) return { destroy() {} };

    const button = ensureButton();
    const panel = ensurePanel();
    const controls = ensureControls();
    const playBtn = controls.querySelector('#editorSoundPlay');
    const embedHost = controls.querySelector('#editorSoundEmbed');
    const errorEl = panel.querySelector('[data-sound-error]');
    const copyEl = panel.querySelector('.writer-sound-copy');
    const list = panel.querySelector('#editorSoundLinks');
    const addBtn = panel.querySelector('#editorSoundAdd');
    const songOpen = panel.querySelector('#editorSoundOpen');
    const hideBtn = panel.querySelector('#editorSoundHide');
    let prefs = readStored();
    let drafts = parseSongLinks(prefs.songUrl);
    if (!drafts.length) drafts = [''];
    let holdCloseUntil = 0;
    let playing = false;
    const youtube = bindYoutubePlayer(() => embedHost.querySelector('iframe'), {
        root,
        onState(state) {
            playing = state === 1;
            paintPlay();
        },
    });

    function readStored() {
        try { return readSoundPrefs(JSON.parse(store?.getItem(SOUND_STORAGE_KEY) || 'null')); }
        catch { return readSoundPrefs(null); }
    }
    function writeStored() {
        try { store?.setItem(SOUND_STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore quota */ }
    }
    function placeOnBar(node) {
        const row = root.getElementById('editorActionRow');
        if (row) {
            if (node.parentNode !== row) row.append(node);
            return;
        }
        if (!node.parentNode) (actions || root.body).append(node);
    }
    function ensureButton() {
        let node = root.getElementById('editorSound');
        if (!node) {
            node = root.createElement('button');
            node.type = 'button';
            node.id = 'editorSound';
            node.className = 'quote-button';
            node.setAttribute('aria-expanded', 'false');
            node.setAttribute('aria-controls', 'editorSoundPanel');
            node.textContent = 'Sound';
        }
        placeOnBar(node);
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
            <p class="writer-sound-copy">Paste a YouTube playlist, Mix, or a video link. Use + to queue another song.</p>
            <div id="editorSoundLinks" class="writer-sound-links"></div>
            <button type="button" class="quote-button" id="editorSoundAdd">+ Song</button>
            <a class="quote-button" id="editorSoundOpen" hidden target="_blank" rel="noopener noreferrer">Open song</a>
            <button type="button" class="quote-button" id="editorSoundHide" hidden>Hide video</button>
            <p class="writer-sound-error" data-sound-error role="alert" hidden></p>
        `;
        const row = root.getElementById('editorActionRow');
        if (row) row.after(node);
        else (actions || root.body).after(node);
        return node;
    }
    function ensureControls() {
        let host = root.getElementById('editorSoundControls');
        if (host) {
            placeControls(host);
            return host;
        }
        host = root.createElement('div');
        host.id = 'editorSoundControls';
        host.className = 'writer-sound-controls';
        host.hidden = true;
        host.innerHTML = `
            <button type="button" class="writer-sound-play" id="editorSoundPlay" aria-label="Play first song">Play</button>
            <div id="editorSoundEmbed" class="writer-sound-embed"></div>
        `;
        placeControls(host);
        return host;
    }
    function placeControls(host = controls) {
        if (root.documentElement.classList.contains('is-typewriter')) {
            if (host.parentNode !== root.body) root.body.append(host);
            return;
        }
        const row = root.getElementById('editorActionRow');
        if (row) {
            placeOnBar(host);
            return;
        }
        const panelNode = root.getElementById('editorSoundPanel');
        if (panelNode && host.previousElementSibling !== panelNode) panelNode.after(host);
        else if (!panelNode && host.parentNode !== root.body) root.body.append(host);
    }
    function paintPlay() {
        playBtn.textContent = playing ? 'Pause' : 'Play';
        playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play first song');
        playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    }
    function songInputs() {
        return [...list.querySelectorAll('[data-sound-link]')];
    }
    function addRow(value = '') {
        const row = root.createElement('div');
        row.className = 'writer-sound-row';
        const index = list.children.length;
        row.innerHTML = `
            <label class="writer-sound-song"><span data-sound-label>${index === 0 ? 'Song' : `Song ${index + 1}`}</span>
                <input ${index === 0 ? 'id="editorSoundSong"' : ''} data-sound-link type="url" inputmode="url" maxlength="2000" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="https://youtu.be/…">
            </label>
            <button type="button" class="quote-button" data-sound-remove aria-label="Remove song">Remove</button>
        `;
        const input = row.querySelector('[data-sound-link]');
        input.value = value;
        input.addEventListener('focus', () => { holdCloseUntil = Date.now() + 700; });
        input.addEventListener('input', () => applyDrafts(false));
        input.addEventListener('change', () => applyDrafts(true));
        row.querySelector('[data-sound-remove]').addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            removeRow(row);
        });
        list.append(row);
        return input;
    }
    function paintRows() {
        const focused = root.activeElement;
        const values = drafts.length ? drafts : [''];
        while (list.children.length > values.length) list.lastElementChild.remove();
        while (list.children.length < values.length) addRow('');
        values.forEach((value, index) => {
            const row = list.children[index];
            const input = row.querySelector('[data-sound-link]');
            row.querySelector('[data-sound-label]').textContent = index === 0 ? 'Song' : `Song ${index + 1}`;
            if (input !== focused) input.value = value;
            row.querySelector('[data-sound-remove]').hidden = values.length < 2;
        });
        addBtn.disabled = values.length >= SOUND_LINKS_MAX;
        addBtn.hidden = values.length >= SOUND_LINKS_MAX;
    }
    function applyDrafts(persistEmpty) {
        drafts = songInputs().map((input) => input.value);
        const links = parseSongLinks(drafts.join('\n'));
        const typed = drafts.some((value) => String(value || '').trim());
        if (typed && !links.length) {
            if (!persistEmpty) return;
            showError('Use a YouTube, Spotify, or Apple Music link.');
            prefs = { songUrl: '' };
        } else if (links.length || persistEmpty) {
            showError('');
            prefs = { songUrl: links.join('\n') };
        } else return;
        writeStored();
        paint();
    }
    function removeRow(row) {
        if (!row?.parentNode || list.children.length < 2) return;
        row.remove();
        applyDrafts(true);
    }
    function frameSrc(src) {
        return withPlayerOrigin(src, root.defaultView?.location?.origin);
    }
    function embedKey(href) {
        try {
            const url = new URL(href);
            url.searchParams.delete('autoplay');
            url.searchParams.delete('origin');
            return url.href;
        } catch {
            return href || '';
        }
    }
    function paintEmbed() {
        const src = frameSrc(youtubeEmbedUrl(prefs.songUrl));
        controls.hidden = !src;
        embedHost.hidden = !src;
        playBtn.hidden = !src;
        let frame = embedHost.querySelector('iframe');
        if (!src) {
            youtube.destroy();
            frame?.remove();
            playing = false;
            paintPlay();
            controls.classList.remove('is-docked');
            embedHost.classList.remove('is-docked');
            root.documentElement.classList.remove('is-sound-youtube');
            return;
        }
        if (!frame) {
            frame = root.createElement('iframe');
            frame.id = 'editorSoundFrame';
            frame.title = 'YouTube';
            frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
            frame.setAttribute('allowfullscreen', '');
            frame.referrerPolicy = 'strict-origin-when-cross-origin';
            embedHost.append(frame);
        }
        if (embedKey(frame.dataset.embed) !== embedKey(src)) {
            youtube.destroy();
            frame.dataset.embed = src;
            frame.src = src;
            playing = false;
            void loadYoutubeApi(root);
        }
        const dock = Boolean(src) && (
            panel.hidden
            || root.documentElement.classList.contains('is-typewriter')
            || root.documentElement.classList.contains('is-editor-keyboard')
        );
        controls.classList.toggle('is-docked', dock);
        embedHost.classList.toggle('is-docked', dock);
        root.documentElement.classList.toggle('is-sound-youtube', Boolean(src));
        placeControls();
        paintPlay();
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
        paintRows();
        if (copyEl) {
            copyEl.textContent = embed
                ? 'Tap the green play to start the first song. Hide video keeps a tiny player with the tools.'
                : 'Paste a YouTube playlist, Mix, or a video link. Use + to queue another song.';
        }
        songOpen.hidden = !provider || Boolean(embed);
        songOpen.href = parseSongLinks(prefs.songUrl)[0] || '#';
        songOpen.textContent = provider ? `Open in ${provider}` : 'Open song';
        if (hideBtn) hideBtn.hidden = !embed;
        paintEmbed();
    }
    function setOpen(open) {
        panel.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        paint();
    }
    button.addEventListener('click', () => setOpen(panel.hidden));
    addBtn.addEventListener('click', () => {
        holdCloseUntil = Date.now() + 700;
        drafts = songInputs().map((input) => input.value);
        if (drafts.length >= SOUND_LINKS_MAX) return;
        drafts.push('');
        paintRows();
        songInputs().at(-1)?.focus();
    });
    playBtn.addEventListener('click', () => {
        holdCloseUntil = Date.now() + 700;
        const frame = embedHost.querySelector('iframe');
        if (!frame) return;
        if (playing) {
            void youtube.pause();
            const paused = new URL(frame.src);
            paused.searchParams.delete('autoplay');
            frame.dataset.embed = paused.href;
            frame.src = paused.href;
            playing = false;
            paintPlay();
            return;
        }
        const url = new URL(frame.src);
        url.searchParams.set('autoplay', '1');
        url.searchParams.set('index', '0');
        frame.dataset.embed = url.href;
        frame.src = url.href;
        playing = true;
        paintPlay();
        void youtube.playFirst();
    });
    hideBtn?.addEventListener('click', () => setOpen(false));
    function onPointerDown(event) {
        if (panel.hidden) return;
        if (Date.now() < holdCloseUntil) return;
        if (panel.contains(event.target) || button.contains(event.target) || controls.contains(event.target)) return;
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
    const classWatch = new MutationObserver(paint);
    classWatch.observe(root.documentElement, { attributes: true, attributeFilter: ['class'] });
    paint();

    return {
        getPrefs: () => ({ ...prefs }),
        destroy() {
            classWatch.disconnect();
            root.removeEventListener('pointerdown', onPointerDown);
            root.removeEventListener('keydown', onKey);
            youtube.destroy();
            root.documentElement.classList.remove('is-sound-youtube');
        },
    };
}
