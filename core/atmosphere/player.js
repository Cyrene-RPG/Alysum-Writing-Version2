import { atmosphereBed, atmosphereLoopUrls, DEFAULT_SOUND_VOLUME, missingLoopMessage } from './model.js';

async function decodeBuffer(context, bytes) {
    const copy = bytes.slice(0);
    if (typeof context.decodeAudioData !== 'function') {
        throw new Error('This browser cannot play atmosphere sound.');
    }
    if (context.decodeAudioData.length > 1) {
        return await new Promise((resolve, reject) => {
            context.decodeAudioData(copy, resolve, reject);
        });
    }
    return await context.decodeAudioData(copy);
}

async function fetchLoop(context, id, fetchAudio) {
    const request = fetchAudio || globalThis.fetch;
    if (typeof request !== 'function') throw new Error(missingLoopMessage(id));
    for (const url of atmosphereLoopUrls(id)) {
        try {
            const response = await request(url);
            if (!response?.ok) continue;
            const bytes = await response.arrayBuffer();
            if (!bytes || !bytes.byteLength) continue;
            try {
                return await decodeBuffer(context, bytes);
            } catch {
                throw new Error(`${atmosphereBed(id)?.label || 'That'} file could not be read. Export it as OGG or MP3 and try again.`);
            }
        } catch (error) {
            if (error instanceof Error && /could not be read/.test(error.message)) throw error;
        }
    }
    throw new Error(missingLoopMessage(id));
}

export function createAtmospherePlayer({ createContext, fetchAudio, loadLoop } = {}) {
    let context = null;
    let master = null;
    let source = null;
    let bedId = '';
    let playing = false;
    let muted = false;
    let volume = DEFAULT_SOUND_VOLUME;
    const cache = new Map();

    function applyGain() {
        if (!master) return;
        master.gain.value = playing && !muted ? volume : 0;
    }

    function stopBed() {
        if (!source) return;
        try { source.stop(); } catch { /* already stopped */ }
        try { source.disconnect(); } catch { /* already torn down */ }
        source = null;
    }

    function ensureContext() {
        if (context) return context;
        if (createContext) {
            context = createContext();
        } else {
            const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
            if (!Ctor) throw new Error('This browser cannot play atmosphere sound.');
            context = new Ctor();
        }
        if (!context) throw new Error('This browser cannot play atmosphere sound.');
        master = context.createGain();
        master.connect(context.destination);
        applyGain();
        return context;
    }

    async function bufferFor(id) {
        if (cache.has(id)) return cache.get(id);
        const next = ensureContext();
        const buffer = loadLoop
            ? await loadLoop(next, id)
            : await fetchLoop(next, id, fetchAudio);
        if (!buffer) throw new Error(missingLoopMessage(id));
        cache.set(id, buffer);
        return buffer;
    }

    return {
        async play(id) {
            const bed = atmosphereBed(id);
            if (!bed) throw new Error('Choose rain, cafe, night, or fire.');
            const next = ensureContext();
            const buffer = await bufferFor(bed.id);
            if (typeof next.resume === 'function' && next.state === 'suspended') await next.resume();
            stopBed();
            source = next.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            source.connect(master);
            source.start();
            bedId = bed.id;
            playing = true;
            applyGain();
            return this.getState();
        },
        pause() {
            playing = false;
            stopBed();
            applyGain();
            return this.getState();
        },
        setVolume(value) {
            const next = Number(value);
            volume = Number.isFinite(next) ? Math.min(1, Math.max(0, next)) : volume;
            applyGain();
            return this.getState();
        },
        setMuted(value) {
            muted = value === true;
            applyGain();
            return this.getState();
        },
        getState() {
            return { bed: bedId, playing, muted, volume };
        },
        destroy() {
            this.pause();
            bedId = '';
            cache.clear();
            try { master?.disconnect(); } catch { /* already gone */ }
            context = null;
            master = null;
        },
    };
}
