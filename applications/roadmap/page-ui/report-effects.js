export function glitchFileReport(btn) {
    if (!btn) return;
    btn.classList.remove("glitching");
    void btn.offsetWidth;
    btn.classList.add("glitching");
    setTimeout(() => btn.classList.remove("glitching"), 500);
}

const HEAL_JOIN_MS = 450;
const HEAL_HOLD_MS = 400;

export function healReportSubmit(btn) {
    if (!btn) return Promise.resolve();
    if (!btn.classList.contains("healed")) {
        btn.classList.add("healed");
        const bloom = document.createElement("span");
        bloom.className = "report-heal-bloom";
        btn.appendChild(bloom);
        setTimeout(() => bloom.remove(), 850);
    }
    return new Promise((resolve) => setTimeout(resolve, HEAL_JOIN_MS + HEAL_HOLD_MS));
}

export function resetReportHeal(btn = document.getElementById("reportSubmit")) {
    btn?.classList.remove("healed");
}
