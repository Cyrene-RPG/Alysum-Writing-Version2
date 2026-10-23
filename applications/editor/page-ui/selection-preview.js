import { mountBibleSelectionMenu } from './selection-menu.js';
import { createPreviewApi } from '/core/encyclopedia/preview.js';
const parameters = new URLSearchParams(location.search);
if (parameters.get('phone') === '1') {
    const main = document.querySelector('main'); main.replaceChildren();
    const heading = document.createElement('h2'); heading.textContent = 'Phone layout preview';
    const hint = document.createElement('p'); hint.className = 'selection-hint'; hint.textContent = 'This is the real selection screen in a phone-width frame. Select text to reveal the Story Bible action bar. On your phone, use long-press and the selection handles.';
    const frame = document.createElement('iframe'); frame.title = 'Phone selection preview'; frame.src = '/story-bible-selection-preview?frame=1'; frame.className = 'selection-phone-frame';
    main.append(heading, hint, frame);
} else {
// Explicit, ephemeral preview: never imports authentication or contacts Supabase.
const api = createPreviewApi();
const book = { id: 'selection-preview-book', title: 'The Saltwater Crown' };
const bible = await api.openBook();
const pageEl = document.getElementById('selection-manuscript');
pageEl.addEventListener('click', event => { if (event.target.closest('a[href^="#story-bible-entry-"]')) event.preventDefault(); });
const results = document.getElementById('selection-results');
async function render() {
    const state = await api.load(); results.replaceChildren();
    for (const entry of state.entries.filter(item => !item.archivedAt)) {
        const row = document.createElement('section'); row.className = 'selection-result';
        const name = document.createElement('strong'); name.textContent = entry.title; row.append(name);
        for (const fact of state.facts.filter(item => item.entryId === entry.id)) {
            const category = document.createElement('p'); category.textContent = `${fact.category}: ${fact.value}`; row.append(category);
            if (fact.sourceText) { const quote = document.createElement('blockquote'); quote.textContent = fact.sourceText; row.append(quote); const source = document.createElement('small'); source.textContent = 'Source: Chapter 1 · Northhaven'; row.append(source); }
        }
        results.append(row);
    }
}
mountBibleSelectionMenu({ pageEl, getBook: () => book, getChapterId: () => 'chapter-northhaven', saveCurrent: async () => 'saved',
    async loadBible() { return { bible, state: await api.load(), api }; },
    async onEntryCreated(entry) { await render(); document.getElementById('selection-status').textContent = `${entry.title} created in this temporary preview.`; },
    async onFactSaved(entry) { await render(); document.getElementById('selection-status').textContent = `Details added to ${entry.title} in this temporary preview.`; },
    getEntryUrl: () => null,
});
await render();

}
