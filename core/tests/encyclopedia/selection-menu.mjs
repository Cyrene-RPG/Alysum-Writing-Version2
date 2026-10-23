/** Optional selection UI checks. Run with external jsdom and --experimental-vm-modules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)(process.env.JSDOM_MODULE || 'jsdom');
const root = new URL('../../../', import.meta.url);
const pause = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(predicate) { for (let i = 0; i < 50; i++) { if (predicate()) return; await pause(); } throw new Error('Selection UI did not reach the expected state'); }
async function harness({ role = 'owner', missing = false, isTouch = false } = {}) {
 const dom = new JSDOM('<article id="page" contenteditable="true"><p><strong>Iris Vale</strong> arrived at dawn.</p><p>Her left eye was green.</p></article><p id="outside">Outside the editor</p>', { url: 'https://alysum.test/editor?book=book-1', pretendToBeVisual: true });
 const { window } = dom, { document } = window;
 window.matchMedia = () => ({ matches: isTouch, addEventListener() {}, removeEventListener() {} });
 window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
 window.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(new window.Event('close')); };
 const context = vm.createContext({ window, document, crypto: webcrypto, structuredClone, setTimeout, clearTimeout, console });
 const modules = new Map();
 async function load(path) {
  const url = new URL(path.startsWith('/') ? path.slice(1) : path, root);
  if (modules.has(url.href)) return modules.get(url.href);
  const module = new vm.SourceTextModule(await fs.readFile(url, 'utf8'), { context, identifier: url.href }); modules.set(url.href, module);
  await module.link(async (specifier, reference) => load(specifier.startsWith('/') ? specifier : new URL(specifier, reference.identifier).pathname.slice(root.pathname.length))); return module;
 }
 const module = await load('applications/editor/page-ui/selection-menu.js'); await module.evaluate();
 const page = document.getElementById('page'), calls = [], savedEntries = [];
 let chapterId = 'chapter-one', saveStatus = 'saved', saveHook = async () => {}, callbackFailure = false;
 const state = { types: [{ id: 'character-type', name: 'Character', fields: [], sections: [] }, { id: 'location-type', name: 'Location', fields: [], sections: [] }], entries: [{ id: 'mara', typeId: 'character-type', title: 'Mara Vey' }, { id: 'elian', typeId: 'character-type', title: 'Elian Vey' }, { id: 'harbor', typeId: 'location-type', title: 'Northhaven' }] };
 const api = { saveEntry: async entry => { calls.push({ kind: 'entry', entry: structuredClone(entry) }); savedEntries.push(entry); return { ...entry, revision: 1 }; }, addFact: async (bibleId, entryId, fact) => { calls.push({ kind: 'fact', bibleId, entryId, fact: structuredClone(fact) }); } };
 document.execCommand = (command, _show, html) => { assert.equal(command, 'createLink'); const range = window.getSelection().getRangeAt(0); const anchor = document.createElement('a'); anchor.setAttribute('href', html); anchor.append(range.extractContents()); range.insertNode(anchor); page.dispatchEvent(new window.Event('input', { bubbles: true })); return true; };
 const mounted = module.namespace.mountBibleSelectionMenu({ pageEl: page, getBook: () => ({ id: 'book-1' }), getChapterId: () => chapterId,
  saveCurrent: async () => { await saveHook(); return saveStatus; }, async loadBible(create) { calls.push({ kind: 'open', create }); return { bible: missing && !create ? null : { id: 'bible-1', role }, state, api }; },
  onEntryCreated: async () => { if (callbackFailure) throw new Error('Refresh failed'); }, getEntryUrl: () => null,
 });
 function select(node = page.querySelector('strong').firstChild, start = 0, end = node.textContent.length) { const range = document.createRange(); range.setStart(node, start); range.setEnd(node, end); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
 function rightClick({ shiftKey = false } = {}) { const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40, shiftKey }); page.dispatchEvent(event); return event; }
 const findButton = text => [...document.querySelectorAll('button')].find(button => button.textContent === text);
 async function open(mode) { select(mode === 'details' ? page.querySelectorAll('p')[1].firstChild : undefined); rightClick(); findButton(mode === 'details' ? 'Add details to a character…' : 'Create entry from selection…').click(); await until(() => mounted.dialog.querySelector('input,select') || mounted.dialog.textContent.includes('read-only') || mounted.dialog.textContent.includes('does not have')); }
 function field(text) { const control = [...mounted.dialog.querySelectorAll('label')].find(label => label.firstChild?.textContent === text)?.querySelector('input,select,textarea'); assert.ok(control, `Missing ${text}`); return control; }
 async function submit() { mounted.dialog.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true })); await pause(); }
 return { dom, window, document, page, calls, mounted, select, rightClick, open, field, submit, findButton, setChapter: id => { chapterId = id; }, setSave: status => { saveStatus = status; }, setSaveHook: hook => { saveHook = hook; }, failCallback: () => { callbackFailure = true; } };
}
test('native menu remains available without selection, outside editor, and with Shift; keyboard selection menu works', async () => {
 const h = await harness(); try {
  assert.equal(h.rightClick().defaultPrevented, false);
  h.select(h.document.getElementById('outside').firstChild); assert.equal(h.rightClick().defaultPrevented, false);
  h.select(); assert.equal(h.rightClick({ shiftKey: true }).defaultPrevented, false);
  const event = new h.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, cancelable: true, bubbles: true }); h.page.dispatchEvent(event); assert.equal(event.defaultPrevented, true); assert.equal(h.mounted.menu.hidden, false);
  assert.equal(h.document.activeElement.textContent, 'Create entry from selection…');
 } finally { h.dom.window.close(); }
});
test('create entry prefills selected name and links that occurrence without losing inline formatting', async () => {
 const h = await harness(); try {
  // Selecting the strong element preserves it inside the linked fragment.
  const range = h.document.createRange(); range.selectNode(h.page.querySelector('strong')); h.window.getSelection().removeAllRanges(); h.window.getSelection().addRange(range);
  h.rightClick(); h.findButton('Create entry from selection…').click(); await until(() => h.mounted.dialog.querySelector('input'));
  assert.equal(h.field('Entry name').value, 'Iris Vale'); assert.equal(h.field('Category').value, 'character-type');
  await h.submit(); const created = h.calls.find(call => call.kind === 'entry'); assert.equal(created.entry.title, 'Iris Vale'); assert.equal(created.entry.bibleId, 'bible-1');
  const mention = h.page.querySelector('a[href^="#story-bible-entry-"]'); assert.equal(mention.textContent, 'Iris Vale'); assert.equal(mention.querySelector('strong').textContent, 'Iris Vale'); assert.equal(h.page.textContent, 'Iris Vale arrived at dawn.Her left eye was green.');
  assert.match(h.mounted.dialog.textContent, /highlighted text is linked/);
 } finally { h.dom.window.close(); }
});
test('character dropdown saves edited details and their original quotation to the chosen profile only', async () => {
 const h = await harness(); try {
  await h.open('details'); h.field('Character or entry').value = 'mara'; h.field('Save under').value = 'Appearance'; h.field('Details').value = 'Her left eye is green.';
  await h.submit(); const fact = h.calls.find(call => call.kind === 'fact');
  assert.equal(fact.entryId, 'mara'); assert.equal(fact.bibleId, 'bible-1'); assert.equal(fact.fact.category, 'Appearance'); assert.equal(fact.fact.value, 'Her left eye is green.');
  assert.equal(fact.fact.sourceText, 'Her left eye was green.'); assert.equal(fact.fact.bookId, 'book-1'); assert.equal(fact.fact.chapterId, 'chapter-one'); assert.equal(h.calls.filter(call => call.kind === 'fact').length, 1);
  assert.equal(h.page.querySelector('a[href^="#story-bible-entry-"]'), null);
 } finally { h.dom.window.close(); }
});
test('failed manuscript save retains the form and makes no fact write; retry saves once', async () => {
 const h = await harness(); try {
  await h.open('details'); h.field('Character or entry').value = 'elian'; h.setSave('error'); await h.submit();
  assert.equal(h.calls.some(call => call.kind === 'fact'), false); assert.match(h.mounted.dialog.textContent, /manuscript could not be saved/); assert.equal(h.field('Details').value, 'Her left eye was green.');
  h.setSave('saved'); await h.submit(); assert.equal(h.calls.filter(call => call.kind === 'fact').length, 1);
 } finally { h.dom.window.close(); }
});
test('changing chapter before or during a save cannot attach a stale source', async () => {
 const h = await harness(); try {
  await h.open('details'); h.field('Character or entry').value = 'mara'; h.setChapter('chapter-two'); await h.submit(); assert.equal(h.calls.some(call => call.kind === 'fact'), false);
  h.setChapter('chapter-one'); h.setSaveHook(async () => h.setChapter('chapter-two')); await h.submit(); assert.equal(h.calls.some(call => call.kind === 'fact'), false); assert.match(h.mounted.dialog.textContent, /chapter changed while saving/);
 } finally { h.dom.window.close(); }
});
test('viewer access cannot write and missing Bible creation requires an explicit click', async () => {
 const viewer = await harness({ role: 'viewer' }); try { await viewer.open('create'); assert.match(viewer.mounted.dialog.textContent, /read-only/); assert.equal(viewer.findButton('Save').hidden, true); assert.equal(viewer.calls.some(call => call.kind === 'entry'), false); } finally { viewer.dom.window.close(); }
 const h = await harness({ missing: true }); try { await h.open('create'); assert.equal(h.calls.some(call => call.create === true), false); h.findButton('Create this book’s Story Bible').click(); await until(() => h.mounted.dialog.querySelector('input')); assert.equal(h.calls.filter(call => call.create === true).length, 1); } finally { h.dom.window.close(); }
});
test('a sidebar refresh failure after confirmed creation does not expose a duplicate submit', async () => {
 const h = await harness(); try { h.failCallback(); await h.open('create'); await h.submit(); assert.equal(h.calls.filter(call => call.kind === 'entry').length, 1); assert.equal(h.mounted.dialog.querySelector('button[type="submit"]').hidden, true); assert.match(h.mounted.dialog.textContent, /entry is saved/); } finally { h.dom.window.close(); }
});

test('phone selection shows a touch action bar while preserving the native long-press menu', async () => {
 const h = await harness({ isTouch: true }); try {
  h.select(); assert.equal(h.rightClick().defaultPrevented, false);
  h.document.dispatchEvent(new h.window.Event('selectionchange'));
  await until(() => !h.mounted.touchToolbar.hidden);
  assert.equal(h.mounted.menu.hidden, true); assert.match(h.mounted.touchToolbar.textContent, /Iris Vale/);
  const create = [...h.mounted.touchToolbar.querySelectorAll('button')].find(button => button.textContent === 'Create entry');
  create.dispatchEvent(new h.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true })); create.click();
  await until(() => h.mounted.dialog.querySelector('input')); assert.equal(h.field('Entry name').value, 'Iris Vale'); assert.equal(h.mounted.touchToolbar.hidden, true);
  await h.submit(); assert.equal(h.calls.filter(call => call.kind === 'entry').length, 1);
 } finally { h.mounted.destroy(); h.dom.window.close(); }
});
test('phone detail action opens the character picker and hides when selection clears', async () => {
 const h = await harness({ isTouch: true }); try {
  h.select(h.page.querySelectorAll('p')[1].firstChild); h.document.dispatchEvent(new h.window.Event('selectionchange'));
  await until(() => !h.mounted.touchToolbar.hidden);
  [...h.mounted.touchToolbar.querySelectorAll('button')].find(button => button.textContent === 'Add details').click();
  await until(() => h.mounted.dialog.querySelector('select')); h.field('Character or entry').value = 'mara'; await h.submit(); assert.equal(h.calls.find(call => call.kind === 'fact').entryId, 'mara');
  h.mounted.dialog.close(); h.window.getSelection().removeAllRanges(); h.document.dispatchEvent(new h.window.Event('selectionchange'));
  await pause(); assert.equal(h.mounted.touchToolbar.hidden, true);
 } finally { h.mounted.destroy(); h.dom.window.close(); }
});
