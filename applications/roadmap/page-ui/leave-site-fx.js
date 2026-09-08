const EXIT_CHARS = "アイウエオカキクケコサシスセソ0123456789ABCDEF";
const COLS = 8;
const ROWS = 5;

let rainRunning = false;
let rainSpeed = 1;
let rainDrops = [];
let rainUrl = "";

function later(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function loadLeaveSiteCss() {
    if (document.querySelector("link[data-leave-site-css]")) return;
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = "/css/roadmap/leave-site.css?v=1";
    sheet.setAttribute("data-leave-site-css", "");
    document.head.appendChild(sheet);
}

export function ensureLeaveLayers() {
    if (!document.getElementById("leave-red-flash")) {
        const flash = document.createElement("div");
        flash.id = "leave-red-flash";
        document.body.appendChild(flash);
    }
    if (!document.getElementById("leave-shard-burst")) {
        const burst = document.createElement("div");
        burst.id = "leave-shard-burst";
        document.body.appendChild(burst);
    }
    if (!document.getElementById("leave-exit-rain")) {
        const rain = document.createElement("canvas");
        rain.id = "leave-exit-rain";
        document.body.appendChild(rain);
    }
    if (!document.getElementById("leave-exit-label")) {
        const label = document.createElement("div");
        label.id = "leave-exit-label";
        label.textContent = "Connection Terminated";
        document.body.appendChild(label);
    }
    if (!document.getElementById("leave-final-black")) {
        const black = document.createElement("div");
        black.id = "leave-final-black";
        document.body.appendChild(black);
    }
}

function stripCloneNoise(html) {
    return String(html || "")
        .replace(/\s(?:id|for)="[^"]*"/g, "")
        .replace(/\shref="[^"]*"/g, " href=\"#\"");
}

function liveMarkup(shotUrl) {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const scan = document.querySelector(".scanlines");
    const corner = document.querySelector(".glitch-corner");
    const frame = document.querySelector(".frame");
    const mark = document.querySelector(".roadmap-lewstar");
    const rain = shotUrl
        ? `<img class="leave-rain-shot" alt="" src="${shotUrl}">`
        : "";
    const mobile = window.matchMedia("(max-width:720px)").matches;
    return stripCloneNoise(`
      <div class="leave-page-clone">
        ${rain}
        ${scan ? scan.outerHTML : ""}
        ${!mobile && corner ? corner.outerHTML : ""}
        ${mark ? mark.outerHTML : ""}
        <div class="leave-page-scroll" style="transform:translateY(${-y}px)">
          ${mobile && corner ? corner.outerHTML : ""}
          ${frame ? frame.outerHTML : ""}
        </div>
      </div>
    `);
}

export async function prepareLeaveSnapshot() {
    const rain = document.getElementById("rain");
    if (rainUrl) {
        URL.revokeObjectURL(rainUrl);
        rainUrl = "";
    }
    if (rain && rain.width && rain.height) {
        try {
            const blob = await new Promise((resolve) => rain.toBlob(resolve, "image/png"));
            if (blob) rainUrl = URL.createObjectURL(blob);
        } catch {
            /* keep going without the rain still */
        }
    }
    return liveMarkup(rainUrl);
}

function hideLivePage() {
    ["#rain", ".scanlines", ".glitch-corner", ".frame"].forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) el.style.opacity = "0";
    });
}

function buildBurst(burst, markup) {
    burst.replaceChildren();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = vw / COLS;
    const ch = vh / ROWS;
    const cx = vw / 2;
    const cy = vh / 2;
    for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS; c += 1) {
            const x = c * cw;
            const y = r * ch;
            const w = cw + 2;
            const h = ch + 2;
            const shard = document.createElement("div");
            shard.className = "dshard";
            shard.style.left = `${x}px`;
            shard.style.top = `${y}px`;
            shard.style.width = `${w}px`;
            shard.style.height = `${h}px`;
            const dx = (x + w / 2) - cx;
            const dy = (y + h / 2) - cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const outX = (dx / dist) * (120 + Math.random() * 220);
            const outY = (dy / dist) * (120 + Math.random() * 220) - (60 + Math.random() * 80);
            shard.style.setProperty("--outx", `${outX}px`);
            shard.style.setProperty("--outy", `${outY}px`);
            shard.style.setProperty("--outrot", `${Math.random() * 160 - 80}deg`);
            shard.style.transformOrigin = `${w / 2}px ${h / 2}px`;
            shard.style.transitionDelay = `${Math.random() * 0.2}s`;
            const inner = document.createElement("div");
            inner.className = "dshard-inner";
            inner.style.left = `${-x}px`;
            inner.style.top = `${-y}px`;
            inner.style.width = `${vw}px`;
            inner.style.height = `${vh}px`;
            inner.innerHTML = markup;
            shard.appendChild(inner);
            burst.appendChild(shard);
        }
    }
}

function startExitRain(canvas, ctx) {
    const fontSize = 15;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const columns = Math.floor(canvas.width / fontSize);
    rainDrops = new Array(columns).fill(0).map(() => Math.random() * -50);
    rainRunning = true;
    rainSpeed = 1;
    const tick = () => {
        if (!rainRunning) return;
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#3FF35A";
        ctx.font = `${fontSize}px monospace`;
        for (let i = 0; i < rainDrops.length; i += 1) {
            ctx.fillText(EXIT_CHARS[Math.floor(Math.random() * EXIT_CHARS.length)], i * fontSize, rainDrops[i] * fontSize);
            if (rainDrops[i] * fontSize > canvas.height && Math.random() > 0.97) rainDrops[i] = 0;
            rainDrops[i] += rainSpeed;
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

export async function playLeaveFx(markup) {
    ensureLeaveLayers();
    const flash = document.getElementById("leave-red-flash");
    const burst = document.getElementById("leave-shard-burst");
    const rain = document.getElementById("leave-exit-rain");
    const label = document.getElementById("leave-exit-label");
    const black = document.getElementById("leave-final-black");
    const page = markup || await prepareLeaveSnapshot();
    const ctx = rain.getContext("2d");

    flash.classList.add("hit");
    buildBurst(burst, page);
    burst.classList.add("active");

    await later(180);
    rain.classList.add("is-on");
    startExitRain(rain, ctx);
    hideLivePage();

    await later(40);
    burst.querySelectorAll(".dshard").forEach((shard) => {
        shard.style.transform = "translate(var(--outx), var(--outy)) rotate(var(--outrot)) scale(0.4)";
        shard.classList.add("gone");
    });

    await later(880);
    rainSpeed = 2;
    await later(900);
    rainSpeed = 3.5;
    await later(600);
    label.classList.add("show");
    await later(1600);
    black.classList.add("on");
    await later(900);
    rainRunning = false;
    if (rainUrl) {
        URL.revokeObjectURL(rainUrl);
        rainUrl = "";
    }
}
