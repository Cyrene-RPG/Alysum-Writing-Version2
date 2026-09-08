const BASE = "/applications/roadmap/sounds/sound-elements";
const VOLUME = 0.2;

const clips = {
    hover: `${BASE}/HoverOF.wav`,
    filterClick: `${BASE}/hoverSmall.wav`,
    tab: `${BASE}/TabSwitch.wav`,
    tabAlt: `${BASE}/TabSwitch2.wav`,
    up: `${BASE}/Upvote.wav?v=2`,
    down: `${BASE}/DownVote.wav`,
    suggest: `${BASE}/Sumbit.wav`,
    report: `${BASE}/SubmitTwo.wav`,
    error: `${BASE}/error.wav`,
    commentsOpen: `${BASE}/OpenComments.wav`,
    commentsFail: `${BASE}/CommentsFail.wav`,
    commentsSucceed: `${BASE}/CommentsSucceed.wav?v=2`,
    anon: `${BASE}/Anyn.wav`,
};

const pool = new Map();
let bound = false;

function load(url) {
    const audio = new Audio(url);
    audio.preload = "auto";
    pool.set(url, audio);
    return audio;
}

function play(url, volume = VOLUME) {
    const source = pool.get(url);
    if (!source) return;
    const voice = source.cloneNode();
    voice.volume = volume;
    void voice.play().catch(() => {});
}

function playTab() {
    play(Math.random() < 0.25 ? clips.tabAlt : clips.tab);
}

export function playUiSound(name) {
    const url = clips[name];
    if (!url) return;
    if (!pool.has(url)) load(url);
    play(url);
}

function onClick(event) {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (t.closest(".upvote")) {
        play(clips.up, 0.1);
        return;
    }
    if (t.closest(".downvote")) {
        play(clips.down, 0.06);
        return;
    }
    if (t.closest("button[data-filter]")) {
        play(clips.filterClick, 0.1);
        return;
    }
    if (t.closest(".anon-check")) {
        play(clips.anon);
        return;
    }
    if (
        t.closest("nav button[data-page]") ||
        t.closest("#bugsFileReport") ||
        t.closest("#suggestToggle")
    ) {
        playTab();
        return;
    }
}

export function bindUiSounds() {
    if (bound) return;
    bound = true;
    Object.values(clips).forEach(load);
    document.querySelectorAll("nav button[data-page], .nav-more").forEach((button) => {
        button.addEventListener("mouseenter", () => play(clips.hover, 0.182));
    });
    document.querySelector(".frame")?.addEventListener("click", onClick);
}
