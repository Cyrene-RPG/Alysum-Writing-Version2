/** UI integration against actual browser modules in an isolated DOM. External jsdom only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.JSDOM_MODULE || 'jsdom');
const root = new URL('../../../', import.meta.url);
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
async function until(check) { for (let n = 0; n < 50; n++) { if (check()) return; await pause(); } throw new Error('UI did not reach expected state'); }
test('fresh workspace creates, saves, links, restores, archives and customizes profiles without cloud access', async () => {
 const html = await fs.readFile(new URL('applications/encyclopedia/pages/story-bible.html', root), 'utf8');
 const dom = new JSDOM(html, { url: 'https://alysum.test/story-bible?preview=1', pretendToBeVisual: true });
 const { window } = dom, { document } = window;
 window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
 window.HTMLDialogElement.prototype.close = function() { this.open = false; };
 const errors = [];
 const context = vm.createContext({ document, window, location: window.location, localStorage: window.localStorage, URL, URLSearchParams, crypto: webcrypto, structuredClone, setTimeout, clearTimeout, queueMicrotask, console: { ...console, error: error => errors.push(String(error)) } });
 const modules = new Map();
 async function load(path) {
  const url = new URL(path.startsWith('/') ? path.slice(1) : path, root);
  if (modules.has(url.href)) return modules.get(url.href);
  const source = await fs.readFile(url, 'utf8');
  const module = new vm.SourceTextModule(source, { context, identifier: url.href, importModuleDynamically: async (specifier, reference) => {
   const target = specifier.startsWith('/') ? specifier : new URL(specifier, reference.identifier).pathname.slice(root.pathname.length);
   const child = await load(target); if(child.status === 'linked') await child.evaluate(); return child;
  } });
  modules.set(url.href, module);
  await module.link(async (specifier, reference) => load(specifier.startsWith('/') ? specifier : new URL(specifier, reference.identifier).pathname.slice(root.pathname.length)));
  return module;
 }
 const module = await load('applications/encyclopedia/page-ui/workspace.js'); await module.evaluate();
 const findButton = text => [...document.querySelectorAll('button')].find(button => button.textContent === text);
 const click = async text => { const button = findButton(text); assert.ok(button, `Missing button: ${text}`); button.click(); await pause(); };
 const fill = (label, value) => { const control = [...document.querySelectorAll('label')].find(item => item.firstChild?.textContent === label)?.querySelector('input,textarea,select'); assert.ok(control, `Missing field: ${label}`); control.value = value; control.dispatchEvent(new window.Event('input', { bubbles: true })); return control; };
 const submitDialog = async () => { document.getElementById('dialog-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await pause(); assert.equal(document.getElementById('dialog-error').textContent, ''); };
 const saveClose = async () => { document.querySelector('.bible-edit-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await until(() => !document.querySelector('.bible-edit-form')); };
 await until(() => document.querySelectorAll('.bible-card').length === 4);
 [...document.querySelectorAll('.bible-card')].find(card => card.textContent.includes('Mara Vey')).click(); await pause(); assert.match(document.querySelector('#profile').textContent, /Mara Vey/);
 await click('Edit profile'); fill('Name', 'Mara Renamed'); fill('Personality', '<script>malicious()</script>');
 await saveClose(); assert.equal(document.querySelector('#profile h2').textContent, 'Mara Renamed'); assert.match(document.querySelector('#profile').textContent, /<script>malicious\(\)<\/script>/); assert.equal(document.querySelector('#profile script'), null);
 await click('Version history'); assert.match(document.getElementById('dialog-body').textContent, /Version 1/); await click('×');
 await click('＋ New entry'); fill('Name', 'New character'); await submitDialog(); await until(() => document.querySelector('.bible-edit-form'));
 fill('Occupation', 'Shipwright'); await saveClose(); assert.equal(document.querySelector('#profile h2').textContent, 'New character');
 await click('＋ Relationship'); fill('Other entry', '00000000-0000-4000-8000-000000000101'); fill('New character is…', 'friend of'); await submitDialog(); assert.match(document.getElementById('profile').textContent, /friend of/);
 await click('＋ Add fact'); fill('Category', 'History'); fill('Fact', 'Built a ship.'); await submitDialog(); assert.match(document.getElementById('profile').textContent, /Built a ship/);
 await click('Archive entry'); assert.ok(findButton('Restore entry')); await click('Restore entry'); assert.ok(findButton('Archive entry'));
 await click('＋ New category'); fill('Category name', 'Dragon'); await click('＋ Add field'); document.querySelector('#dialog-body input[placeholder="Label"]').value = 'Wing span'; await submitDialog(); assert.match(document.getElementById('categories').textContent, /Dragon/);
 assert.equal(errors.length, 0); assert.ok(!document.getElementById('status').classList.contains('is-error'), document.getElementById('status').textContent);
 dom.window.close();
});
