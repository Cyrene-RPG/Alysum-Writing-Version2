/**
 * Story Wiki — creator-only: write lore articles, optionally publish to Lore Wiki.
 */
import { listBooks, listEntries, getBookTitle, deleteEntry } from "./api.js";
import { renderCreatorBookHub, renderCreatorArticleList, escapeHtml } from "./creator-render.js";
import { mountEditor } from "./editor.js";
import {
    listPublishedEntryIds,
    getAuthorDisplayName,
    publishEntryToLore,
    unpublishEntryFromLore,
} from "./publish.js";
import { wireLogoutButtons } from "../auth-logout.js?v=3";
import { isLocalStudioUid } from "../studio-session.js?v=1";

export class WikiApp {
    /** @param {string} uid */
    constructor(uid) {
        this.uid = uid;
        this.bookId = null;
        this.bookTitle = null;
        this.entries = [];
        this.publishedIds = new Set();
        this.authorName = "Author";
        this.searchQuery = "";

        this.els = {
            pageToolbar: document.getElementById("wikiPageToolbar"),
            pageTitle: document.getElementById("wikiPageTitle"),
            contentSub: document.getElementById("wikiContentSub"),
            parserOutput: document.getElementById("wikiParserOutput"),
            lastModified: document.getElementById("wikiLastModified"),
            searchForm: document.getElementById("wikiSearchForm"),
            searchInput: document.getElementById("wikiSearchInput"),
            navEditor: document.getElementById("wikiNavEditor"),
        };
    }

    async init() {
        window.__wikiUid = this.uid;
        this.authorName = await getAuthorDisplayName(this.uid);
        this.parseUrl();
        this.wireUi();

        if (this.bookId) {
            await this.loadBook(this.bookId);
        } else {
            await this.renderBookHub();
        }
    }

    parseUrl() {
        const params = new URLSearchParams(window.location.search);
        this.bookId = params.get("book") || null;
        this.searchQuery = params.get("search") || "";
        this.action = params.get("action") || "";
        this.entryId = params.get("entry") || params.get("char") || params.get("place") || "";
        this.pendingTitle = params.get("title") || params.get("wiki") || "";
    }

    wireUi() {
        this.els.searchForm?.addEventListener("submit", (e) => {
            e.preventDefault();
            const q = this.els.searchInput?.value?.trim();
            if (!q || !this.bookId) return;
            this.filterArticles(q);
        });

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

    filterArticles(query) {
        const q = query.toLowerCase();
        const filtered = this.entries.filter(
            (e) =>
                e.name.toLowerCase().includes(q) ||
                (e.body || "").toLowerCase().includes(q) ||
                (e.aliases || []).some((a) => a.toLowerCase().includes(q))
        );
        this.renderArticleList(filtered, query);
    }

    navigate(params) {
        const url = new URL(window.location.href);
        url.search = "";
        for (const [k, v] of Object.entries(params)) {
            if (v) url.searchParams.set(k, v);
        }
        window.location.href = url.pathname + url.search;
    }

    async renderBookHub() {
        document.title = "Story Wiki — Create lore";
        this.els.pageToolbar.hidden = true;
        this.els.contentSub.textContent = "";
        this.els.lastModified.textContent = "";
        const books = await listBooks(this.uid);
        this.els.parserOutput.innerHTML = renderCreatorBookHub(books);
    }

    async loadBook(bookId) {
        this.bookId = bookId;
        this.bookTitle = await getBookTitle(this.uid, bookId);
        this.entries = await listEntries(this.uid, bookId);
        this.publishedIds = await listPublishedEntryIds(this.uid, bookId);

        if (this.els.navEditor) {
            this.els.navEditor.href = `editor.html?book=${encodeURIComponent(bookId)}`;
        }

        document.getElementById("wikiLogoLink")?.setAttribute("href", `wiki.html?book=${encodeURIComponent(bookId)}`);

        let entry = null;
        if (this.entryId) {
            entry = this.entries.find((e) => e.id === this.entryId) || null;
        } else if (this.pendingTitle) {
            const norm = this.pendingTitle.trim().toLowerCase();
            entry = this.entries.find((e) => e.name.toLowerCase() === norm) || null;
        }

        if (this.action === "edit" || entry) {
            return this.renderEdit(entry, this.pendingTitle);
        }

        return this.renderArticleList(this.entries);
    }

    renderArticleList(entries, searchQuery = "") {
        document.title = `${this.bookTitle} — Story Wiki`;
        this.els.pageToolbar.hidden = true;
        this.els.parserOutput.closest(".mw-body-content-inner")?.classList.remove("wiki-edit-shell");
        this.els.contentSub.innerHTML = `<a href="wiki.html">All books</a> · ${escapeHtml(this.bookTitle)}`;
        this.els.lastModified.textContent = "";

        if (searchQuery) {
            this.els.contentSub.innerHTML += ` · Filter: “${escapeHtml(searchQuery)}”`;
        }

        this.els.parserOutput.innerHTML = renderCreatorArticleList(
            this.bookTitle,
            this.bookId,
            entries,
            this.publishedIds
        );

        this.els.parserOutput.querySelectorAll("[data-wiki-delete]").forEach((btn) => {
            btn.addEventListener("click", () => void this.handleDelete(btn.dataset.wikiDelete, btn.dataset.wikiKind));
        });
    }

    async handleDelete(entryId, kind) {
        const published = this.publishedIds.has(entryId);
        const msg = published
            ? "Delete this article? It will be removed from Story Wiki and Lore Wiki. This cannot be undone."
            : "Delete this article? This cannot be undone.";
        if (!confirm(msg)) return;
        await deleteEntry(this.uid, this.bookId, entryId, kind);
        if (this.publishedIds.has(entryId)) {
            await unpublishEntryFromLore(this.uid, this.bookId, entryId, {
                bookTitle: this.bookTitle,
                authorName: this.authorName,
            });
        }
        this.navigate({ book: this.bookId });
    }

    renderEdit(entry, defaultTitle) {
        const isPublished = entry ? this.publishedIds.has(entry.id) : false;

        document.title = entry ? `Edit: ${entry.name}` : "New lore article";
        this.els.pageToolbar.hidden = true;
        this.els.contentSub.textContent = "";
        this.els.lastModified.textContent = "";
        this.els.parserOutput.closest(".mw-body-content-inner")?.classList.add("wiki-edit-shell");

        mountEditor(
            this.els.parserOutput,
            entry,
            this.bookId,
            defaultTitle,
            isPublished,
            !isLocalStudioUid(this.uid),
            async (saved, publishAfterSave) => {
                if (publishAfterSave) {
                    await publishEntryToLore(this.uid, this.bookId, saved, {
                        bookTitle: this.bookTitle,
                        authorName: this.authorName,
                    });
                } else if (isPublished && entry) {
                    await publishEntryToLore(this.uid, this.bookId, saved, {
                        bookTitle: this.bookTitle,
                        authorName: this.authorName,
                    });
                }
                this.navigate({ book: this.bookId, entry: saved.id, action: "edit" });
            },
            async (saved) => {
                if (isPublished) {
                    await unpublishEntryFromLore(this.uid, this.bookId, saved.id, {
                        bookTitle: this.bookTitle,
                        authorName: this.authorName,
                    });
                    this.publishedIds.delete(saved.id);
                }
                await this.loadBook(this.bookId);
            },
            () => this.navigate({ book: this.bookId }),
            entry
                ? () => void this.handleDelete(entry.id, entry.kind)
                : null
        );
    }
}

export async function startWiki(uid) {
    wireLogoutButtons(document);
    const app = new WikiApp(uid);
    await app.init();
    return app;
}
