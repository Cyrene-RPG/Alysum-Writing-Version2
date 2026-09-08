const TUNNEL_CHARS = "|/\\.+-*×°";
const RAIN_CHARS = "アイウエオカキクケコサシスセソ0123456789ABCDEF";

let tunnelRunning = false;
let tunnelSpeed = 0.01;
let particles = [];
let rainRunning = false;
let rainDrops = [];

function resetParticle(p) {
    p.angle = Math.random() * Math.PI * 2;
    p.z = 1 + Math.random() * 0.5;
    p.char = TUNNEL_CHARS[Math.floor(Math.random() * TUNNEL_CHARS.length)];
}

export function sizeCanvas(canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

export function startTunnel(canvas, ctx) {
    particles = [];
    for (let i = 0; i < 120; i += 1) {
        const p = {};
        resetParticle(p);
        p.z = Math.random() * 1.5 + 0.05;
        particles.push(p);
    }
    tunnelRunning = true;
    tunnelSpeed = 0.01;
    sizeCanvas(canvas);
    const tick = () => {
        if (!tunnelRunning) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.fillStyle = "rgba(0,0,0,0.32)";
        ctx.fillRect(0, 0, w, h);
        const focal = Math.min(w, h) * 0.5;
        const cx = w / 2;
        const cy = h / 2;
        for (const p of particles) {
            p.z -= tunnelSpeed * (1.2 - p.z * 0.4);
            if (p.z <= 0.02) {
                resetParticle(p);
                p.z = 1.4;
            }
            const perspective = focal / p.z;
            const px = cx + Math.cos(p.angle) * perspective * 0.55;
            const py = cy + Math.sin(p.angle) * perspective * 0.55;
            if (px < -50 || px > w + 50 || py < -50 || py > h + 50) continue;
            const size = Math.max(2, Math.min(64, (1 - p.z / 1.5) * 46 + 4));
            const brightness = Math.min(1, (1 - p.z / 1.5) * 1.3);
            ctx.font = `${size}px monospace`;
            ctx.fillStyle = `rgba(255,255,255,${Math.max(0.15, brightness)})`;
            ctx.fillText(p.char, px, py);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

export function setTunnelSpeed(next) {
    tunnelSpeed = next;
}

export function stopTunnel() {
    tunnelRunning = false;
}

function drawRain(canvas, ctx) {
    if (!rainRunning) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3FF35A";
    ctx.font = "15px monospace";
    for (let i = 0; i < rainDrops.length; i += 1) {
        ctx.fillText(RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)], i * 15, rainDrops[i] * 15);
        if (rainDrops[i] * 15 > h && Math.random() > 0.975) rainDrops[i] = 0;
        rainDrops[i] += 1;
    }
    requestAnimationFrame(() => drawRain(canvas, ctx));
}

export function startFinalRain(canvas, ctx) {
    sizeCanvas(canvas);
    rainDrops = new Array(Math.floor(canvas.width / 15)).fill(0).map(() => Math.random() * -50);
    rainRunning = true;
    canvas.classList.add("is-on");
    requestAnimationFrame(() => drawRain(canvas, ctx));
}

export function stopFinalRain(canvas) {
    rainRunning = false;
    canvas?.classList.remove("is-on");
}

let shatterGen = 0;

export function abortShatter() {
    shatterGen += 1;
    stopFinalRain(document.getElementById("waypoint-rain"));
    const overlay = document.getElementById("waypoint-glass");
    overlay?.classList.remove("is-on");
    overlay?.replaceChildren();
}

function buildShatter(overlay, welcome) {
    overlay.replaceChildren();
    const cols = 6;
    const rows = 4;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = vw / cols;
    const ch = vh / rows;
    const html = welcome?.outerHTML || "";
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            const jitter = 6;
            const x = c * cw - jitter / 2 + Math.random() * jitter;
            const y = r * ch - jitter / 2 + Math.random() * jitter;
            const w = cw + jitter;
            const h = ch + jitter;
            const shard = document.createElement("div");
            shard.className = "shard";
            shard.style.left = `${x}px`;
            shard.style.top = `${y}px`;
            shard.style.width = `${w}px`;
            shard.style.height = `${h}px`;
            shard.style.setProperty("--rot", `${Math.random() * 50 - 25}deg`);
            shard.style.transformOrigin = `${w / 2}px ${h / 2}px`;
            shard.style.transitionDelay = `${Math.random() * 0.25}s`;
            const inner = document.createElement("div");
            inner.className = "shard-inner";
            inner.style.left = `${-x}px`;
            inner.style.top = `${-y}px`;
            inner.style.width = `${vw}px`;
            inner.style.height = `${vh}px`;
            inner.innerHTML = html;
            shard.appendChild(inner);
            overlay.appendChild(shard);
        }
    }
}

export function shatterAndReveal({
    seq,
    welcome,
    overlay,
    rain,
    rainCtx,
    crack = 350,
    fallAfter = 150,
    hold = 1800,
    fade = 200,
}) {
    const mine = ++shatterGen;
    const still = () => mine === shatterGen;
    return new Promise((resolve) => {
        if (!still()) {
            resolve();
            return;
        }
        buildShatter(overlay, welcome);
        overlay.classList.add("is-on");
        overlay.querySelectorAll(".shard").forEach((shard) => shard.classList.add("crack"));
        setTimeout(() => {
            if (!still()) {
                resolve();
                return;
            }
            seq.classList.add("to-black");
            welcome.style.transition = "opacity 0.25s ease";
            welcome.style.opacity = "0";
            startFinalRain(rain, rainCtx);
            setTimeout(() => {
                if (!still()) return;
                overlay.querySelectorAll(".shard").forEach((shard) => {
                    shard.classList.remove("crack");
                    shard.classList.add("fall");
                });
            }, fallAfter);
            setTimeout(() => {
                if (!still()) {
                    resolve();
                    return;
                }
                overlay.classList.remove("is-on");
                welcome.style.opacity = "";
                welcome.style.transition = "";
                resolve();
            }, hold);
        }, crack);
    });
}
