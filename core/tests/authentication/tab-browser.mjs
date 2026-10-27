import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = process.env.SUPABASE_BROWSER_BUNDLE;
if (!bundle) throw Error('Set SUPABASE_BROWSER_BUNDLE to the installed supabase-js dist/umd/supabase.js file.');
const users = Object.fromEntries(['primary', 'test', 'third'].map((name, index) => [name, { id: `00000000-0000-0000-0000-00000000000${index + 1}`, email: `${name}@example.test`, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() }]));
const token = user => ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', Buffer.from(JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test-signature'].join('.');
const session = user => ({ access_token: token(user), refresh_token: `refresh-${user.email.split('@')[0]}`, token_type: 'bearer', expires_in: 3600, user });
const loginSource = await readFile(resolve(root, 'applications/main-site/pages/login.html'), 'utf8');
const launchLink = loginSource.match(/<a href="\/login\?separateAccount=1"[^>]*>[^<]*<\/a>/)[0];
const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>Account session test</title><script src="/vendor.js"></script></head><body>
${launchLink}<p id="account"></p><script type="module">
import { supabase } from '/core/authentication/client.js';
import { getTabSessionContext, tabSignOutOptions } from '/core/authentication/tab-session.js';
import { rememberSessionHint, readSessionHint, clearSessionHint } from '/core/authentication/session-hint.js';
import { authRedirectUrl } from '/core/authentication/redirect.js';
window.client = supabase; window.sessionContext = getTabSessionContext(); window.callbackUrl = authRedirectUrl;
window.currentUser = async () => (await supabase.auth.getSession()).data.session?.user?.email || null;
window.signIn = async name => { const {data,error} = await supabase.auth.signInWithPassword({email:name+'@example.test',password:'mock-password'});if(error)throw error;rememberSessionHint(data.user);return data.user.email; };
window.signOut = async () => { const {error} = await supabase.auth.signOut(tabSignOutOptions());if(error)throw error;clearSessionHint(); };
window.hintUser = () => readSessionHint()?.email || null;
await supabase.auth.getSession(); window.ready = true;
</script></body></html>`;
let base;
const server = createServer(async (req, res) => {
    const url = new URL(req.url, base);
    const json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith('/mock-supabase/')) {
        if (url.pathname.endsWith('/token')) {
            let body = ''; for await (const chunk of req) body += chunk;
            const input = JSON.parse(body);
            const name = input.email?.split('@')[0] || input.refresh_token?.replace('refresh-', '');
            if (!users[name]) { res.statusCode = 400; json({ msg: 'Unknown mock account.' }); return; }
            json(session(users[name])); return;
        }
        if (url.pathname.endsWith('/user')) {
            const jwt = req.headers.authorization?.split(' ')[1];
            const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
            json(Object.values(users).find(user => user.id === payload.sub)); return;
        }
        if (url.pathname.endsWith('/logout')) { res.writeHead(204).end(); return; }
        json({ blocked: false }); return;
    }
    if (['/', '/login', '/studio'].includes(url.pathname)) { res.setHeader('Content-Type', 'text/html'); res.end(fixture); return; }
    if (url.pathname === '/vendor.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(bundle)); return; }
    if (url.pathname === '/supabase-shim.js') { res.setHeader('Content-Type', 'text/javascript'); res.end("export const createClient = globalThis.supabase.createClient;"); return; }
    const path = resolve(root, url.pathname.slice(1));
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
        let data = await readFile(path);
        if (url.pathname === '/core/authentication/client.js') data = data.toString().replace('https://esm.sh/@supabase/supabase-js@2', '/supabase-shim.js').replace('https://jrfxgpkpbacajhcwimgz.supabase.co', base + '/mock-supabase');
        res.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript' : 'text/plain'); res.end(data);
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext();
    // No request may leave this disposable test server.
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const open = async path => { const page = await context.newPage(); await page.goto(base + path); await page.waitForFunction(() => window.ready); return page; };
    const who = page => page.evaluate(() => window.currentUser());
    const main = await open('/');
    await main.evaluate(() => window.signIn('primary'));
    const normal = await open('/studio');
    assert.equal(await who(normal), 'primary@example.test');
    const popupPromise = main.waitForEvent('popup');
    await main.locator('a').click();
    const separate = await popupPromise; await separate.waitForFunction(() => window.ready);
    assert.equal(await separate.evaluate(() => window.opener === null), true);
    assert.equal(await who(separate), null);
    assert.equal(await separate.evaluate(() => window.hintUser()), null);
    await separate.evaluate(() => window.signIn('test'));
    const third = await open('/login?separateAccount=1');
    assert.equal(await who(third), null);
    await third.evaluate(() => window.signIn('third'));
    assert.notEqual(await separate.evaluate(() => window.sessionContext.id), await third.evaluate(() => window.sessionContext.id));
    assert.equal(await who(main), 'primary@example.test');
    assert.equal(await who(normal), 'primary@example.test');
    await separate.reload(); await separate.waitForFunction(() => window.ready);
    assert.equal(await who(separate), 'test@example.test');
    await separate.goto(base + '/studio'); await separate.waitForFunction(() => window.ready);
    assert.equal(await who(separate), 'test@example.test');
    assert.equal(await separate.evaluate(() => window.hintUser()), 'test@example.test');
    await separate.evaluate(async () => { const {error} = await window.client.auth.refreshSession();if(error)throw error; });
    assert.equal(await who(main), 'primary@example.test');
    assert.equal(await who(separate), 'test@example.test');
    await separate.evaluate(() => window.signOut());
    assert.equal(await who(separate), null);
    assert.equal(await who(main), 'primary@example.test');
    assert.equal(await who(third), 'third@example.test');
    assert.equal(await main.evaluate(() => window.hintUser()), 'primary@example.test');
    // A confirmation/recovery callback opened in another tab remains isolated.
    const callback = await third.evaluate(() => window.callbackUrl('login'));
    const response = session(users.test);
    const callbackPage = await open('/login?separateAccount=1#' + new URLSearchParams({ access_token: response.access_token, refresh_token: response.refresh_token, expires_in: '3600', token_type: 'bearer', type: 'signup' }));
    assert.match(callback, /separateAccount=1/);
    assert.equal(await who(callbackPage), 'test@example.test');
    assert.equal(await who(main), 'primary@example.test');
    console.log('Separate-account browser checks passed: shared normal tabs, isolated accounts, opener protection, refresh/navigation, token refresh, offline hints, logout, and new-tab auth callbacks.');
} finally { await browser.close(); server.close(); }
