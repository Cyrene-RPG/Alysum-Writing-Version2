import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
async function redirect(separate) {
    const values = new Map();
    const location = new URL('https://www.alysumwriting.com/login' + (separate ? '?separateAccount=1' : ''));
    const window = { location, crypto: { randomUUID: () => 'private-tab-id' }, sessionStorage: { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)) }, localStorage: {} };
    const context = vm.createContext({ window, location, URL });
    const dependency = new vm.SourceTextModule(await readFile(new URL('../../authentication/tab-session.js', import.meta.url), 'utf8'), { context });
    await dependency.link(() => {});
    const mod = new vm.SourceTextModule(await readFile(new URL('../../authentication/redirect.js', import.meta.url), 'utf8'), { context });
    await mod.link(() => dependency); await mod.evaluate(); return mod.namespace;
}
test('OAuth and email links preserve isolation without leaking tab IDs or tokens', async () => {
    const isolated = await redirect(true);
    for (const path of ['login.html', 'signup.html', 'reset-password.html', 'settings.html']) {
        const url = new URL(isolated.authRedirectUrl(path));
        assert.equal(url.searchParams.get('separateAccount'), '1');
        assert.equal(url.href.includes('private-tab-id'), false);
        assert.equal(url.origin, 'https://www.alysumwriting.com');
    }
    assert.match(isolated.buildOAuthSignInOptions('login.html', 'google').redirectTo, /separateAccount=1/);
    assert.equal((await redirect(false)).authRedirectUrl('login.html'), 'https://www.alysumwriting.com/login.html');
});
