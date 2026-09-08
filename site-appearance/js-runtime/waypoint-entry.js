import { playCheck1, playCheck2, playEndingSound, playLinkStart, stopWaypointAudio } from "./waypoint-entry-audio.js?v=2";
import {
    abortShatter,
    setTunnelSpeed,
    shatterAndReveal,
    startTunnel,
    stopTunnel,
} from "./waypoint-entry-fx.js?v=2";

const RAY_COLORS = ["#e8453f", "#e0d43f", "#4fd6e0", "#c93fd6", "#7a8085", "#3fe06a", "#2e2e2e"];
const SENSE_WORDS = ["Sight", "Sound", "Smell", "Taste", "Touch"];
const RING_TOPS = [8, 26, 44, 62, 80];
const GLYPHS = [...new Set([
    "ᑑ𝙹ꖌᔑᑑᓭℸʖ⍑ꖎᓭᑑリ𝙹⋮⚍╎ꖎリリ",
    "ᒷリ⚍ᒲʖ∷リᔑᒲᒷ",
    "⎓ᒷᔑℸ¡ㅜᒷ ᓭ⚍リᒷ∷",
    "ᔑ ʖ ᓵ ᔑ ᒷ ⎓ ⊣ ⍑"
].join(""))];

const SKIP = Symbol("skip");

let playing = false;
let ringSlots = [];
let scrambleTimer = 0;
let typeTimer = 0;
let skipCtl = null;

function loadCss() {
    if (document.querySelector("link[data-waypoint-entry-css]")) return;
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = "/site-appearance/css-styles/waypoint-entry.css?v=12";
    sheet.setAttribute("data-waypoint-entry-css", "");
    document.head.appendChild(sheet);
}

function ensureLayer() {
    let seq = document.getElementById("waypoint-entry");
    if (seq) return seq;
    seq = document.createElement("div");
    seq.id = "waypoint-entry";
    seq.innerHTML = `
      <div class="waypoint-stage" id="waypoint-burst"></div>
      <div class="waypoint-stage" id="waypoint-matrix">
        <canvas id="waypoint-tunnel"></canvas>
        <div id="waypoint-loading-label">
          <div class="waypoint-loading-title">Entering Waypoint</div>
          <div class="waypoint-skip-hint">
            <span class="waypoint-skip-hint-desk">space to skip</span>
            <span class="waypoint-skip-hint-hand">double tap to quit</span>
          </div>
        </div>
        <div id="waypoint-loading-bar"><div id="waypoint-loading-fill"></div></div>
      </div>
      <div class="waypoint-stage" id="waypoint-rings"></div>
      <div class="waypoint-stage" id="waypoint-lang">
        <div class="waypoint-lang-wrap">
          <div class="waypoint-lang-bar waypoint-lang-title">Language</div>
          <div class="waypoint-lang-menu" id="waypoint-lang-menu">
            <div class="waypoint-lang-option"><span class="arrow">▶</span><span>English</span></div>
            <div class="waypoint-lang-option"><span class="arrow">▶</span><span>中文</span></div>
            <div class="waypoint-lang-option"><span class="arrow">▶</span><span>한국어</span></div>
            <div class="waypoint-lang-option"><span class="arrow">▶</span><span>Japanese</span></div>
          </div>
        </div>
      </div>
      <div class="waypoint-stage" id="waypoint-connect">
        <div class="waypoint-panel" id="waypoint-connect-panel">
          <div class="waypoint-panel-title">Connect_::</div>
          <div class="waypoint-panel-label">:node</div>
          <div class="waypoint-panel-field" id="waypoint-account"></div>
          <div class="waypoint-panel-label">:key</div>
          <div class="waypoint-panel-field" id="waypoint-password"></div>
        </div>
      </div>
      <div class="waypoint-stage" id="waypoint-resume">
        <div class="waypoint-panel">
          <div class="waypoint-panel-prompt">Existing session data found.<br>Resume where you left off?</div>
          <div class="waypoint-panel-field" id="waypoint-resume-user" style="display:block;width:100%;text-align:center;margin-bottom:16px;box-sizing:border-box;">guest_user</div>
          <div class="waypoint-panel-choices">
            <div class="waypoint-panel-choice">YES</div>
            <div class="waypoint-panel-choice is-dim">NO</div>
          </div>
        </div>
      </div>
      <div class="waypoint-stage" id="waypoint-welcome">
        <div class="waypoint-welcome">
          Welcome to<br>
          <span class="waypoint-scramble" id="waypoint-scramble">ᑑ𝙹ꖌᔑᑑ</span> Online!
        </div>
      </div>
    `;
    document.body.appendChild(seq);
    if (!document.getElementById("waypoint-glass")) {
        const glass = document.createElement("div");
        glass.id = "waypoint-glass";
        document.body.appendChild(glass);
    }
    if (!document.getElementById("waypoint-rain")) {
        const rain = document.createElement("canvas");
        rain.id = "waypoint-rain";
        document.body.appendChild(rain);
    }
    return seq;
}

function showStage(id) {
    document.querySelectorAll("#waypoint-entry .waypoint-stage").forEach((stage) => {
        stage.classList.toggle("is-on", stage.id === id);
    });
}

function isSkipKey(event) {
    if (event.repeat) return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    return event.code === "Space" || event.key === " ";
}

function later(ms) {
    const signal = skipCtl?.signal;
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(SKIP);
            return;
        }
        const id = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        function onAbort() {
            clearTimeout(id);
            reject(SKIP);
        }
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

function untilSkipOr(promise) {
    const signal = skipCtl?.signal;
    if (signal?.aborted) return Promise.reject(SKIP);
    return new Promise((resolve, reject) => {
        function onAbort() {
            reject(SKIP);
        }
        signal?.addEventListener("abort", onAbort, { once: true });
        promise.then((value) => {
            signal?.removeEventListener("abort", onAbort);
            if (signal?.aborted) reject(SKIP);
            else resolve(value);
        }, (err) => {
            signal?.removeEventListener("abort", onAbort);
            reject(err);
        });
    });
}

function passSkip(err) {
    if (err === SKIP) return SKIP;
    throw err;
}

async function waitAll(promises) {
    const rows = await Promise.all(promises.map((p) => Promise.resolve(p).catch(passSkip)));
    if (skipCtl?.signal.aborted || rows.includes(SKIP)) throw SKIP;
}

function after(ms, fn) {
    const signal = skipCtl?.signal;
    const id = setTimeout(() => {
        if (!signal?.aborted) fn();
    }, ms);
    signal?.addEventListener("abort", () => clearTimeout(id), { once: true });
}

function buildBurst(burst) {
    burst.replaceChildren();
    for (let i = 0; i < 18; i += 1) {
        const ray = document.createElement("div");
        ray.className = "waypoint-ray";
        ray.style.transform = `rotate(${(360 / 18) * i + Math.random() * 10 - 5}deg)`;
        const shape = document.createElement("div");
        shape.className = "waypoint-ray-shape";
        shape.style.background = RAY_COLORS[Math.floor(Math.random() * RAY_COLORS.length)];
        shape.style.width = `${14 + Math.random() * 26}px`;
        shape.style.animationDelay = `${Math.random() * 0.15}s`;
        shape.style.setProperty("--len", `${45 + Math.random() * 45}vmax`);
        ray.appendChild(shape);
        burst.appendChild(ray);
    }
}

function buildRingStack(ringStage) {
    ringStage.replaceChildren();
    ringSlots = [];
    for (let i = 0; i < 5; i += 1) {
        const slot = document.createElement("div");
        slot.className = "waypoint-ring-slot";
        slot.style.top = `${RING_TOPS[i]}%`;
        slot.style.transform = `translate(${-75 + Math.random() * 90}vw, ${-38 + Math.random() * 76}vh) scale(${2.2 + Math.random() * 2.3})`;
        const ring = document.createElement("div");
        ring.className = "waypoint-ring";
        const label = document.createElement("div");
        label.className = "waypoint-ring-label";
        label.textContent = SENSE_WORDS[i];
        ring.appendChild(label);
        slot.appendChild(ring);
        ringStage.appendChild(slot);
        ringSlots.push({ slot, label });
    }
}

function staggerRingsIn() {
    ringSlots.forEach((row, i) => {
        const appearAt = i * 400;
        after(appearAt, () => row.slot.classList.add("in"));
        after(appearAt + 220, () => {
            row.slot.style.transform = "translate(0,0) scale(1)";
        });
        after(appearAt + 950, () => {
            row.slot.querySelector(".waypoint-ring")?.style.setProperty("--ringColor", "#3fe06a");
            row.label.style.color = "#3fe06a";
            row.label.textContent = "OK";
        });
    });
}

function staggerRingsOut() {
    ringSlots.forEach((row, i) => {
        after(i * 100, () => {
            const dir = i % 2 === 0 ? 1 : -1;
            row.slot.style.transform = `translateX(${dir * 120}vw) scale(1)`;
            row.slot.classList.add("out");
        });
    });
}

function typeInto(el, text, delay) {
    return new Promise((resolve, reject) => {
        const signal = skipCtl?.signal;
        if (signal?.aborted) {
            reject(SKIP);
            return;
        }
        el.replaceChildren();
        const cursor = document.createElement("span");
        cursor.className = "waypoint-type-cursor";
        el.appendChild(cursor);
        let i = 0;
        let settled = false;
        const finish = (err) => {
            if (settled) return;
            settled = true;
            clearInterval(typeTimer);
            typeTimer = 0;
            signal?.removeEventListener("abort", onAbort);
            if (err) reject(err);
            else resolve();
        };
        function onAbort() {
            cursor.remove();
            finish(SKIP);
        }
        typeTimer = setInterval(() => {
            if (signal?.aborted) {
                finish(SKIP);
                return;
            }
            if (i >= text.length) {
                cursor.remove();
                finish();
                return;
            }
            const ch = document.createElement("span");
            ch.className = "waypoint-typed";
            ch.textContent = text[i];
            el.insertBefore(ch, cursor);
            i += 1;
        }, delay);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

function resetLangMenu() {
    const menu = document.getElementById("waypoint-lang-menu");
    if (!menu) return;
    menu.classList.remove("is-open", "is-locked");
    menu.querySelectorAll(".waypoint-lang-option").forEach((opt) => {
        opt.classList.remove("is-focus", "is-pick");
    });
}

async function runLangSelect() {
    resetLangMenu();
    showStage("waypoint-lang");
    await later(200);
    const menu = document.getElementById("waypoint-lang-menu");
    const options = [...document.querySelectorAll("#waypoint-lang-menu .waypoint-lang-option")];
    menu?.classList.add("is-open");
    await later(280);
    for (let i = 0; i < options.length; i += 1) {
        options.forEach((opt) => opt.classList.remove("is-focus"));
        options[i].classList.add("is-focus");
        await later(i === options.length - 1 ? 300 : 170);
    }
    const picked = options[options.length - 1];
    picked?.classList.add("is-pick");
    menu?.classList.add("is-locked");
    await later(480);
}

async function runLogin() {
    const panel = document.getElementById("waypoint-connect-panel");
    const account = document.getElementById("waypoint-account");
    const password = document.getElementById("waypoint-password");
    panel?.classList.remove("is-ok");
    await typeInto(account, "WAYPOINT.LOCAL", 65);
    await later(250);
    await typeInto(password, "************", 95);
    await later(250);
    panel?.classList.add("is-ok");
}

function startScramble(el) {
    stopScramble();
    scrambleTimer = setInterval(() => {
        let out = "";
        for (let i = 0; i < 5; i += 1) out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)] || "";
        el.textContent = out;
    }, 70);
}

function stopScramble() {
    if (scrambleTimer) clearInterval(scrambleTimer);
    scrambleTimer = 0;
    if (typeTimer) clearInterval(typeTimer);
    typeTimer = 0;
}

function travelerLabel(raw) {
    const name = String(raw || "").replace(/^@/, "").trim();
    return name || "guest_user";
}

export async function playWaypointEntry(opts = {}) {
    if (playing) return;
    playing = true;
    skipCtl = new AbortController();
    const skipNow = () => {
        if (skipCtl.signal.aborted) return;
        skipCtl.abort();
        stopWaypointAudio();
    };
    const onKey = (event) => {
        if (!isSkipKey(event)) return;
        event.preventDefault();
        skipNow();
    };
    let lastTapAt = 0;
    const onTouchEnd = (event) => {
        if (event.touches.length) return;
        const now = performance.now();
        if (now - lastTapAt < 420) {
            event.preventDefault();
            lastTapAt = 0;
            skipNow();
            return;
        }
        lastTapAt = now;
    };
    window.addEventListener("keydown", onKey, true);
    loadCss();
    const seq = ensureLayer();
    seq.addEventListener("touchend", onTouchEnd, { passive: false });
    const burst = document.getElementById("waypoint-burst");
    const rings = document.getElementById("waypoint-rings");
    const canvas = document.getElementById("waypoint-tunnel");
    const fill = document.getElementById("waypoint-loading-fill");
    const welcome = document.querySelector("#waypoint-welcome .waypoint-welcome");
    const scramble = document.getElementById("waypoint-scramble");
    const overlay = document.getElementById("waypoint-glass");
    const rain = document.getElementById("waypoint-rain");
    const ctx = canvas.getContext("2d");
    const rainCtx = rain.getContext("2d");

    const resumeUser = document.getElementById("waypoint-resume-user");
    if (resumeUser) resumeUser.textContent = travelerLabel(opts.traveler);

    try {
        const soundDone = playLinkStart();
        document.documentElement.classList.add("waypoint-lock");
        seq.classList.add("is-on");
        seq.classList.remove("to-black", "is-fast");
        document.getElementById("waypoint-welcome").style.opacity = "";
        buildBurst(burst);
        showStage("waypoint-burst");

        await later(1100);
        seq.classList.add("to-black");
        showStage("waypoint-matrix");
        startTunnel(canvas, ctx);
        fill.style.transition = "none";
        fill.style.width = "0%";
        requestAnimationFrame(() => {
            fill.style.transition = "width 3.6s linear";
            fill.style.width = "100%";
        });

        await later(1200);
        setTunnelSpeed(0.025);
        await later(1000);
        setTunnelSpeed(0.06);
        await waitAll([later(1400), untilSkipOr(soundDone)]);
        stopTunnel();
        seq.classList.remove("to-black");
        const checkDone = playCheck1();
        buildRingStack(rings);
        showStage("waypoint-rings");
        staggerRingsIn();

        await later(3100);
        staggerRingsOut();
        await waitAll([later(760), untilSkipOr(checkDone)]);

        const check2Done = playCheck2();
        await runLangSelect();
        showStage("waypoint-connect");
        void runLogin().catch((err) => {
            if (err !== SKIP) console.warn(err);
        });

        await later(2400);
        showStage("waypoint-resume");

        await waitAll([later(800), untilSkipOr(check2Done)]);
        const endingDone = playEndingSound();
        showStage("waypoint-welcome");
        startScramble(scramble);

        await later(2300);
        stopScramble();
        await untilSkipOr(shatterAndReveal({
            seq,
            welcome,
            overlay,
            rain,
            rainCtx,
            crack: 350,
            fallAfter: 150,
            hold: 1900,
            fade: 200,
        }));
        await untilSkipOr(endingDone);
    } catch (err) {
        if (err !== SKIP) throw err;
        seq.classList.add("is-on", "to-black");
        stopWaypointAudio();
        stopTunnel();
        stopScramble();
        abortShatter();
    } finally {
        window.removeEventListener("keydown", onKey, true);
        seq.removeEventListener("touchend", onTouchEnd);
        skipCtl = null;
        playing = false;
    }
}
