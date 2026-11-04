import { atmosphereBed, DEFAULT_SOUND_VOLUME } from './model.js';

function noiseBuffer(context, seconds = 2) {
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

function loopNoise(context, destination, buffer, type, frequency, q, gainValue) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    if (Number.isFinite(q)) filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start();
    return () => {
        try { source.stop(); } catch { /* already stopped */ }
        try { source.disconnect(); filter.disconnect(); gain.disconnect(); } catch { /* already torn down */ }
    };
}

function startRain(context, destination, noise) {
    return [
        loopNoise(context, destination, noise, 'bandpass', 4200, 0.65, 0.28),
        loopNoise(context, destination, noise, 'highpass', 700, 0.4, 0.16),
    ];
}

function startCafe(context, destination, noise) {
    return [
        loopNoise(context, destination, noise, 'lowpass', 420, 0.7, 0.22),
        loopNoise(context, destination, noise, 'bandpass', 180, 0.8, 0.08),
    ];
}

function startNight(context, destination, noise) {
    const stops = [loopNoise(context, destination, noise, 'highpass', 2400, 0.5, 0.05)];
    let alive = true;
    let timer = 0;
    function chirp() {
        if (!alive || typeof context.currentTime !== 'number') return;
        const osc = context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 3600 + Math.random() * 1100;
        const gain = context.createGain();
        const now = context.currentTime;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.035, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
        osc.connect(gain);
        gain.connect(destination);
        osc.start(now);
        osc.stop(now + 0.1);
        timer = setTimeout(chirp, 900 + Math.random() * 2200);
    }
    timer = setTimeout(chirp, 400);
    stops.push(() => {
        alive = false;
        clearTimeout(timer);
    });
    return stops;
}

function startFire(context, destination, noise) {
    const stops = [loopNoise(context, destination, noise, 'lowpass', 240, 0.8, 0.28)];
    let alive = true;
    let timer = 0;
    function pop() {
        if (!alive || typeof context.currentTime !== 'number') return;
        const source = context.createBufferSource();
        source.buffer = noise;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 700 + Math.random() * 1600;
        const gain = context.createGain();
        const now = context.currentTime;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.28, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination);
        source.start(now);
        source.stop(now + 0.16);
        timer = setTimeout(pop, 350 + Math.random() * 1300);
    }
    timer = setTimeout(pop, 200);
    stops.push(() => {
        alive = false;
        clearTimeout(timer);
    });
    return stops;
}

const BEDS = { rain: startRain, cafe: startCafe, night: startNight, fire: startFire };

export function createAtmospherePlayer({ createContext } = {}) {
    let context = null;
    let master = null;
    let noise = null;
    let stops = [];
    let bedId = '';
    let playing = false;
    let muted = false;
    let volume = DEFAULT_SOUND_VOLUME;

    function applyGain() {
        if (!master) return;
        master.gain.value = playing && !muted ? volume : 0;
    }

    function stopBed() {
        for (const stop of stops) {
            try { stop(); } catch { /* ignore teardown races */ }
        }
        stops = [];
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
        noise = noiseBuffer(context);
        applyGain();
        return context;
    }

    return {
        async play(id) {
            const bed = atmosphereBed(id);
            if (!bed) throw new Error('Choose rain, cafe, night, or fire.');
            const next = ensureContext();
            if (typeof next.resume === 'function' && next.state === 'suspended') await next.resume();
            stopBed();
            bedId = bed.id;
            playing = true;
            stops = (BEDS[bed.id] || startRain)(next, master, noise);
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
            try { master?.disconnect(); } catch { /* already gone */ }
            context = null;
            master = null;
            noise = null;
        },
    };
}
