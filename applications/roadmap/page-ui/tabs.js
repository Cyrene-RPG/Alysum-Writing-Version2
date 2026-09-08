const PAGE_IDS = new Set(["roadmap", "suggestions", "bugs", "report"]);

function flashTab(button) {
    if (!button) return;
    button.classList.remove("glitching");
    void button.offsetWidth;
    button.classList.add("glitching");
    setTimeout(() => button.classList.remove("glitching"), 500);
}

export function showPage(id) {
    const pageId = PAGE_IDS.has(id) ? id : "roadmap";
    document.querySelectorAll(".page").forEach((page) => {
        page.classList.toggle("active", page.id === pageId);
    });
    document.querySelectorAll("nav button[data-page]").forEach((button) => {
        button.classList.toggle("active", button.dataset.page === pageId);
    });
    const next = `#${pageId}`;
    if (location.hash !== next) {
        history.replaceState(null, "", next);
    }
}

export function currentPage() {
    const raw = String(location.hash || "").replace(/^#/, "");
    return PAGE_IDS.has(raw) ? raw : "roadmap";
}

export function bindTabs() {
    document.querySelectorAll("nav button[data-page]").forEach((button) => {
        button.addEventListener("click", () => {
            showPage(button.dataset.page);
            flashTab(button);
        });
    });

    document.getElementById("bugsFileReport")?.addEventListener("click", () => {
        showPage("report");
    });
    document.getElementById("reportCancel")?.addEventListener("click", () => {
        showPage("bugs");
    });
    document.getElementById("suggestCancel")?.addEventListener("click", () => {
        document.getElementById("suggestPanel")?.classList.remove("open");
    });

    window.addEventListener("hashchange", () => showPage(currentPage()));
    showPage(currentPage());
}
