import { supabase } from "@alysum/authentication/client.js";
import { requireStudioSession } from "@alysum/desktop/studio-session.js";
import { createBooksApi } from "@alysum/synchronization-engine/books.js";
import { createEmptyBook } from "@alysum/writing-engine/manuscript.js";
import { countWordsInSections } from "@alysum/writing-engine/word-count.js";
import { initWorkspaceShell } from "./shell.js?v=2";
import { loadWorkspaceProfile } from "@alysum/account/workspace-profile.js";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatWhen(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return "Not saved yet";
    try {
        return new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }).format(new Date(n));
    } catch {
        return "";
    }
}

function chapterCount(book) {
    const body = book?.sections?.body;
    return Array.isArray(body) ? body.length : 0;
}

function renderBooks(mount, books) {
    if (!books.length) {
        mount.innerHTML = `<p class="hint studio-empty">No books yet. Start a new one.</p>`;
        return;
    }
    mount.innerHTML = books
        .map((book) => {
            const words = Number(book.words) || countWordsInSections(book.sections);
            const chapters = chapterCount(book);
            return `
                <a class="studio-book" href="editor.html?book=${encodeURIComponent(book.id)}">
                    <h2 class="studio-book-title">${escapeHtml(book.title || "Untitled Book")}</h2>
                    <p class="studio-book-meta">${chapters} chapter${chapters === 1 ? "" : "s"} · ${words.toLocaleString()} words</p>
                    <p class="studio-book-when">Updated ${escapeHtml(formatWhen(book.updated))}</p>
                </a>`;
        })
        .join("");
}

async function boot() {
    initWorkspaceShell({ lead: "Writing ", accent: "Studio", subtitle: "Open a book and keep writing." });
    const session = await requireStudioSession(supabase, "studio.html");
    if (!session) return;
    const profile = await loadWorkspaceProfile(supabase, session);
    initWorkspaceShell({
        lead: "Writing ",
        accent: "Studio",
        subtitle: "Open a book and keep writing.",
        name: profile.name,
        imageUrl: profile.imageUrl,
    });

    const loading = document.getElementById("loadingPanel");
    const shell = document.getElementById("studioShell");
    const list = document.getElementById("bookList");
    const newBtn = document.getElementById("newBookBtn");
    const status = document.getElementById("studioStatus");

    const api = createBooksApi(session, supabase);
    let books = [];
    try {
        books = await api.listBooks();
    } catch {
        books = [];
        if (status) status.textContent = "Could not load books.";
    }

    loading?.classList.add("hidden");
    shell?.classList.remove("hidden");
    renderBooks(list, books);

    newBtn?.addEventListener("click", async () => {
        newBtn.disabled = true;
        if (status) status.textContent = "Creating…";
        try {
            const created = await api.insertBook(createEmptyBook());
            window.location.href = `editor.html?book=${encodeURIComponent(created.id)}`;
        } catch {
            if (status) status.textContent = "Could not create a book.";
            newBtn.disabled = false;
        }
    });
}

boot();
