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
    settingsCollapse,
    railToggle,
    tabChapters,
    tabBook,
    chaptersPane,
    bookPane,
    bookTree,
    settingsPane,
    settingsTopbar,
    writerTabs,
    bookFootSettings,
    tabSettings,
    settingsBackTop,
    tree,
    onBookViewChange,
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
        [treeToggle, settingsCollapse].forEach((btn) => {
            if (!btn) return;
            btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
            btn.title = collapsed ? "Show sidebar" : "Hide sidebar";
            btn.textContent = collapsed ? "›" : "‹";
        });
        try {
            localStorage.setItem(TREE_COLLAPSE_KEY, collapsed ? "1" : "0");
        } catch {
            /* ignore */
        }
    }
    setTreeCollapsed(treeCollapsed());
    function toggleTreeCollapsed() {
        setTreeCollapsed(!shell?.classList.contains("is-tree-collapsed"));
    }
    treeToggle?.addEventListener("click", toggleTreeCollapsed);
    settingsCollapse?.addEventListener("click", toggleTreeCollapsed);

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
    function setPreviewMode(on) {
        shell?.classList.toggle("is-preview", Boolean(on));
        const rail = document.getElementById("writerRail");
        if (rail) rail.hidden = false;
    }
    setPreviewMode(false);

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

    let bookView = "tree";

    function setBookView(view) {
        bookView = view === "settings" ? "settings" : "tree";
        const settings = bookView === "settings";
        shell?.classList.toggle("is-settings", settings);
        tree?.classList.toggle("is-settings", settings);
        if (bookTree) bookTree.classList.toggle("hidden", settings);
        settingsPane?.classList.toggle("hidden", !settings);
        settingsTopbar?.classList.toggle("hidden", !settings);
        writerTabs?.classList.toggle("hidden", settings);
        bookFootSettings?.classList.toggle("hidden", settings);
        if (settings) {
            chaptersPane.hidden = true;
            bookPane.hidden = false;
            tabChapters?.classList.remove("is-active");
            tabBook?.classList.add("is-active");
            tabChapters?.setAttribute("aria-selected", "false");
            tabBook?.setAttribute("aria-selected", "true");
        }
        onBookViewChange?.(bookView);
    }

    function setTab(tab) {
        if (bookView === "settings") setBookView("tree");
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
    setBookView("tree");
    tabChapters?.addEventListener("click", () => setTab("chapters"));
    tabBook?.addEventListener("click", () => setTab("book"));
    tabSettings?.addEventListener("click", () => setBookView("settings"));
    settingsBackTop?.addEventListener("click", () => setTab("book"));

    return { setTab, expandMatter, setBookView, getBookView: () => bookView, setPreviewMode };
}
