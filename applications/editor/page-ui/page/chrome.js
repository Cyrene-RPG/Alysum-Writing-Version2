const TREE_COLLAPSE_KEY = "alysum:editor:chapters-collapsed";
const RAIL_COLLAPSE_KEY = "alysum:editor:rail-collapsed";
const MATTER_COLLAPSE_KEY = "alysum:editor:matter-collapsed";
const TREE_TAB_KEY = "alysum:editor:sidebar-tab";

function storedTab() {
    try {
        return localStorage.getItem(TREE_TAB_KEY) === "book" ? "book" : "chapters";
    } catch {
        return "chapters";
    }
}

export function mountWriterChrome({
    shell,
    treeToggle,
    railToggle,
    tabChapters,
    tabBook,
    chaptersPane,
    bookPane,
}) {
    function treeCollapsed() {
        try {
            return localStorage.getItem(TREE_COLLAPSE_KEY) === "1";
        } catch {
            return false;
        }
    }
    function setTreeCollapsed(collapsed) {
        shell?.classList.toggle("is-tree-collapsed", collapsed);
        if (treeToggle) {
            treeToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
            treeToggle.title = collapsed ? "Show sidebar" : "Hide sidebar";
            treeToggle.textContent = collapsed ? "›" : "‹";
        }
        try {
            localStorage.setItem(TREE_COLLAPSE_KEY, collapsed ? "1" : "0");
        } catch {
            /* ignore */
        }
    }
    setTreeCollapsed(treeCollapsed());
    treeToggle?.addEventListener("click", () => {
        setTreeCollapsed(!shell?.classList.contains("is-tree-collapsed"));
    });

    function railCollapsed() {
        try {
            return localStorage.getItem(RAIL_COLLAPSE_KEY) === "1";
        } catch {
            return false;
        }
    }
    function setRailCollapsed(collapsed) {
        shell?.classList.toggle("is-rail-collapsed", collapsed);
        if (railToggle) {
            railToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
            railToggle.title = collapsed ? "Show sidebar" : "Hide sidebar";
            railToggle.textContent = collapsed ? "‹" : "›";
        }
        try {
            localStorage.setItem(RAIL_COLLAPSE_KEY, collapsed ? "1" : "0");
        } catch {
            /* ignore */
        }
    }
    setRailCollapsed(railCollapsed());
    railToggle?.addEventListener("click", () => {
        setRailCollapsed(!shell?.classList.contains("is-rail-collapsed"));
    });

    function matterCollapsedMap() {
        try {
            const raw = JSON.parse(localStorage.getItem(MATTER_COLLAPSE_KEY) || "{}");
            return raw && typeof raw === "object" ? raw : {};
        } catch {
            return {};
        }
    }
    function setMatterCollapsed(section, collapsed) {
        if (!section?.dataset.matter) return;
        section.classList.toggle("is-collapsed", collapsed);
        const toggle = section.querySelector("[data-matter-toggle]");
        const chevron = section.querySelector(".writer-matter-chevron");
        if (toggle) toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        if (chevron) chevron.textContent = collapsed ? "▸" : "▾";
        const next = matterCollapsedMap();
        next[section.dataset.matter] = collapsed;
        try {
            localStorage.setItem(MATTER_COLLAPSE_KEY, JSON.stringify(next));
        } catch {
            /* ignore */
        }
    }
    document.querySelectorAll(".writer-matter[data-matter]").forEach((section) => {
        const stored = matterCollapsedMap()[section.dataset.matter] === true;
        setMatterCollapsed(section, stored);
        section.querySelector("[data-matter-toggle]")?.addEventListener("click", () => {
            setMatterCollapsed(section, !section.classList.contains("is-collapsed"));
        });
    });
    function expandMatter(key) {
        const section = document.querySelector(`.writer-matter[data-matter="${key}"]`);
        if (section) setMatterCollapsed(section, false);
    }

    function setTab(tab) {
        const bookTab = tab === "book";
        chaptersPane.hidden = bookTab;
        bookPane.hidden = !bookTab;
        tabChapters?.classList.toggle("is-active", !bookTab);
        tabBook?.classList.toggle("is-active", bookTab);
        tabChapters?.setAttribute("aria-selected", bookTab ? "false" : "true");
        tabBook?.setAttribute("aria-selected", bookTab ? "true" : "false");
        try {
            localStorage.setItem(TREE_TAB_KEY, bookTab ? "book" : "chapters");
        } catch {
            /* ignore */
        }
    }
    setTab(storedTab());
    tabChapters?.addEventListener("click", () => setTab("chapters"));
    tabBook?.addEventListener("click", () => setTab("book"));

    return { setTab, expandMatter };
}
