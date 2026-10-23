/** Account header regression checks; run with JSDOM_MODULE and --experimental-vm-modules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)(process.env.JSDOM_MODULE || 'jsdom');
const root = new URL('../../../', import.meta.url);
const html = await fs.readFile(new URL('applications/encyclopedia/pages/story-bible.html', root), 'utf8');

test('Bible import map resolves the actual roadmap module used by the account menu', async () => {
 const dom = new JSDOM(html);
 try {
  const imports = JSON.parse(dom.window.document.querySelector('script[type="importmap"]').textContent).imports;
  const context = vm.createContext({ URL, URLSearchParams });
  const module = new vm.SourceTextModule(await fs.readFile(new URL('core/authentication/open-roadmap.js', root), 'utf8'), { context });
  await module.link(async specifier => {
   const prefix = Object.keys(imports).find(prefix => specifier.startsWith(prefix));
   assert.ok(prefix, `Unmapped browser module: ${specifier}`);
   const resolved = imports[prefix] + specifier.slice(prefix.length);
   assert.equal(resolved, '/core/authentication/client.js');
   return new vm.SyntheticModule(['supabase'], function() { this.setExport('supabase', {}); }, { context });
  });
  await module.evaluate();
 } finally { dom.window.close(); }
});

test('signed-in account photo and logout load even when optional header tools fail', async () => {
 const dom = new JSDOM(html, { url: 'https://alysum.test/story-bible?book=book-1' });
 const { document, Event } = dom.window;
 let refreshProfile;
 const context = vm.createContext({ document, window: dom.window, console: { warn() {} } });
 const modules = new Map();
 const mocks = {
  '/core/authentication/client.js': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'writer-1' } } } }) } } },
  '/core/account/workspace-profile.js': {
   peekWorkspaceProfile: session => { assert.equal(session.user.id, 'writer-1'); return { name: 'Cyrene', imageUrl: 'https://alysum.test/cached-avatar.jpg' }; },
   loadWorkspaceProfile: async (_client, session) => { assert.equal(session.user.id, 'writer-1'); return new Promise(resolve => { refreshProfile = resolve; }); },
  },
  '/core/authentication/logout.js': { signOutAndGoToHome: async () => ({ ok: true }) },
 };
 const module = new vm.SourceTextModule(await fs.readFile(new URL('applications/encyclopedia/page-ui/shell.js', root), 'utf8'), { context,
  importModuleDynamically: async specifier => {
   if (!mocks[specifier]) throw new Error('Optional service unavailable');
   if (!modules.has(specifier)) {
    const mock = mocks[specifier];
    const child = new vm.SyntheticModule(Object.keys(mock), function() { for (const [name, value] of Object.entries(mock)) this.setExport(name, value); }, { context });
    await child.link(() => {}); await child.evaluate(); modules.set(specifier, child);
   }
   return modules.get(specifier);
  },
 });
 try {
  await module.link(() => {}); await module.evaluate(); await module.namespace.mountBibleShell();
  const image = document.getElementById('welcomePfpImg'), initial = document.getElementById('welcomePfpInitial');
  assert.equal(image.src, 'https://alysum.test/cached-avatar.jpg'); assert.equal(image.hidden, false);
  assert.equal(initial.classList.contains('is-hidden'), true);
  assert.equal(document.getElementById('bible-logout').hidden, false);
  refreshProfile({ name: 'Cyrene', imageUrl: 'https://alysum.test/current-avatar.jpg' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(image.src, 'https://alysum.test/current-avatar.jpg');
  image.dispatchEvent(new Event('error'));
  assert.equal(image.hidden, true); assert.equal(image.style.display, 'none');
  assert.equal(initial.classList.contains('is-hidden'), false); assert.equal(initial.textContent, 'C');
 } finally { dom.window.close(); }
});
