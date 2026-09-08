const CLIP_URLS = [
    "/applications/roadmap/sounds/types-sounds/TypeOne.wav",
    "/applications/roadmap/sounds/types-sounds/TypeTwo.wav",
    "/applications/roadmap/sounds/types-sounds/TypeThree.wav",
    "/applications/roadmap/sounds/types-sounds/TypeFour.wav",
    "/applications/roadmap/sounds/types-sounds/TypeFive.wav",
    "/applications/roadmap/sounds/types-sounds/TypeSix.wav",
];

const VOLUME = 0.25;
const THROTTLE_MS = 25;
const SOUND_KEY = "alysum:roadmap:type-sounds";

const clips = [];
let bound = false;
let lastIndex = -1;
let lastPlayAt = 0;

function isTypingField(el) {
    if (!el || !el.closest || !el.closest(".frame")) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName !== "INPUT") return false;
    const type = String(el.type || "text").toLowerCase();
    return type === "text" || type === "search";
}

function isTypingKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key.length === 1) return true;
    return event.key === "Backspace" || event.key === "Delete" || event.key === "Enter" || event.key === " ";
}

function pickIndex() {
    const n = clips.length;
    if (n <= 1) return 0;
    let index = Math.floor(Math.random() * n);
    if (index === lastIndex) index = Math.floor(Math.random() * n);
    return index;
}

function soundsOn() {
    return localStorage.getItem(SOUND_KEY) !== "0";
}

function playClip() {
    if (!soundsOn()) return;
    const now = Date.now();
    if (now - lastPlayAt < THROTTLE_MS) return;
    const index = pickIndex();
    const source = clips[index];
    if (!source) return;
    lastIndex = index;
    lastPlayAt = now;
    const voice = source.cloneNode();
    voice.volume = VOLUME;
    void voice.play().catch(() => {});
}

function onKey(event) {
    if (document.visibilityState !== "visible") return;
    if (!document.hasFocus()) return;
    if (!isTypingField(event.target)) return;
    if (!isTypingKey(event)) return;
    playClip();
}

function preload() {
    for (const url of CLIP_URLS) {
        const audio = new Audio(url);
        audio.preload = "auto";
        audio.addEventListener("error", () => {
            const at = clips.indexOf(audio);
            if (at >= 0) clips.splice(at, 1);
        });
        clips.push(audio);
    }
}

function paintSoundToggle(button) {
    const on = soundsOn();
    button.classList.toggle("is-off", !on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
}

export function bindTypeSounds() {
    if (bound) return;
    bound = true;
    preload();
    document.addEventListener("keydown", onKey, { passive: true });
    const button = document.getElementById("soundToggle");
    if (!button) return;
    paintSoundToggle(button);
    button.addEventListener("click", () => {
        localStorage.setItem(SOUND_KEY, soundsOn() ? "0" : "1");
        paintSoundToggle(button);
    });
}
