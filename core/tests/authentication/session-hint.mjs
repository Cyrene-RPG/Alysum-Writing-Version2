import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const storage = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) }; };
async function hint(browser) {
    const context = vm.createContext({ window: browser, URL });
    const dependency = new vm.SourceTextModule(await readFile(new URL('../../authentication/tab-session.js', import.meta.url), 'utf8'), { context });
    await dependency.link(() => {});
    const mod = new vm.SourceTextModule(await readFile(new URL('../../authentication/session-hint.js', import.meta.url), 'utf8'), { context });
    await mod.link(() => dependency); await mod.evaluate(); return mod.namespace;
}
test('separate-account offline hints cannot replace or read the main account hint', async () => {
    const shared = storage(), separate = storage();
    const main = await hint({ localStorage: shared, sessionStorage: storage(), location: { href: 'https://example.test/studio' } });
    const makeTest = () => hint({ localStorage: shared, sessionStorage: separate, location: { href: 'https://example.test/login?separateAccount=1' }, crypto: { randomUUID: () => 'test-tab' } });
    main.rememberSessionHint({ id: 'main', email: 'main@example.test' });
    const second = await makeTest();
    assert.equal(second.readSessionHint(), null);
    second.rememberSessionHint({ id: 'test', email: 'test@example.test' });
    assert.equal(main.readSessionHint().id, 'main');
    assert.equal(second.readSessionHint().id, 'test');
    const reload = await makeTest();
    assert.equal(reload.readSessionHint().id, 'test');
    reload.clearSessionHint();
    assert.equal(main.readSessionHint().id, 'main');
    assert.equal(reload.readSessionHint(), null);
});
