let leakTimer = 0;
const hoverTimers = new WeakMap();

function spawnSpark(btn, opts = {}) {
    const spark = document.createElement("div");
    spark.className = "spark";
    const width = btn.offsetWidth;
    const height = btn.offsetHeight;
    let x;
    let y;
    let dx;
    let dy;
    if (opts.radial) {
        x = width * 0.5;
        y = height * 0.5;
        const angle = Math.random() * Math.PI * 2;
        const dist = 18 + Math.random() * 28;
        dx = Math.cos(angle) * dist;
        dy = Math.sin(angle) * dist;
    } else {
        x = width * (0.25 + Math.random() * 0.5) + (Math.random() - 0.5) * 10;
        y = height * (0.3 + Math.random() * 0.4);
        dx = (Math.random() - 0.5) * 40;
        dy = -20 - Math.random() * 30;
    }
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    spark.style.setProperty("--dx", `${dx}px`);
    spark.style.setProperty("--dy", `${dy}px`);
    if (opts.big) {
        spark.style.width = "4px";
        spark.style.height = "4px";
    }
    btn.appendChild(spark);
    setTimeout(() => spark.remove(), 650);
}

function startLeak(btn) {
    if (leakTimer) return;
    const tick = () => {
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i += 1) spawnSpark(btn);
        leakTimer = setTimeout(tick, 450 + Math.random() * 400);
    };
    leakTimer = setTimeout(tick, 450);
}

function stopHoverSparks(btn) {
    const id = hoverTimers.get(btn);
    if (id) clearInterval(id);
    hoverTimers.delete(btn);
}

export function mendSuggestButton(btn) {
    if (!btn) return;
    btn.classList.remove("broken", "booming");
    if (leakTimer) {
        clearTimeout(leakTimer);
        leakTimer = 0;
    }
}

export function breakSuggestButton(btn, { boom = false } = {}) {
    if (!btn) return;
    stopHoverSparks(btn);
    if (boom && !btn.classList.contains("broken")) {
        btn.classList.add("booming");
        setTimeout(() => btn.classList.remove("booming"), 350);
        for (let i = 0; i < 9; i += 1) {
            setTimeout(() => spawnSpark(btn, { radial: true, big: Math.random() < 0.3 }), i * 8);
        }
    }
    btn.classList.add("broken");
    startLeak(btn);
}

export function bindSuggestBreak(btn) {
    if (!btn || btn.dataset.breakWired === "1") return;
    btn.dataset.breakWired = "1";
    btn.addEventListener("mouseenter", () => {
        if (btn.classList.contains("broken")) return;
        stopHoverSparks(btn);
        hoverTimers.set(
            btn,
            setInterval(() => {
                if (Math.random() < 0.5) spawnSpark(btn);
            }, 700)
        );
    });
    btn.addEventListener("mouseleave", () => stopHoverSparks(btn));
}
