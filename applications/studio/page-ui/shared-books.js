import { groupRevisionBooks } from '/core/writing-engine/draft-revisions.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function sharedBooksSection(anchor) {
    let section = document.getElementById('studioSharedBooks');
    if (!section && anchor) {
        section = document.createElement('section');
        section.id = 'studioSharedBooks';
        section.className = 'studio-shared';
        section.hidden = true;
        section.setAttribute('aria-labelledby', 'studioSharedTitle');
        anchor.before(section);
    }
    return section;
}

export function renderSharedBooks(section, books, { creators = new Map(), coverHtml = () => '', words = book => book.words || 0 } = {}) {
    if (!section) return;
    const groups = groupRevisionBooks(books);
    section.hidden = !groups.length;
    if (!groups.length) { section.replaceChildren(); return; }
    section.innerHTML = `<div class="studio-section-head"><h2 id="studioSharedTitle">Shared with you</h2><span class="studio-shelf-count">${groups.length} book${groups.length === 1 ? '' : 's'}</span></div><p class="studio-shared-help">Stories you’re invited to edit.</p><div class="studio-shared-list">${groups.map(({book, drafts}) => {
        const cover = coverHtml(book);
        const creator = creators.get(String(book.user_id)) || 'book creator';
        return `<a class="studio-book studio-shared-book${cover ? ' has-cover' : ''}" href="/editor?book=${encodeURIComponent(book.id)}">${cover}<span class="studio-coeditor-badge">Co-editor</span><div class="studio-shared-copy"><h3 class="studio-book-title">${esc(String(book.title || '').trim() || 'Untitled Book')}</h3><p class="studio-book-meta studio-book-creator">By ${esc(creator)}</p><p class="studio-book-meta">${Math.max(0, Number(words(book)) || 0).toLocaleString()} words${drafts.length > 1 ? ` · ${drafts.length} drafts` : ''}</p></div></a>`;
    }).join('')}</div>`;
}
