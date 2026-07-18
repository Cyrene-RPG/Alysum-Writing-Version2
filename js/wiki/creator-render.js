/**
 * Story Wiki creator UI — article lists and book hub (no public read mode).
 */

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function kindLabel(kind) {
    if (kind === "character") return "Character";
    if (kind === "object") return "Object";
    return "Place";
}

/**
 * @param {Array<{ id: string, title: string, articleCount: number }>} books
 */
export function renderCreatorBookHub(books) {
    let html = `<div class="wiki-creator-hub">`;
    html += `<div class="wiki-creator-hero">
        <h1>Create lore articles</h1>
        <p>Write private encyclopedia entries for your books. Publish individual articles to <a href="lore-wiki.html">Lore Wiki</a> when you're ready for readers.</p>
    </div>`;

    if (!books.length) {
        html += `<div class="mw-message-box">No books yet. <a href="writer-dashboard.html">Create a book in Studio</a> first.</div>`;
    } else {
        html += `<ul class="wiki-book-grid">`;
        for (const book of books) {
            html += `<li class="wiki-book-card">
                <a href="wiki.html?book=${encodeURIComponent(book.id)}">${escapeHtml(book.title)}</a>
                <p>${book.articleCount} article${book.articleCount === 1 ? "" : "s"}</p>
            </li>`;
        }
        html += `</ul>`;
    }
    html += `</div>`;
    return html;
}

/**
 * @param {string} bookTitle
 * @param {string} bookId
 * @param {Array} entries
 * @param {Set<string>} publishedIds
 */
export function renderCreatorArticleList(bookTitle, bookId, entries, publishedIds) {
    const publishedCount = entries.filter((e) => publishedIds.has(e.id)).length;

    let html = `<div class="wiki-creator-hub">`;
    html += `<div class="wiki-creator-toolbar">
        <div>
            <p class="wiki-creator-kicker">Story Wiki · ${escapeHtml(bookTitle)}</p>
            <h1>Your articles</h1>
            <p class="wiki-creator-sub">${entries.length} draft${entries.length === 1 ? "" : "s"} · ${publishedCount} published to Lore Wiki</p>
        </div>
        <div class="wiki-creator-actions">
            <a class="cdx-button" href="editor.html?book=${encodeURIComponent(bookId)}">Open manuscript</a>
            <a class="cdx-button cdx-button--action-progressive" href="wiki.html?book=${encodeURIComponent(bookId)}&action=edit">New article</a>
        </div>
    </div>`;

    if (!entries.length) {
        html += `<div class="mw-message-box">No articles yet. <a href="wiki.html?book=${encodeURIComponent(bookId)}&action=edit">Create your first lore article</a>.</div>`;
    } else {
        html += `<div class="wiki-article-table-wrap"><table class="wiki-article-table">
            <thead><tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th></th>
            </tr></thead><tbody>`;

        for (const entry of entries) {
            const published = publishedIds.has(entry.id);
            html += `<tr>
                <td><a href="wiki.html?book=${encodeURIComponent(bookId)}&action=edit&entry=${encodeURIComponent(entry.id)}">${escapeHtml(entry.name)}</a></td>
                <td>${escapeHtml(kindLabel(entry.kind))}</td>
                <td>${published ? '<span class="wiki-badge wiki-badge-live">On Lore Wiki</span>' : '<span class="wiki-badge">Private draft</span>'}</td>
                <td class="wiki-article-row-actions">
                    <a href="wiki.html?book=${encodeURIComponent(bookId)}&action=edit&entry=${encodeURIComponent(entry.id)}">Edit</a>
                    ${published ? `<a href="lore-wiki.html?book=${encodeURIComponent(bookId)}&entry=${encodeURIComponent(entry.id)}" target="_blank" rel="noopener">View public</a>` : ""}
                    <button type="button" class="wiki-delete-btn" data-wiki-delete="${escapeHtml(entry.id)}" data-wiki-kind="${escapeHtml(entry.kind)}">Delete</button>
                </td>
            </tr>`;
        }

        html += `</tbody></table></div>`;
    }

    html += `<p class="wiki-creator-foot">Readers only see articles you publish. Unpublished drafts stay private.</p>`;
    html += `</div>`;
    return html;
}

export { escapeHtml };
