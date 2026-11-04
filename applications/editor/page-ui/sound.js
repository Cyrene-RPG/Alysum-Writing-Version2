import {
    ATMOSPHERE_BEDS,
    SOUND_STORAGE_KEY,
    atmosphereBed,
    normalizeSongUrl,
    readSoundPrefs,
    songProviderLabel,
    soundButtonLabel,
    soundChipLabel,
} from '/core/atmosphere/model.js';
import { createAtmospherePlayer } from '/core/atmosphere/player.js';

export function mountEditorSound({
    root = document,
    storage,
    player,
    actions = root.getElementById('editorActions'),
} = {}) {
    const store = storage || root.defaultView?.localStorage;
    const audio = player || createAtmospherePlayer();
    if (!root.getElementById('editorSoundPanel') && !actions) return { destroy() {} };

    const button = ensureButton();
    const panel = ensurePanel();
    const chip = ensureChip();
    const errorEl = panel.querySelector('[data-sound-error]');
    const songInput = panel.querySelector('#editorSoundSong');
    const songOpen = panel.querySelector('#editorSoundOpen');
    const playBtn = panel.querySelector('#editorSoundPlay');
    const muteBtn = panel.querySelector('#editorSoundMute');
    const volume = panel.querySelector('#editorSoundVolume');
    let prefs = readStored();
    let playing = false;

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
            <p class="writer-sound-copy">Rain and room tone are made here. A favorite song opens in Spotify, YouTube, or Apple Music — Alysum does not play or store the track.</p>
            <div class="writer-sound-beds" role="group" aria-label="Atmosphere"></div>
            <div class="writer-sound-controls">
                <button type="button" class="quote-button" id="editorSoundPlay">Play</button>
                <button type="button" class="quote-button" id="editorSoundMute">Mute</button>
                <label class="writer-sound-volume">Volume <input id="editorSoundVolume" type="range" min="0" max="100" step="1"></label>
            </div>
            <label class="writer-sound-song" for="editorSoundSong">Favorite song
                <input id="editorSoundSong" type="url" maxlength="2000" spellcheck="false" placeholder="https://open.spotify.com/track/…">
            </label>
            <a class="quote-button" id="editorSoundOpen" hidden target="_blank" rel="noopener noreferrer">Open song</a>
            <p class="writer-sound-error" data-sound-error role="alert" hidden></p>
        `;
        const beds = node.querySelector('.writer-sound-beds');
        for (const bed of ATMOSPHERE_BEDS) {
            const choice = root.createElement('button');
            choice.type = 'button';
            choice.className = 'quote-button';
            choice.dataset.bed = bed.id;
            choice.setAttribute('aria-pressed', 'false');
            choice.textContent = bed.label;
            choice.title = bed.description;
            beds.append(choice);
        }
        const row = root.getElementById('editorActionRow');
        if (row) row.after(node);
        else (actions || root.body).after(node);
        return node;
    }
    function ensureChip() {
        let node = root.getElementById('editorSoundChip');
        if (node) return node;
        node = root.createElement('button');
        node.type = 'button';
        node.id = 'editorSoundChip';
        node.className = 'writer-sound-chip';
        node.hidden = true;
        node.textContent = 'Sound';
        root.body.append(node);
        return node;
    }
    function showError(message) {
        errorEl.textContent = message || '';
        errorEl.hidden = !message;
    }
    function paint() {
        const bed = atmosphereBed(prefs.bed);
        button.textContent = soundButtonLabel(prefs, playing);
        button.classList.toggle('is-active', playing || panel.hidden === false);
        playBtn.textContent = playing ? 'Pause' : 'Play';
        playBtn.disabled = !bed;
        muteBtn.textContent = prefs.muted ? 'Unmute' : 'Mute';
        muteBtn.setAttribute('aria-pressed', prefs.muted ? 'true' : 'false');
        volume.value = String(Math.round(prefs.volume * 100));
        for (const choice of panel.querySelectorAll('[data-bed]')) {
            choice.setAttribute('aria-pressed', choice.dataset.bed === prefs.bed ? 'true' : 'false');
        }
        songInput.value = prefs.songUrl;
        const provider = songProviderLabel(prefs.songUrl);
        songOpen.hidden = !provider;
        songOpen.href = prefs.songUrl || '#';
        songOpen.textContent = provider ? `Open in ${provider}` : 'Open song';
        const typewriter = root.documentElement.classList.contains('is-typewriter');
        const chipOn = typewriter && Boolean(bed);
        chip.hidden = !chipOn;
        chip.classList.toggle('is-visible', chipOn);
        chip.textContent = soundChipLabel(prefs, playing);
        chip.setAttribute('aria-pressed', prefs.muted ? 'true' : 'false');
        chip.setAttribute('aria-label', prefs.muted ? `Unmute ${bed?.label || 'sound'}` : `Mute ${bed?.label || 'sound'}`);
    }
    async function startBed(id) {
        showError('');
        try {
            const state = await audio.play(id);
            prefs = { ...prefs, bed: state.bed };
            playing = state.playing;
            audio.setMuted(prefs.muted);
            audio.setVolume(prefs.volume);
            writeStored();
        } catch (error) {
            playing = false;
            showError(error?.message || 'Could not start atmosphere sound.');
        }
        paint();
    }
    function pauseBed() {
        audio.pause();
        playing = false;
        paint();
    }
    function setOpen(open) {
        panel.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        paint();
    }
    button.addEventListener('click', () => setOpen(panel.hidden));
    panel.addEventListener('click', (event) => {
        const bed = event.target.closest('[data-bed]')?.dataset.bed;
        if (bed) {
            if (playing && prefs.bed === bed) pauseBed();
            else void startBed(bed);
        }
    });
    playBtn.addEventListener('click', () => {
        if (playing) pauseBed();
        else if (prefs.bed) void startBed(prefs.bed);
    });
    muteBtn.addEventListener('click', () => {
        prefs = { ...prefs, muted: !prefs.muted };
        audio.setMuted(prefs.muted);
        writeStored();
        paint();
    });
    chip.addEventListener('click', () => {
        prefs = { ...prefs, muted: !prefs.muted };
        audio.setMuted(prefs.muted);
        writeStored();
        paint();
    });
    volume.addEventListener('input', () => {
        prefs = { ...prefs, volume: Number(volume.value) / 100 };
        audio.setVolume(prefs.volume);
        writeStored();
    });
    songInput.addEventListener('change', () => {
        const next = normalizeSongUrl(songInput.value);
        if (String(songInput.value || '').trim() && !next) {
            showError('Use a Spotify, YouTube, or Apple Music link. Alysum does not play the song here.');
            prefs = { ...prefs, songUrl: '' };
        } else {
            showError('');
            prefs = { ...prefs, songUrl: next };
        }
        writeStored();
        paint();
    });
    function onPointerDown(event) {
        if (panel.hidden) return;
        const target = event.target;
        if (panel.contains(target) || button.contains(target)) return;
        setOpen(false);
    }
    function onKey(event) {
        if (event.key !== 'Escape' || panel.hidden) return;
        if (root.documentElement.classList.contains('is-typewriter')) return;
        event.preventDefault();
        setOpen(false);
        button.focus();
    }
    const classWatch = new MutationObserver(paint);
    classWatch.observe(root.documentElement, { attributes: true, attributeFilter: ['class'] });
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('keydown', onKey);
    audio.setVolume(prefs.volume);
    audio.setMuted(prefs.muted);
    paint();

    return {
        getPrefs: () => ({ ...prefs, playing }),
        destroy() {
            classWatch.disconnect();
            root.removeEventListener('pointerdown', onPointerDown);
            root.removeEventListener('keydown', onKey);
            audio.destroy();
            pauseBed();
        },
    };
}
