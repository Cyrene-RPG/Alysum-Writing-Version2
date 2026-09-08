const START_UP = "/applications/roadmap/sounds/start-up";
const CLICK_R = `${START_UP}/ClickR.wav`;
const LINK_START = `${START_UP}/LinkStart.wav`;
const CHECK_1 = `${START_UP}/Check1.wav`;
const CHECK_2 = `${START_UP}/Check2.wav`;
const ENDING = `${START_UP}/EndingSound.wav`;
const VOLUME = 0.45;

const live = new Set();
const waiters = new Map();

function finishClip(audio) {
    if (!live.has(audio) && !waiters.has(audio)) return;
    live.delete(audio);
    const resolve = waiters.get(audio);
    waiters.delete(audio);
    resolve?.();
}

function playClip(url, volume = VOLUME) {
    const audio = new Audio(url);
    audio.volume = volume;
    const done = new Promise((resolve) => {
        waiters.set(audio, resolve);
        audio.addEventListener("ended", () => finishClip(audio), { once: true });
        audio.addEventListener("error", () => finishClip(audio), { once: true });
    });
    live.add(audio);
    void audio.play().catch(() => finishClip(audio));
    return done;
}

export function stopWaypointAudio() {
    for (const audio of [...live]) {
        try {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
        } catch {
            /* ignore */
        }
        finishClip(audio);
    }
}

export function playClickR() {
    return playClip(CLICK_R);
}

export function playLinkStart() {
    return playClip(LINK_START);
}

export function playCheck1() {
    return playClip(CHECK_1);
}

export function playCheck2() {
    return playClip(CHECK_2);
}

export function playEndingSound() {
    return playClip(ENDING);
}
