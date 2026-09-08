const BASE = "/applications/roadmap/sounds/background-music";
const ONE_URL = `${BASE}/BackroundOne.aac`;
const TWO_URL = `${BASE}/BackgroundTwo.aac`;
const VOLUME_ONE = 0.0948;
const VOLUME_TWO = 0.0948;
const SOUND_KEY = "alysum:roadmap:bg-music";
const MIN_WAIT = 3 * 60 * 1000;
const MAX_WAIT = 7 * 60 * 1000;
const FADE_MIN = 10000;
const FADE_MAX = 16000;
const START_FADE = 400;
const MUTE_FADE = 800;
const SEEK_MS = 1200;
const TAIL_PAD = 15;
const LAST_WINDOW = 30;

let one;
let two;
let current = "one";
let lastStart = { one: -1, two: -1 };
let bound = false;
let unlocked = false;
let live = false;
let everStarted = false;
let busy = false;
let fadeGen = 0;
let fadeRaf = 0;
let timer = 0;
let waitDelay = 0;
let waitStartedAt = 0;
let waitLeft = 0;
let pausedForHide = false;

function musicOn() {
    return localStorage.getItem(SOUND_KEY) !== "0";
}

function randBetween(min, max) {
    return min + Math.random() * (max - min);
}

function player(id) {
    return id === "two" ? two : one;
}

function volumeFor(id) {
    return id === "two" ? VOLUME_TWO : VOLUME_ONE;
}

function otherId(id) {
    return id === "one" ? "two" : "one";
}

function paintToggle(button) {
    if (!button) return;
    const on = musicOn();
    button.classList.toggle("is-off", !on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
}

function cancelFade() {
    fadeGen += 1;
    if (fadeRaf) cancelAnimationFrame(fadeRaf);
    fadeRaf = 0;
}

function cancelWait() {
    if (timer) clearTimeout(timer);
    timer = 0;
}

function armWait() {
    cancelWait();
    if (!musicOn() || !live || document.visibilityState !== "visible") return;
    waitDelay = randBetween(MIN_WAIT, MAX_WAIT);
    waitLeft = waitDelay;
    waitStartedAt = Date.now();
    timer = setTimeout(() => {
        timer = 0;
        void onCheck();
    }, waitDelay);
}

function fadeVolume(audio, from, to, ms) {
    const gen = fadeGen;
    return new Promise((resolve) => {
        const start = performance.now();
        audio.volume = from;
        const tick = (now) => {
            if (gen !== fadeGen) {
                resolve(false);
                return;
            }
            const t = Math.min(1, (now - start) / ms);
            audio.volume = from + (to - from) * t;
            if (t < 1) {
                fadeRaf = requestAnimationFrame(tick);
                return;
            }
            audio.volume = to;
            resolve(true);
        };
        fadeRaf = requestAnimationFrame(tick);
    });
}

function equalPowerFade(outgoingId, incomingId, ms) {
    const outgoing = player(outgoingId);
    const incoming = player(incomingId);
    const outVol = volumeFor(outgoingId);
    const inVol = volumeFor(incomingId);
    const gen = fadeGen;
    return new Promise((resolve) => {
        const start = performance.now();
        const tick = (now) => {
            if (gen !== fadeGen) {
                resolve(false);
                return;
            }
            const t = Math.min(1, (now - start) / ms);
            const incomingT = t * t;
            outgoing.volume = outVol * Math.cos((t * Math.PI) / 2);
            incoming.volume = inVol * Math.sin((incomingT * Math.PI) / 2);
            if (t < 1) {
                fadeRaf = requestAnimationFrame(tick);
                return;
            }
            outgoing.pause();
            outgoing.volume = 0;
            incoming.volume = inVol;
            resolve(true);
        };
        fadeRaf = requestAnimationFrame(tick);
    });
}

function waitEvent(audio, name, ms) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            audio.removeEventListener(name, onOk);
            audio.removeEventListener("error", onErr);
            clearTimeout(tid);
            resolve(ok);
        };
        const onOk = () => finish(true);
        const onErr = () => finish(false);
        audio.addEventListener(name, onOk);
        audio.addEventListener("error", onErr);
        const tid = setTimeout(() => finish(false), ms);
    });
}

async function ensureDuration(audio) {
    if (Number.isFinite(audio.duration) && audio.duration > 1) return true;
    return waitEvent(audio, "loadedmetadata", SEEK_MS);
}

function pickStart(audio, last) {
    const dur = audio.duration;
    if (!Number.isFinite(dur) || dur <= 1) return 0;
    const span = Math.max(0, dur - TAIL_PAD);
    if (span <= 1) return 0;
    let picked = Math.random() * span;
    for (let i = 0; i < 8; i += 1) {
        if (!Number.isFinite(last) || last < 0 || Math.abs(picked - last) >= LAST_WINDOW) {
            return picked;
        }
        picked = Math.random() * span;
    }
    return picked;
}

function seekLanded(audio, target) {
    if (!Number.isFinite(target)) return audio.readyState >= 2;
    return audio.readyState >= 2 && Math.abs(audio.currentTime - target) < 2;
}

async function waitForSeek(audio, target) {
    if (seekLanded(audio, target)) return true;
    await waitEvent(audio, "seeked", SEEK_MS);
    return seekLanded(audio, target) || audio.readyState >= 2;
}

async function playTrack(id, fromStart) {
    const audio = player(id);
    const other = player(otherId(id));
    other.pause();
    other.volume = 0;
    audio.volume = 0;
    let startAt = fromStart ? 0 : pickStart(audio, lastStart[id]);
    if (startAt > 0) audio.currentTime = startAt;
    try {
        await audio.play();
    } catch (err) {
        if (startAt > 0) {
            startAt = 0;
            audio.currentTime = 0;
            await audio.play();
        } else {
            throw err;
        }
    }
    lastStart[id] = startAt;
    current = id;
    return audio;
}

async function startFirst() {
    if (!musicOn() || live || busy) return;
    busy = true;
    const first = Math.random() < 0.5 ? "one" : "two";
    let cur;
    try {
        cur = await playTrack(first, true);
    } catch (err) {
        try {
            cur = await playTrack(otherId(first), true);
        } catch (retryErr) {
            console.error("roadmap music play", retryErr || err);
            busy = false;
            return;
        }
    }
    live = true;
    everStarted = true;
    const ok = await fadeVolume(cur, 0, volumeFor(current), START_FADE);
    busy = false;
    if (ok && musicOn() && live) armWait();
}

async function switchTo(nextId) {
    const incoming = player(nextId);
    const outgoing = player(otherId(nextId));
    if (!(await ensureDuration(incoming))) {
        armWait();
        return;
    }
    const startAt = pickStart(incoming, lastStart[nextId]);
    busy = true;
    incoming.volume = 0;
    try {
        incoming.currentTime = startAt;
        await incoming.play();
    } catch {
        incoming.pause();
        busy = false;
        armWait();
        return;
    }
    incoming.volume = 0;
    const ready = startAt > 0 ? await waitForSeek(incoming, startAt) : incoming.readyState >= 2;
    let landed = startAt;
    if (!ready) {
        incoming.currentTime = 0;
        landed = 0;
    }
    if (!musicOn() || !live) {
        incoming.pause();
        incoming.volume = 0;
        busy = false;
        if (musicOn() && live) armWait();
        return;
    }
    lastStart[nextId] = landed;
    const faded = await equalPowerFade(otherId(nextId), nextId, randBetween(FADE_MIN, FADE_MAX));
    if (faded) current = nextId;
    busy = false;
    if (musicOn() && live) armWait();
}

async function onCheck() {
    if (!musicOn() || !live || busy || document.visibilityState !== "visible") {
        if (musicOn() && live && document.visibilityState === "visible") armWait();
        return;
    }
    const chance = current === "one" ? 0.4 : 0.7;
    if (Math.random() >= chance) {
        armWait();
        return;
    }
    await switchTo(otherId(current));
}

function snapCurrent() {
    const cur = player(current);
    const other = player(otherId(current));
    other.pause();
    other.volume = 0;
    cur.volume = volumeFor(current);
}

async function muteNow() {
    cancelWait();
    cancelFade();
    busy = false;
    const cur = player(current);
    if (live && !cur.paused && cur.volume > 0) {
        fadeGen += 1;
        const gen = fadeGen;
        const from = cur.volume;
        await new Promise((resolve) => {
            const start = performance.now();
            const tick = (now) => {
                if (gen !== fadeGen) {
                    resolve();
                    return;
                }
                const t = Math.min(1, (now - start) / MUTE_FADE);
                cur.volume = from * (1 - t);
                if (t < 1) {
                    fadeRaf = requestAnimationFrame(tick);
                    return;
                }
                resolve();
            };
            fadeRaf = requestAnimationFrame(tick);
        });
    }
    one.pause();
    two.pause();
    one.volume = 0;
    two.volume = 0;
    live = false;
}

async function resumeCurrent() {
    if (!musicOn() || live || busy) return;
    busy = true;
    const cur = player(current);
    cur.volume = 0;
    try {
        await cur.play();
    } catch {
        busy = false;
        return;
    }
    live = true;
    const ok = await fadeVolume(cur, 0, volumeFor(current), START_FADE);
    busy = false;
    if (ok && musicOn() && live) armWait();
}

async function onToggle(button) {
    const next = !musicOn();
    localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    paintToggle(button);
    unlocked = true;
    if (!next) {
        await muteNow();
        return;
    }
    if (everStarted) void resumeCurrent();
    else void startFirst();
}

function onHide() {
    if (timer) {
        waitLeft = Math.max(0, waitDelay - (Date.now() - waitStartedAt));
        cancelWait();
    }
    if (busy) {
        cancelFade();
        snapCurrent();
        busy = false;
    }
    if (live) {
        one.pause();
        two.pause();
        pausedForHide = true;
    }
}

function onShow() {
    if (!pausedForHide) return;
    pausedForHide = false;
    if (!musicOn() || !unlocked) return;
    const cur = player(current);
    cur.volume = volumeFor(current);
    live = true;
    void cur.play().catch(() => {});
    waitDelay = waitLeft;
    waitStartedAt = Date.now();
    timer = setTimeout(() => {
        timer = 0;
        void onCheck();
    }, waitLeft);
}

function makePlayer(url) {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = 0;
    return audio;
}

export function hushBackgroundMusic() {
    cancelWait();
    cancelFade();
    busy = false;
    live = false;
    one?.pause();
    two?.pause();
    if (one) one.volume = 0;
    if (two) two.volume = 0;
}

export function bindBackgroundMusic() {
    if (bound) return;
    bound = true;
    one = makePlayer(ONE_URL);
    two = makePlayer(TWO_URL);
    const button = document.getElementById("musicToggle");
    paintToggle(button);
    button?.addEventListener("click", (event) => {
        event.stopPropagation();
        unlocked = true;
        if (!live) {
            if (!musicOn()) {
                localStorage.setItem(SOUND_KEY, "1");
                paintToggle(button);
            }
            void startFirst();
            return;
        }
        void onToggle(button);
    });
    const unlock = (event) => {
        if (event.target?.closest?.("#musicToggle")) return;
        unlocked = true;
        if (musicOn() && !live) void startFirst();
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") onHide();
        else onShow();
    });
    unlocked = true;
    if (musicOn()) void startFirst();
}
