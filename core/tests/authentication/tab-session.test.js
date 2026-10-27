import test from 'node:test';
import assert from 'node:assert/strict';
import { createTabSessionContext, authStorageOptions, tabSignOutOptions, TAB_SESSION_ID_KEY } from '../../authentication/tab-session.js';
const storage = () => {
    const data = new Map();
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
};
function browser(shared = storage(), session = storage(), href = 'https://example.test/login', id = 'tab-one') {
    return { localStorage: shared, sessionStorage: session, location: { href }, crypto: { randomUUID: () => id } };
}
test('normal tabs keep the existing shared login key and storage', () => {
    const shared = storage();
    for (const b of [browser(shared), browser(shared)]) {
        const context = createTabSessionContext(b);
        assert.equal(context.isSeparateTab, false);
        assert.deepEqual(authStorageOptions('project', context), { storage: shared, storageKey: 'sb-project-auth-token' });
        assert.equal(tabSignOutOptions(context), undefined);
    }
});
test('separate tabs have independent auth channels, tokens and logout scopes', () => {
    const shared = storage();
    const a = createTabSessionContext(browser(shared));
    const b = createTabSessionContext(browser(shared, storage(), 'https://example.test/login?separateAccount=1', 'b'));
    const c = createTabSessionContext(browser(shared, storage(), 'https://example.test/login?separateAccount=1', 'c'));
    const options = [a, b, c].map(context => authStorageOptions('project', context));
    assert.equal(new Set(options.map(o => o.storageKey)).size, 3);
    options.forEach((o, i) => o.storage.setItem(o.storageKey, 'account-' + i));
    options[1].storage.removeItem(options[1].storageKey);
    assert.equal(options[0].storage.getItem(options[0].storageKey), 'account-0');
    assert.equal(options[2].storage.getItem(options[2].storageKey), 'account-2');
    assert.deepEqual(tabSignOutOptions(b), { scope: 'local' });
    assert.equal(shared.getItem(TAB_SESSION_ID_KEY), null);
});
test('navigation, refresh and OAuth returns reuse the same separate session', () => {
    const b = browser(storage(), storage(), 'https://example.test/login?separateAccount=1');
    const first = createTabSessionContext(b);
    const options = authStorageOptions('project', first);
    options.storage.setItem(options.storageKey, 'test-account');
    b.location.href = 'https://example.test/studio';
    const next = createTabSessionContext(b);
    assert.equal(next.id, first.id);
    assert.equal(authStorageOptions('project', next).storage.getItem(options.storageKey), 'test-account');
    b.location.href = 'https://example.test/login#access_token=callback';
    assert.equal(createTabSessionContext(b).id, first.id);
});
test('blocked session storage fails closed instead of opening the shared account', () => {
    for (const href of ['https://example.test/login?separateAccount=1', 'https://example.test/studio']) {
        const b = browser(storage(), { getItem() { throw Error('blocked'); } }, href);
        assert.throws(() => createTabSessionContext(b), /Allow site storage/);
    }
    assert.deepEqual(createTabSessionContext(undefined), { isSeparateTab: false, storage: undefined, id: '' });
});
