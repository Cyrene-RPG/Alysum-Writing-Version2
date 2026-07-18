/**
 * Wikipedia clone — main application controller.
 */
import {
    listBooks,
    listEntries,
    getBookTitle,
    supabase,
} from "./api.js";
import {
    mountArticle,
    renderGlobalMainPage,
    renderBookMainPage,
    renderBacklinks,
    renderHistory,
    renderTalkStub,
    renderContentsPage,
} from "./render.js";
import { findEntryByTitle, randomEntry, renderSearchPage } from "./search.js";
import { mountEditor } from "./editor.js";
import { findBacklinks } from "./links.js";
import { wireLogoutButtons } from "../auth-logout.js?v=3";

/** @typedef {"read"|"edit"|"history"|"talk"|"search"|"backlinks"|"contents"} WikiView */

export class WikiApp {
    /** @param {string} uid */
    constructor(uid) {
        this.uid = uid;
        /** @type {string|null} */
        this.bookId = null;
        /** @type {string|null} */
        this.bookTitle = null;
        /** @type {Array} */
        this.entries = [];
        /** @type {WikiView} */
        this.view = "read";
        /** @type {object|null} */
        this.currentEntry = null;
        /** @type {string} */
        this.searchQuery = "";

        this els = {
            pageToolbar: document.getElementById("wikiPageToolbar"),
            pageTitle: document.getElementById("wikiPageTitle"),
            contentSub: document.getElementById("wikiContentSub"),
            parserOutput: document.getElementById("wikiParserOutput"),
            lastModified: document.getElementById("wikiLastModified"),
            searchForm: document.getElementById("wikiSearchForm"),
            searchInput: document.getElementById("wikiSearchInput"),
            viewRead: document.getElementById("wikiViewRead"),
            viewEdit: document.getElementById("wikiViewEdit"),
            tabRead: document.getElementById("wikiTabRead"),
            tabEdit: document.getElementById("wikiTabEdit"),
            tabHistory: document.getElementById("wikiTabHistory"),
            tabTalk: document.getElementById("wikiTabTalk"),
            tabArticle: document.getElementById("wikiTabArticle"),
            toolWhatLinks: document.getElementById("wikiToolWhatLinks"),
            toolNew: document.getElementById("wikiToolNew"),
            navEditor: document.getElementById("wikiNavEditor"),
        };
    }

    async init() {
        window.__wikiUid = this.uid;
        this.parseUrl();
        this.wireUi();

        if (this.bookId) {
            await this.loadBook(this.bookId);
        } else {
            await this.renderGlobalHub();
        }
    }

    parseUrl() {
        const params = new URLSearchParams(window.location.search);
        this.bookId = params.get("book") || null;
        this.searchQuery = params.get("search") || "";
        const action = params.get("action") || "view";
        let title = params.get("title") || params.get("wiki") || "";

        // Legacy Story Bible deep links (?char= / ?place=) resolve after entries load.
        this.legacyEntryId = params.get("char") || params.get("place") || null;

        if (action === "edit") this.view = "edit";
        else if (action === "history") this.view = "history";
        else if (params.get("talk") === "1") this.view = "talk";
        else if (params.get("backlinks") === "1") this.view = "backlinks";
        else if (params.get("contents") === "1") this.view = "contents";
        else if (this.searchQuery) this.view = "search";

        this.pendingTitle = title;
    }

    wireUi() {
        this.els.searchForm?.addEventListener("submit", (e) => {
            e.preventDefault();
            const q = this.els.searchInput?.value?.trim();
            if (!q) return;
            if (this.bookId) {
                this.navigate({ book: this.bookId, search: q });
            } else {
                this.navigate({ search: q });
            }
        });

        this.els.tabRead?.addEventListener("click", (e) => {
            e.preventDefault();
            if (this.currentEntry) this.navigate({ book: this.bookId, title: this.currentEntry.name });
        });
        this.els.tabEdit?.addEventListener("click", (e) => {
            e.preventDefault();
            const title = this.currentEntry?.name || this.pendingTitle || "";
            this.navigate({ book: this.bookId, title, action: "edit" });
        });
        this.els.tabHistory?.addEventListener("click", (e) => {
            e.preventDefault();
            if (!this.currentEntry) return;
            this.navigate({ book: this.bookId, title: this.currentEntry.name, action: "history" });
        });
        this.els.tabTalk?.addEventListener("click", (e) => {
            e.preventDefault();
            if (!this.currentEntry) return;
            this.navigate({ book: this.bookId, title: this.currentEntry.name, talk: "1" });
        });
        this.els.tabArticle?.addEventListener("click", (e) => {
            e.preventDefault();
            if (this.currentEntry) this.navigate({ book: this.bookId, title: this.currentEntry.name });
        });

        this.els.toolWhatLinks?.addEventListener("click", (e) => {
            e.preventDefault();
            if (!this.currentEntry) return;
            this.navigate({ book: this.bookId, title: this.currentEntry.name, backlinks: "1" });
        });

        this.els.toolNew?.addEventListener("click", (e) => {
            e.preventDefault();
            if (!this.bookId) return;
            this.navigate({ book: this.bookId, action: "edit" });
        });

        for (const id of ["wikiNavMain", "wikiSideMain", "wikiLogoLink"]) {
            document.getElementById(id)?.addEventListener("click", (e) => {
                if (!this.bookId) return;
                e.preventDefault();
                this.navigate({ book: this.bookId });
            });
        }

        for (const id of ["wikiNavContents", "wikiSideContents"]) {
            document.getElementById(id)?.addEventListener("click", (e) => {
                e.preventDefault();
                if (!this.bookId) return;
                this.navigate({ book: this.bookId, contents: "1" });
            });
        }

        for (const id of ["wikiNavRandom", "wikiSideRandom"]) {
            document.getElementById(id)?.addEventListener("click", (e) => {
                e.preventDefault();
                if (!this.bookId || !this.entries.length) return;
                const pick = randomEntry(this.entries);
                if (pick) this.navigate({ book: this.bookId, title: pick.name });
            });
        }

        document.getElementById("wikiMainMenuBtn")?.addEventListener("click", () => {
            const panel = document.getElementById("wikiMainMenuPanel");
            if (panel) panel.hidden = !panel.hidden;
        });

        document.addEventListener("click", (e) => {
            const panel = document.getElementById("wikiMainMenuPanel");
            const btn = document.getElementById("wikiMainMenuBtn");
            if (!panel || panel.hidden) return;
            if (panel.contains(e.target) || btn?.contains(e.target)) return;
            panel.hidden = true;
        });
    }

    /**
     * @param {Record<string, string>} params
     */
    navigate(params) {
        const url = new URL(window.location.href);
        url.search = "";
        for (const [k, v] of Object.entries(params)) {
            if (v) url.searchParams.set(k, v);
        }
        window.location.href = url.pathname + url.search;
    }

    async renderGlobalHub() {
        document.title = "Story Wiki — Main Page";
        this.els.pageToolbar.hidden = true;
        this.els.contentSub.textContent = "";
        this.els.lastModified.textContent = "";

        const books = await listBooks(this.uid);
        if (this.searchQuery) {
            this.els.pageToolbar.hidden = false;
            this.els.pageTitle.textContent = `Search: ${this.searchQuery}`;
            const allEntries = [];
            for (const book of books) {
                const entries = await listEntries(this.uid, book.id);
                for (const e of entries) allEntries.push({ ...e, bookId: book.id, bookTitle: book.title });
            }
            const q = this.searchQuery.toLowerCase();
            const hits = allEntries.filter((e) =>
                e.name.toLowerCase().includes(q) ||
                (e.body || "").toLowerCase().includes(q)
            );
            let html = `<p>Global search for <strong>${escapeHtml(this.searchQuery)}</strong> (${hits.length} results)</p>`;
            for (const hit of hits.slice(0, 50)) {
                html += `<div class="wiki-search-hit"><a href="wiki.html?book=${encodeURIComponent(hit.bookId)}&title=${encodeURIComponent(hit.name)}"><em>${escapeHtml(hit.name)}</em></a> — ${escapeHtml(hit.bookTitle)}</div>`;
            }
            this.els.parserOutput.innerHTML = html || "<p>No results.</p>";
            return;
        }

        this.els.parserOutput.innerHTML = renderGlobalMainPage(books);
    }

    async loadBook(bookId) {
        this.bookId = bookId;
        this.bookTitle = await getBookTitle(this.uid, bookId);
        this.entries = await listEntries(this.uid, bookId);

        if (this.legacyEntryId && !this.pendingTitle) {
            const legacy = this.entries.find((e) => e.id === this.legacyEntryId);
            if (legacy) this.pendingTitle = legacy.name;
        }

        if (this.els.navEditor) {
            this.els.navEditor.href = `editor.html?book=${encodeURIComponent(bookId)}`;
        }

        for (const id of ["wikiNavMain", "wikiSideMain"]) {
            const el = document.getElementById(id);
            if (el) el.href = `wiki.html?book=${encodeURIComponent(bookId)}`;
        }
        document.getElementById("wikiLogoLink")?.setAttribute("href", `wiki.html?book=${encodeURIComponent(bookId)}`);

        if (this.view === "search" && this.searchQuery) {
            return this.renderSearch();
        }

        if (this.pendingTitle) {
            this.currentEntry = findEntryByTitle(this.pendingTitle, this.entries);
            if (this.view === "edit") return this.renderEdit(this.currentEntry, this.pendingTitle);
            if (!this.currentEntry && this.view !== "edit") {
                if (new URLSearchParams(window.location.search).get("action") === "edit") {
                    return this.renderEdit(null, this.pendingTitle);
                }
            }
            if (this.currentEntry) {
                if (this.view === "history") return this.renderHistoryView();
                if (this.view === "talk") return this.renderTalkView();
                if (this.view === "backlinks") return this.renderBacklinksView();
                return this.renderArticleView(this.currentEntry);
            }
        }

        if (this.view === "edit" && !this.pendingTitle) {
            return this.renderEdit(null, "");
        }

        if (this.view === "contents") {
            return this.renderContentsView();
        }

        return this.renderBookMain();
    }

    renderBookMain() {
        document.title = `${this.bookTitle} — Main Page`;
        this.els.pageToolbar.hidden = true;
        this.els.contentSub.innerHTML = `From <a href="wiki.html?book=${encodeURIComponent(this.bookId)}">${escapeHtml(this.bookTitle)}</a> · Story Wiki on Alysum`;
        this.els.parserOutput.innerHTML = renderBookMainPage(this.bookTitle, this.bookId, this.entries);
        this.els.lastModified.textContent = "";
    }

    renderArticleView(entry) {
        this.currentEntry = entry;
        document.title = `${entry.name} — Story Wiki`;
        this.els.pageToolbar.hidden = false;
        this.els.pageTitle.textContent = entry.name;
        this.els.contentSub.innerHTML = `From <a href="wiki.html?book=${encodeURIComponent(this.bookId)}">${escapeHtml(this.bookTitle)}</a> · Story Wiki on Alysum`;
        mountArticle(this.els.parserOutput, entry, this.bookId, this.entries);
        this.setViewTabs("read");
        const date = new Date(entry.updatedAt || Date.now());
        this.els.lastModified.textContent = `This page was last edited on ${date.toLocaleString()}.`;
    }

    renderEdit(entry, defaultTitle) {
        document.title = entry ? `Editing ${entry.name}` : "Creating article";
        this.els.pageToolbar.hidden = false;
        this.els.pageTitle.textContent = entry ? `Editing ${entry.name}` : "Create article";
        this.els.contentSub.textContent = "";
        this.setViewTabs("edit");

        mountEditor(
            this.els.parserOutput,
            entry,
            this.bookId,
            defaultTitle,
            (saved) => {
                this.navigate({ book: this.bookId, title: saved.name });
            },
            () => {
                if (entry) this.navigate({ book: this.bookId, title: entry.name });
                else this.navigate({ book: this.bookId });
            }
        );
        this.els.lastModified.textContent = "";
    }

    renderSearch() {
        document.title = `Search: ${this.searchQuery}`;
        this.els.pageToolbar.hidden = false;
        this.els.pageTitle.textContent = `Search: ${this.searchQuery}`;
        this.els.contentSub.textContent = "";
        this.els.parserOutput.innerHTML = renderSearchPage(this.searchQuery, this.entries, this.bookId);
        this.els.pageToolbar.hidden = false;
        this.setViewTabs("read");
        this.els.lastModified.textContent = "";
    }

    renderHistoryView() {
        if (!this.currentEntry) return;
        document.title = `History: ${this.currentEntry.name}`;
        this.els.pageToolbar.hidden = false;
        this.els.pageTitle.textContent = this.currentEntry.name;
        this.els.parserOutput.innerHTML = renderHistory(this.currentEntry);
        this.setViewTabs("history");
    }

    renderTalkView() {
        if (!this.currentEntry) return;
        document.title = `Talk: ${this.currentEntry.name}`;
        this.els.pageToolbar.hidden = false;
        this.els.pageTitle.textContent = `Talk:${this.currentEntry.name}`;
        this.els.parserOutput.innerHTML = renderTalkStub();
        this.setViewTabs("talk");
    }

    renderBacklinksView() {
        if (!this.currentEntry) return;
        const links = findBacklinks(this.currentEntry.name, this.entries);
        document.title = `Links: ${this.currentEntry.name}`;
        this.els.pageToolbar.hidden = false;
        this.els.pageTitle.textContent = this.currentEntry.name;
        this.els.parserOutput.innerHTML = renderBacklinks(this.currentEntry.name, links, this.bookId);
        this.setViewTabs("read");
    }

    renderContentsView() {
        document.title = `Contents — ${this.bookTitle}`;
        this.els.pageToolbar.hidden = false;
        this.els.pageTitle.textContent = "Contents";
        this.els.parserOutput.innerHTML = renderContentsPage(this.entries, this.bookId);
        this.setViewTabs("read");
    }

    /** @param {"read"|"edit"|"history"|"talk"} mode */
    setViewTabs(mode) {
        this.els.viewRead?.classList.toggle("selected", mode === "read");
        this.els.viewEdit?.classList.toggle("selected", mode === "edit");
        document.getElementById("wikiViewHistory")?.classList.toggle("selected", mode === "history");
        document.querySelector(".vector-article-tabs li.selected")?.classList.remove("selected");
        if (mode === "talk") {
            document.getElementById("wikiTabTalk")?.parentElement?.classList.add("selected");
        } else {
            document.getElementById("wikiTabArticle")?.parentElement?.classList.add("selected");
        }
    }
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export async function startWiki(uid) {
    wireLogoutButtons(document);
    const app = new WikiApp(uid);
    await app.init();
    return app;
}
