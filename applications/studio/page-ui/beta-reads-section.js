import { createBetaReadApi } from "/applications/editor/page-ui/beta-read-api.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

export function mountStudioBetaReads(anchor, supabase, session) {
    if (!anchor || session?.mode !== "cloud") return;
    const section = document.createElement("section");
    section.id = "studioBetaReads";
    section.className = "studio-shared";
    section.setAttribute("aria-labelledby", "studioBetaReadsTitle");
    section.innerHTML = `<div class="studio-section-head">
        <h2 id="studioBetaReadsTitle">Beta Readers</h2>
        <a href="/applications/studio/pages/beta-reads.html" class="studio-shelf-count">Manage all</a>
    </div>
    <p class="studio-shared-help">Private copies shared for feedback. Your original books stay unchanged.</p>
    <div class="studio-shared-list" data-beta-list aria-live="polite">
        <p class="studio-book-meta">Loading beta reads…</p>
    </div>`;
    // The shared-books section is immediately before the statistics anchor.
    // Insert after it, without changing its rendering or any existing book cards.
    anchor.before(section);
    const list = section.querySelector("[data-beta-list]");
    const api = createBetaReadApi(supabase);
    api.list().then(({ reads = [] }) => {
        if (!section.isConnected) return;
        if (!reads.length) {
            list.innerHTML = `<p class="studio-book-meta">No beta copies yet. Create one from the editor's Share → Beta Read tab.</p>`;
            return;
        }
        list.innerHTML = reads.map(read => `<a class="studio-book studio-shared-book"
            href="/applications/studio/pages/beta-reads.html">
            <span class="studio-coeditor-badge">${read.status === "closed" ? "Archived" : "Beta Read"}</span>
            <div class="studio-shared-copy">
                <h3 class="studio-book-title">${esc(read.title || "Untitled book")}</h3>
                <p class="studio-book-meta">By ${esc(read.author_username)}</p>
                <p class="studio-book-meta">${read.status === "closed" ? "Link closed · Feedback preserved" : "Active · Private feedback copy"}</p>
            </div>
        </a>`).join("");
    }).catch(error => {
        if (section.isConnected) {
            list.replaceChildren();
            const message = document.createElement("p");
            message.className = "studio-book-meta";
            message.textContent = "Beta Reads could not load. ";
            const link = document.createElement("a");
            link.href = "/applications/studio/pages/beta-reads.html";
            link.textContent = "Open Beta Reads";
            message.append(link);
            list.append(message);
            console.warn("Studio Beta Reads:", error);
        }
    });
}
