/** Discord-style Word Wars lobby join chime (Web Audio — no asset file). */

let audioCtx = null;
let audioPrimed = false;

function getAudioContext() {
    if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
    }
    return audioCtx;
}

function playSilentUnlock(ctx) {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.00001;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    source.stop(ctx.currentTime + 0.01);
}

/** Soft ascending two-note join sound similar to Discord voice channel joins. */
export function playWordWarJoinSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === "suspended") {
            void ctx.resume().then(() => {
                if (audioPrimed) playWordWarJoinSound();
            });
            return;
        }

        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.28, now + 0.012);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
        master.connect(ctx.destination);

        const playTone = (frequency, start, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.95, start + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            osc.connect(gain);
            gain.connect(master);
            osc.start(start);
            osc.stop(start + duration + 0.02);
        };

        playTone(587.33, now, 0.11);
        playTone(880, now + 0.1, 0.18);
    } catch (err) {
        console.warn("Word War join sound failed", err);
    }
}

/** Call after a user gesture so autoplay policies allow the join chime. */
export async function primeWordWarSounds() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        if (ctx.state === "suspended") {
            await ctx.resume();
        }
        if (!audioPrimed) {
            playSilentUnlock(ctx);
            audioPrimed = true;
        }
    } catch (err) {
        console.warn("Word War sound prime failed", err);
    }
}
