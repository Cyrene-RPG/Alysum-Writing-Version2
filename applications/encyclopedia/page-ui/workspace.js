import { createStoryBibleApi } from '/core/synchronization-engine/story-bible.js';
import { canEdit, describeError, searchEntries, FIELD_TYPES } from '/core/encyclopedia/model.js';
const byId = id => document.getElementById(id);
function el(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else if (key === 'class') node.className = value;
        else if (key in node) node[key] = value;
        else node.setAttribute(key, value);
    }
    node.append(...children.filter(child => child != null));
    return node;
}
const button = (text, action, className = '') => el('button', { type: 'button', onclick: action, class: className }, text);
const label = (text, control) => el('label', {}, text, control);
const commaValues = value => value.split(',').map(item => item.trim()).filter(Boolean);
let api, bible, state = { entries: [], types: [], connections: [], facts: [], mentions: [], members: [] };
let selectedId = '', typeFilter = '', history = [], isEditing = false, isDirty = false, savePromise = null, timer, cancelTimer;
let portraitGeneration = 0;
const portraitUrls = new Map();
const parameters = new URLSearchParams(location.search);
let userId = '';
function status(text, isError = false) { byId('status').textContent = text; byId('status').classList.toggle('is-error', isError); }
function report(error) { status(describeError(error), true); }
async function run(action) { try { return await action(); } catch (error) { report(error); return null; } }
function entryById(id) { return state.entries.find(entry => entry.id === id); }
function typeById(id) { return state.types.find(type => type.id === id); }
function recoveryKey(id) { return `alysum:story-bible:recovery:${userId}:${bible.id}:${id}`; }
function renderLinkedText(text) {
    const fragment = document.createDocumentFragment();
    let start = 0;
    for (const match of String(text).matchAll(/\[\[([a-f\d-]{36})(?:\|([^\]\n]*))?\]\]/gi)) {
        fragment.append(String(text).slice(start, match.index));
        const target = entryById(match[1]);
        fragment.append(target ? button(target.title + (target.archivedAt ? ' (archived)' : ''), () => void selectEntry(target.id), 'bible-link') : el('span', {}, match[2] || 'Unavailable entry'));
        start = match.index + match[0].length;
    }
    fragment.append(String(text).slice(start));
    return fragment;
}
async function paintPortrait(node, entry, className) {
    const path = entry.portraitPath;
    if (!path) return;
    try {
        let url = portraitUrls.get(path);
        if (!url) { url = await api.portraitUrl(path); portraitUrls.set(path, url); setTimeout(() => portraitUrls.delete(path), 4 * 60 * 1000); }
        if (node.isConnected) node.replaceWith(el('img', { class: className, src: url, alt: `${entry.title} portrait`, loading: 'lazy' }));
    } catch { /* The readable initial remains if a private image cannot load. */ }
}
function renderDirectory() {
    const active = state.entries.filter(entry => !entry.archivedAt);
    byId('entry-count').textContent = String(active.length);
    byId('categories').replaceChildren(...state.types.map(type => {
        const node = button('', () => { typeFilter = type.id; renderDirectory(); }, 'bible-nav-button' + (typeFilter === type.id ? ' is-active' : ''));
        node.append(type.name, el('span', {}, String(active.filter(entry => entry.typeId === type.id).length)));
        return node;
    }));
    byId('all-entries').classList.toggle('is-active', !typeFilter);
    byId('directory-title').textContent = typeById(typeFilter)?.name || 'All entries';
    const results = searchEntries(state.entries, byId('search').value, typeFilter, byId('show-archived').checked);
    byId('result-count').textContent = `${results.length} ${results.length === 1 ? 'entry' : 'entries'}`;
    byId('entries').replaceChildren(...results.map(entry => {
        const avatar = el('span', { class: 'bible-avatar', 'aria-hidden': 'true' }, entry.title[0]);
        const node = button('', () => void selectEntry(entry.id), 'bible-card' + (entry.id === selectedId ? ' is-selected' : ''));
        node.append(avatar, el('span', {}, el('strong', {}, entry.title), el('small', {}, `${typeById(entry.typeId)?.name || 'Entry'}${entry.archivedAt ? ' · Archived' : ''}`), el('small', {}, (entry.tags || []).slice(0, 3).join(' · '))));
        queueMicrotask(() => void paintPortrait(avatar, entry, 'bible-avatar'));
        return node;
    }));
    if (!results.length) byId('entries').append(el('p', { class: 'bible-help' }, 'No entries yet. Create one, or adjust your search.'));
}
async function refresh() {
    state = await api.load(bible.id);
    renderDirectory();
}
async function leaveEdit() {
    clearTimeout(timer);
    if (!isEditing) return true;
    if (savePromise) await savePromise;
    if (isDirty && !(await saveProfile())) return false;
    isEditing = false; portraitGeneration++;
    try { await refresh(); } catch (error) { report(error); }
    return true;
}
async function selectEntry(id, remember = true) {
    if (!(await leaveEdit())) return;
    if (remember && selectedId && selectedId !== id) history.push(selectedId);
    selectedId = id;
    byId('workspace').classList.add('has-selection');
    renderDirectory(); renderProfile();
    byId('profile').focus({ preventScroll: true });
    const url = new URL(location); url.searchParams.set('entry', id); window.history.replaceState(null, '', url);
}
function renderProfile() {
    const entry = entryById(selectedId);
    if (!entry) return;
    const type = typeById(entry.typeId), profile = byId('profile');
    profile.replaceChildren();
    profile.append(el('nav', { class: 'bible-profile-nav', 'aria-label': 'Entry navigation' }, button('← Directory', async () => {
        if (!(await leaveEdit())) return;
        byId('workspace').classList.remove('has-selection');
    }), history.length ? button('← Previous page', () => void selectEntry(history.pop(), false)) : null, el('span', {}, `${type?.name || 'Entry'} / ${entry.title}`)));
    const actions = el('div', { class: 'bible-actions' });
    if (canEdit(bible.role)) {
        actions.append(button('Edit profile', () => editProfile(entry), 'bible-primary'), button(entry.archivedAt ? 'Restore entry' : 'Archive entry', () => void run(async () => {
            const next = await api.saveEntry({ ...entry, archivedAt: entry.archivedAt ? null : new Date().toISOString() }, type);
            await refresh(); renderProfile(); status(next.archivedAt ? 'Entry archived. Existing links remain intact.' : 'Entry restored.');
        })));
    }
    actions.append(button('Version history', () => void versionsDialog(entry)));
    if (bible.role === 'owner') actions.append(button('Edit category', () => templateDialog(type)));
    profile.append(actions);
    const portrait = el('div', { class: 'bible-portrait', 'aria-hidden': 'true' }, entry.title[0]);
    profile.append(el('header', { class: 'bible-profile-heading' }, portrait, el('div', {}, el('p', { class: 'bible-eyebrow' }, type?.name || 'ENTRY'), el('h2', {}, entry.title), el('p', { class: 'bible-help' }, entry.aliases?.length ? `Also known as ${entry.aliases.join(', ')}` : ''), ...(entry.tags || []).map(tag => el('span', { class: 'bible-chip' }, tag)), entry.archivedAt ? el('span', { class: 'bible-chip' }, 'Archived') : null)));
    void paintPortrait(portrait, entry, 'bible-portrait');
    const facts = el('dl');
    for (const definition of [...(type?.fields || []), ...(entry.customFields || [])]) {
        const value = entry.fields?.[definition.id];
        if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
        const target = definition.type === 'reference' ? entryById(value) : null;
        facts.append(el('div', {}, el('dt', {}, definition.label), el('dd', {}, target ? button(target.title, () => void selectEntry(target.id), 'bible-link') : Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value))));
    }
    // Values removed from the template are preserved and visible as archived fields.
    for (const [id, value] of Object.entries(entry.fields || {})) if (![...(type?.fields || []), ...(entry.customFields || [])].some(field => field.id === id) && value !== '') facts.append(el('div', {}, el('dt', {}, `${id} (archived field)`), el('dd', {}, String(value))));
    const prose = el('div', { class: 'bible-prose' });
    for (const section of type?.sections || []) if (entry.sections?.[section.id]) prose.append(el('section', {}, el('h3', {}, section.label), el('p', {}, renderLinkedText(entry.sections[section.id]))));
    for (const [id, text] of Object.entries(entry.sections || {})) if (!(type?.sections || []).some(section => section.id === id) && text) prose.append(el('section', {}, el('h3', {}, `${id} (additional section)`), el('p', {}, renderLinkedText(text))));
    if (!prose.childNodes.length) prose.append(el('p', { class: 'bible-help' }, 'There is room for their story here. Edit this profile to add a biography, details, and connections.'));
    profile.append(el('div', { class: 'bible-profile-columns' }, el('aside', { class: 'bible-facts', 'aria-label': 'Quick facts' }, el('p', { class: 'bible-eyebrow' }, 'QUICK FACTS'), facts), prose));
    const connections = el('section', { class: 'bible-related' }, el('h3', {}, 'Connections'));
    if (canEdit(bible.role)) connections.append(button('＋ Relationship', () => relationshipDialog(entry)));
    for (const connection of state.connections.filter(item => item.sourceId === entry.id || item.targetId === entry.id)) {
        const outgoing = connection.sourceId === entry.id, target = entryById(outgoing ? connection.targetId : connection.sourceId);
        if (!target) continue;
        const text = connection.kind === 'reference' ? outgoing ? 'References' : 'Referenced by' : outgoing ? connection.label : connection.reverseLabel || `← ${connection.label}`;
        const row = el('div', { class: 'bible-connection' }, text, button(target.title, () => void selectEntry(target.id), 'bible-link'));
        if (connection.kind === 'relationship' && canEdit(bible.role)) row.append(button('Remove', () => void run(async () => { await api.removeConnection(bible.id, connection.id); await refresh(); renderProfile(); })));
        connections.append(row);
    }
    profile.append(connections);
    const canon = el('section', { class: 'bible-related' }, el('h3', {}, 'Canon facts'));
    if (canEdit(bible.role)) canon.append(button('＋ Add fact', () => factDialog(entry)));
    for (const fact of state.facts.filter(item => item.entryId === entry.id)) {
        const item = el('article', {}, el('strong', {}, fact.category || 'Fact'), el('p', {}, fact.value));
        if (fact.sourceText) item.append(el('blockquote', {}, fact.sourceText));
        if (fact.sourceBookId) item.append(el('a', { href: `/editor?book=${encodeURIComponent(fact.sourceBookId)}&chapter=${encodeURIComponent(fact.sourceChapterId)}` }, 'Open source chapter'), el('p', { class: 'bible-help' }, 'Source quotation is a saved snapshot; review it if the manuscript changes.'));
        canon.append(item);
    }
    profile.append(canon);
    const appearances = el('section', { class: 'bible-related' }, el('h3', {}, 'Manuscript appearances'));
    const mentions = state.mentions.filter(item => item.entryId === entry.id);
    for (const mention of mentions) appearances.append(el('p', {}, el('a', { href: `/editor?book=${encodeURIComponent(mention.bookId)}&chapter=${encodeURIComponent(mention.chapterId)}` }, mention.excerpt || 'Open chapter')));
    if (!mentions.length) appearances.append(el('p', { class: 'bible-help' }, 'Use explicit character mentions in the editor to record appearances.'));
    profile.append(appearances);
}
let editingEntry = null, editingTemplate = null, formControls, generation = 0;
function editProfile(entry) {
    isEditing = true; isDirty = false; editingEntry = structuredClone(entry); editingTemplate = typeById(entry.typeId); formControls = {};
    const profile = byId('profile'); profile.replaceChildren();
    profile.append(el('p', { class: 'bible-eyebrow' }, `EDITING ${editingTemplate.name.toUpperCase()}`));
    const form = el('form', { class: 'bible-edit-form', onsubmit: event => { event.preventDefault(); void saveProfile().then(saved => { if (saved) { isEditing = false; portraitGeneration++; void refresh().then(renderProfile).catch(report); } }); } });
    const title = el('input', { value: entry.title, required: true, maxLength: 200 }); formControls.title = title;
    const aliases = el('input', { value: (entry.aliases || []).join(', '), placeholder: 'Separate aliases with commas' }); formControls.aliases = aliases;
    const tags = el('input', { value: (entry.tags || []).join(', '), placeholder: 'Separate tags with commas' }); formControls.tags = tags;
    form.append(label('Name', title), label('Aliases', aliases), label('Tags', tags));
    const portrait = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', onchange: event => void run(async () => {
        const file = event.target.files[0]; if (!file) return;
        const currentGeneration = portraitGeneration;
        status('Uploading private portrait…');
        const path = await api.uploadPortrait(bible.id, file);
        if (currentGeneration !== portraitGeneration || !isEditing) return;
        editingEntry.portraitPath = path; markDirty(); status('Portrait uploaded. Saving profile…');
    }) });
    form.append(label('Portrait · JPEG, PNG, or WebP, up to 5 MB', portrait), button('Remove portrait', () => { editingEntry.portraitPath = null; markDirty(); }));
    const facts = el('div', { class: 'bible-edit-facts' }); formControls.fields = {};
    for (const definition of [...editingTemplate.fields, ...(entry.customFields || [])]) {
        const value = entry.fields?.[definition.id]; let input;
        if (definition.type === 'reference' || ['choice', 'multiple-choice'].includes(definition.type)) {
            input = el('select', { multiple: definition.type === 'multiple-choice' });
            if (!input.multiple) input.append(el('option', { value: '' }, 'Not set'));
            const options = definition.type === 'reference' ? state.entries.filter(item => item.id !== entry.id && !item.archivedAt).map(item => ({ value: item.id, label: item.title })) : (definition.options || []).map(item => ({ value: item, label: item }));
            if (definition.type === 'reference' && value && !options.some(option => option.value === value)) options.push({ value, label: entryById(value)?.title || 'Unavailable reference' });
            if (['choice', 'multiple-choice'].includes(definition.type)) for (const oldValue of (Array.isArray(value) ? value : value ? [value] : [])) if (!options.some(option => option.value === oldValue)) options.push({ value: oldValue, label: `${oldValue} (archived choice)` });
            for (const option of options) input.append(el('option', { value: option.value, selected: Array.isArray(value) ? value.includes(option.value) : value === option.value }, option.label));
        } else if (definition.type === 'long-text') input = el('textarea', { value: value || '' });
        else input = el('input', { type: definition.type === 'checkbox' ? 'checkbox' : definition.type === 'number' ? 'number' : 'text', value: value ?? '', checked: Boolean(value) });
        formControls.fields[definition.id] = { input, definition }; facts.append(label(definition.label, input));
    }
    form.append(el('h3', {}, 'Quick facts'), facts, button('＋ Add a fact field to this profile', () => {
        const name = window.prompt('Name this profile’s additional field'); if (!name?.trim()) return;
        const definition = { id: `custom-${crypto.randomUUID()}`, label: name.trim(), type: 'text' };
        editingEntry.customFields = [...(editingEntry.customFields || []), definition];
        const input = el('input'); formControls.fields[definition.id] = { input, definition };
        facts.append(label(definition.label, input)); markDirty(); input.focus();
    }));
    formControls.sections = {};
    const sections = [...editingTemplate.sections, ...Object.keys(entry.sections || {}).filter(id => !editingTemplate.sections.some(section => section.id === id)).map(id => ({ id, label: `${id} (additional section)` }))];
    for (const section of sections) {
        const input = el('textarea', { value: entry.sections?.[section.id] || '', rows: 5 });
        formControls.sections[section.id] = input;
        form.append(label(section.label, input));
        const linkPicker = el('select', { 'aria-label': `Insert link in ${section.label}`, onchange: () => {
            if (!linkPicker.value) return;
            const target = entryById(linkPicker.value);
            input.setRangeText(`[[${target.id}|${target.title}]]`, input.selectionStart, input.selectionEnd, 'end'); input.focus(); linkPicker.value = ''; markDirty();
        } }, el('option', { value: '' }, 'Insert a link to another entry…'), ...state.entries.filter(item => item.id !== entry.id && !item.archivedAt).map(item => el('option', { value: item.id }, item.title)));
        form.append(linkPicker);
        input.addEventListener('input', () => { if (input.value.slice(0, input.selectionStart).endsWith('[[')) { input.setRangeText('', input.selectionStart - 2, input.selectionStart, 'end'); linkPicker.focus(); } });
    }
    form.append(button('＋ Add a section to this profile', () => {
        const id = `custom-${crypto.randomUUID()}`; const heading = el('input', { placeholder: 'Section title', required: true }); const input = el('textarea');
        // Store the writer’s heading as the section key so it remains readable outside the template.
        formControls.sections[id] = input; input.dataset.headingInput = id; heading.id = id; form.insertBefore(label('Additional section name', heading), form.lastElementChild); form.insertBefore(input, form.lastElementChild); markDirty();
    }));
    form.append(el('p', { class: 'bible-help' }, 'Changes save automatically. Removing a field from its category preserves its saved value. Wiki links remain connected after a rename.'));
    form.append(el('div', { class: 'bible-edit-buttons' }, el('button', { type: 'submit', class: 'bible-primary' }, 'Save and close'), button('Close editor', () => void leaveEdit().then(ok => { if (ok) renderProfile(); })), button('Reload saved profile', () => void run(async () => {
        // Explicitly confirmed only when discarding unsaved edits.
        if (isDirty && !window.confirm('Discard your unsaved profile edits and reload the cloud version?')) return;
        clearTimeout(timer); if (savePromise) await savePromise; isDirty = false; isEditing = false; portraitGeneration++; await refresh(); renderProfile(); status('Loaded saved profile.');
    }))));
    form.addEventListener('input', markDirty); form.addEventListener('change', markDirty); profile.append(form); title.focus();
    let recovery; try { recovery = localStorage.getItem(recoveryKey(entry.id)); } catch { /* Cloud editing works without browser storage. */ }
    if (recovery) {
        profile.prepend(el('p', { class: 'bible-notice' }, 'A recovery copy is available. ', button('Recover edits', () => {
            const recovered = JSON.parse(recovery); localStorage.removeItem(recoveryKey(entry.id));
            editProfile({ ...recovered, revision: entry.revision }); markDirty();
        })));
    }
}
function collectProfile() {
    const entry = structuredClone(editingEntry);
    entry.title = formControls.title.value; entry.aliases = commaValues(formControls.aliases.value); entry.tags = commaValues(formControls.tags.value);
    entry.fields = { ...entry.fields }; entry.sections = { ...entry.sections };
    for (const [id, { input, definition }] of Object.entries(formControls.fields)) entry.fields[id] = definition.type === 'checkbox' ? input.checked : definition.type === 'multiple-choice' ? [...input.selectedOptions].map(option => option.value) : definition.type === 'number' && input.value !== '' ? Number(input.value) : input.value;
    for (const [id, input] of Object.entries(formControls.sections)) {
        const heading = input.dataset.headingInput ? byId(input.dataset.headingInput)?.value.trim() : id;
        if (heading) entry.sections[heading] = input.value;
    }
    return entry;
}
function markDirty() {
    if (!isEditing) return;
    isDirty = true; generation++; status('Unsaved changes');
    try { localStorage.setItem(recoveryKey(editingEntry.id), JSON.stringify(collectProfile())); } catch { /* Saving to cloud is still available if browser storage is full. */ }
    clearTimeout(timer); timer = setTimeout(() => void saveProfile(), 900);
}
async function saveProfile() {
    if (savePromise) { await savePromise; if (isDirty) return saveProfile(); return true; }
    if (!isDirty) return true;
    const entry = collectProfile(), token = generation; status('Saving…');
    savePromise = (async () => {
        try {
            const saved = await api.saveEntry(entry, editingTemplate);
            editingEntry = { ...editingEntry, revision: saved.revision };
            state.entries = state.entries.map(item => item.id === saved.id ? saved : item);
            if (generation === token) { isDirty = false; try { localStorage.removeItem(recoveryKey(entry.id)); } catch {} status(parameters.get('preview') === '1' ? 'Saved in this temporary preview' : 'Saved to your account'); }
            renderDirectory(); return true;
        } catch (error) { report(error); return false; }
        finally { savePromise = null; }
    })();
    return savePromise;
}
let submitDialog = null;
function openDialog(title, nodes, submit, submitText = 'Save') {
    byId('dialog-title').textContent = title; byId('dialog-body').replaceChildren(...nodes); byId('dialog-error').textContent = ''; byId('dialog-submit').textContent = submitText; byId('dialog-submit').hidden = !submit; submitDialog = submit;
    byId('bible-dialog').showModal();
}
byId('dialog-form').addEventListener('submit', async event => {
    event.preventDefault(); byId('dialog-submit').disabled = true;
    try { if (submitDialog) await submitDialog(); byId('bible-dialog').close(); }
    catch (error) { byId('dialog-error').textContent = describeError(error); }
    finally { byId('dialog-submit').disabled = false; }
});
for (const id of ['dialog-close', 'dialog-cancel']) byId(id).onclick = () => byId('bible-dialog').close();
function newEntryDialog() {
    const entryId = crypto.randomUUID();
    const name = el('input', { required: true, maxLength: 200, placeholder: 'Character, place, or anything else…' });
    const type = el('select', {}, ...state.types.map(item => el('option', { value: item.id, selected: item.id === typeFilter }, item.name)));
    openDialog('A new page in your world', [label('Name', name), label('Category', type)], async () => {
        if (!(await leaveEdit())) throw new Error('Save the current profile before creating another.');
        const saved = await api.saveEntry({ id: entryId, bibleId: bible.id, typeId: type.value, title: name.value, aliases: [], tags: [], fields: {}, sections: {} }, typeById(type.value));
        await refresh(); await selectEntry(saved.id); editProfile(saved); status('Entry created.');
    }, 'Create entry');
}
function templateDialog(template = null) {
    const name = el('input', { value: template?.name || '', required: true, maxLength: 80 });
    const rows = el('div'), sectionRows = el('div');
    function addRow(definition = {}, isSection = false) {
        const id = definition.id || `field-${crypto.randomUUID()}`;
        const heading = el('input', { value: definition.label || '', placeholder: 'Label', required: true, maxLength: 100 });
        const type = el('select', {}, ...FIELD_TYPES.map(value => el('option', { value, selected: value === definition.type }, value)));
        const options = el('input', { value: (definition.options || []).join(', '), placeholder: 'Choices, separated, by commas', 'aria-label': 'Choice options' });
        const row = el('div', { class: 'bible-template-row' }, heading, isSection ? el('span', { class: 'bible-help' }, 'Written section') : type, isSection ? null : options);
        row.append(button('↑', () => { if (row.previousElementSibling) row.previousElementSibling.before(row); }), button('↓', () => { if (row.nextElementSibling) row.nextElementSibling.after(row); }), button('×', () => row.remove())); row.definition = () => ({ id, label: heading.value, ...(isSection ? {} : { type: type.value, ...(['choice', 'multiple-choice'].includes(type.value) ? { options: commaValues(options.value) } : {}) }) });
        (isSection ? sectionRows : rows).append(row);
    }
    for (const definition of template?.fields || []) addRow(definition);
    for (const definition of template?.sections || []) addRow(definition, true);
    openDialog(template ? `Edit ${template.name} category` : 'Create a category', [label('Category name', name), el('p', { class: 'bible-help' }, 'Changes apply to this category. Existing values remain preserved when fields or sections are removed. Field IDs stay the same when labels change.'), el('h3', {}, 'Quick facts'), rows, button('＋ Add field', () => addRow()), el('h3', {}, 'Written sections'), sectionRows, button('＋ Add section', () => addRow({}, true))], async () => {
        if (!(await leaveEdit())) throw new Error('Save the current profile first.');
        const saved = await api.saveType(bible.id, { ...template, name: name.value, fields: [...rows.children].map(row => row.definition()), sections: [...sectionRows.children].map(row => row.definition()) });
        await refresh(); typeFilter = saved.id; renderDirectory(); if (selectedId) renderProfile(); status('Category saved.');
    });
}
function relationshipDialog(entry) {
    const target = el('select', {}, ...state.entries.filter(item => item.id !== entry.id && !item.archivedAt).map(item => el('option', { value: item.id }, item.title)));
    const forward = el('input', { required: true, placeholder: 'For example: parent of', maxLength: 100 });
    const reverse = el('input', { placeholder: 'For example: child of', maxLength: 100 });
    openDialog('Connect two entries', [label('Other entry', target), label(`${entry.title} is…`, forward), label('Reverse relationship (optional)', reverse)], async () => {
        if (!target.value) throw new Error('Create another entry first.');
        await api.connect(bible.id, entry.id, target.value, forward.value, reverse.value); await refresh(); renderProfile();
    });
}
function factDialog(entry) {
    const category = el('input', { placeholder: 'Appearance, injury, history…', maxLength: 100 }); const value = el('textarea', { required: true, maxLength: 10000 });
    openDialog('Add a canon fact', [label('Category', category), label('Fact', value)], async () => { await api.addFact(bible.id, entry.id, { category: category.value, value: value.value }); await refresh(); renderProfile(); });
}
async function versionsDialog(entry) {
    await run(async () => {
        const versions = (await api.listVersions(bible.id, entry.id)).sort((a, b) => b.revision - a.revision);
        const content = el('div');
        if (!versions.length) content.append(el('p', {}, 'Earlier saved versions will appear here after this profile is edited.'));
        for (const version of versions) content.append(el('details', {}, el('summary', {}, `Version ${version.revision} · ${new Date(version.createdAt).toLocaleString()}`), el('div', {}, el('h3', {}, version.snapshot.title), ...Object.entries(version.snapshot.fields || {}).filter(([, value]) => value != null && value !== '').map(([id, value]) => el('p', {}, `${[...(typeById(version.snapshot.typeId)?.fields || []), ...(version.snapshot.customFields || [])].find(field => field.id === id)?.label || 'Additional fact'}: ${String(value)}`)), ...Object.entries(version.snapshot.sections || {}).filter(([, text]) => text).map(([id, text]) => el('section', {}, el('h4', {}, typeById(version.snapshot.typeId)?.sections.find(section => section.id === id)?.label || id), el('p', {}, renderLinkedText(text))))), canEdit(bible.role) ? button('Restore this version', () => void run(async () => {
            const snapshot = version.snapshot;
            const saved = await api.saveEntry({ ...snapshot, id: entry.id, bibleId: bible.id, revision: entry.revision }, typeById(snapshot.typeId));
            await refresh(); await selectEntry(saved.id); byId('bible-dialog').close(); status('Version restored. The previous profile remains in history.');
        })) : null));
        openDialog('Profile history', [content], null);
    });
}
function accessDialog() {
    const email = el('input', { type: 'email', required: true, placeholder: 'Existing Alysum account email' });
    const role = el('select', {}, el('option', { value: 'viewer' }, 'Viewer — read only'), el('option', { value: 'editor' }, 'Editor — edit profiles'), el('option', { value: 'remove' }, 'Remove access'));
    openDialog('Manage Story Bible access', [el('p', {}, 'This grants access to this entire Bible, including private lore, sources, and version history. It does not grant manuscript access or send an invitation.'), el('p', { class: 'bible-help' }, `Share this Bible’s address with members: ${location.origin}/story-bible?bible=${bible.id}`), label('Account email', email), label('Access', role), el('p', { class: 'bible-help' }, `${state.members.length} explicit member grant(s). The owner always retains access.`)], async () => { await api.setMember(bible.id, email.value, role.value); await refresh(); status(role.value === 'remove' ? 'Member access removed.' : 'Member access updated.'); });
}
async function boot() {
    if (parameters.get('preview') === '1') {
        const { createPreviewApi } = await import('./preview.js'); api = createPreviewApi(); userId = 'preview'; bible = await api.openBook(); byId('preview-banner').hidden = false;
    } else {
        const { supabase } = await import('/core/authentication/client.js');
        const { data, error } = await supabase.auth.getSession(); if (error) throw error;
        if (!data.session) { location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
        userId = data.session.user.id; api = createStoryBibleApi(supabase, { userId });
        supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user?.id !== userId) {
                clearTimeout(timer); byId('workspace').hidden = true; state = { entries: [], types: [], connections: [], facts: [], mentions: [], members: [] };
                byId('profile').replaceChildren(); byId('bible-dialog').close(); location.replace('/login');
            }
        });
        if (parameters.has('bible')) {
            bible = await api.openBible(parameters.get('bible'));
        } else if (parameters.has('book')) {
            bible = await api.openBook(parameters.get('book'));
            if (!bible) {
                status('This book has no Story Bible yet.');
                const create = button('Create a fresh Story Bible', () => void run(async () => { create.disabled = true; try { bible = await api.openBook(parameters.get('book'), true); await start(); } finally { create.disabled = false; } }), 'bible-primary');
                byId('status').append(' ', create); return;
            }
        } else { status('Open Story Bible from a book in your editor.'); return; }
    }
    await start();
}
async function start() {
    byId('bible-title').textContent = bible.title; document.title = `${bible.title} — Alysum`;
    if (parameters.has('book')) { byId('return-book').href = `/editor?book=${encodeURIComponent(parameters.get('book'))}`; byId('return-book').textContent = 'Back to manuscript'; }
    byId('workspace').hidden = false;
    byId('new-entry').hidden = !canEdit(bible.role); byId('new-category').hidden = bible.role !== 'owner'; byId('manage-access').hidden = bible.role !== 'owner';
    await refresh(); status((parameters.get('preview') === '1' ? 'Temporary preview' : 'Saved to your account') + ' · ' + bible.role + ' access');
    const requested = parameters.get('entry'); if (requested && entryById(requested)) await selectEntry(requested);
}
byId('all-entries').onclick = () => { typeFilter = ''; renderDirectory(); };
byId('search').oninput = renderDirectory; byId('show-archived').onchange = renderDirectory;
byId('directory-view').onchange = () => byId('entries').classList.toggle('is-list', byId('directory-view').value === 'list');
byId('new-entry').onclick = newEntryDialog; byId('new-category').onclick = () => templateDialog(); byId('manage-access').onclick = accessDialog;
window.addEventListener('beforeunload', event => { if (isDirty || savePromise) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || (!isDirty && !savePromise) || event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); void leaveEdit().then(ok => { if (ok) location.assign(anchor.href); });
});
void boot().catch(report);
