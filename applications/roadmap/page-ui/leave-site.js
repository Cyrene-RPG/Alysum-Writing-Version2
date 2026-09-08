import { hushBackgroundMusic } from "./background-music.js?v=14";
import {
    ensureLeaveLayers,
    loadLeaveSiteCss,
    playLeaveFx,
    prepareLeaveSnapshot,
} from "./leave-site-fx.js?v=1";

const BASE = "/applications/roadmap/sounds/sound-elements";
const LEAVE2 = `${BASE}/Leave2.wav`;
const LEAVE_SITE = `${BASE}/LeaveSite.wav`;
const VOLUME = 0.52;

let leaving = false;

function isSkipKey(event) {
    if (event.repeat) return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    const key = event.key || "";
    if (/^F\d{1,2}$/.test(key)) return false;
    return true;
}

function hushClip(audio) {
    if (!audio) return;
    try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
    } catch {
        /* ignore */
    }
}

function jumpLeave(href, clips) {
    clips.forEach(hushClip);
    document.documentElement.style.background = "#000";
    document.body.style.background = "#000";
    location.href = href;
}

function playClip(url, volume = VOLUME) {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = volume;
    return audio;
}

function waitEnded(audio) {
    return new Promise((resolve) => {
        if (!audio) {
            resolve();
            return;
        }
        const done = () => resolve();
        audio.addEventListener("ended", done, { once: true });
        audio.addEventListener("error", done, { once: true });
    });
}

function armClip(audio) {
    if (!audio) return Promise.resolve();
    const vol = audio.volume;
    audio.volume = 0;
    return audio.play().then(() => {
        if (audio.dataset?.live === "1") return;
        audio.pause();
        audio.currentTime = 0;
        audio.volume = vol;
    }).catch(() => {
        audio.volume = vol;
    });
}

async function leaveTo(href) {
    if (leaving) return;
    leaving = true;
    loadLeaveSiteCss();
    ensureLeaveLayers();
    document.documentElement.classList.add("is-leaving");
    hushBackgroundMusic();

    const sting = playClip(LEAVE2);
    const site = playClip(LEAVE_SITE);
    let skipped = false;
    const onKey = (event) => {
        if (!isSkipKey(event)) return;
        event.preventDefault();
        skipped = true;
        window.removeEventListener("keydown", onKey, true);
        jumpLeave(href, [sting, site]);
    };
    window.addEventListener("keydown", onKey, true);
    void armClip(site);
    const stingDone = waitEnded(sting);
    void sting.play().catch(() => {});
    const snapshot = prepareLeaveSnapshot();
    await stingDone;
    if (skipped) return;

    site.dataset.live = "1";
    site.volume = VOLUME;
    site.currentTime = 0;
    const siteDone = waitEnded(site);
    void site.play().catch(() => {});
    await Promise.all([playLeaveFx(await snapshot), siteDone]);
    if (skipped) return;

    window.removeEventListener("keydown", onKey, true);
    document.documentElement.style.background = "#000";
    document.body.style.background = "#000";
    location.href = href;
}

export function bindLeaveSite() {
    const link = document.querySelector(".return-btn");
    if (!link || link.dataset.leaveWired === "1") return;
    link.dataset.leaveWired = "1";
    loadLeaveSiteCss();
    link.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void leaveTo(link.href || "/library");
    });
}
