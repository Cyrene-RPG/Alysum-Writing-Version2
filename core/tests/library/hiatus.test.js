import test from 'node:test';
import assert from 'node:assert/strict';
import { getBookHiatus, setBookHiatus, hiatusNotice } from '../../library/hiatus.js';
import { resolveNotificationDestination } from '../../notifications/client.js';

test('status uses trusted RPCs, preserves server time and fails visibly', async () => {
    const calls = [];
    const client = { async rpc(name, args) {
        calls.push({ name, args });
        return { data: { isOnHiatus: true, canManage: false, lastAuthorUpdate: '2026-09-01T14:35:00Z' } };
    } };
    const status = await getBookHiatus(client, 'book');
    assert.equal(status.lastAuthorUpdate, '2026-09-01T14:35:00Z');
    assert.match(hiatusNotice(status), /This book is on hiatus\. Last updated by the author:/);
    await setBookHiatus(client, 'book', true);
    assert.deepEqual(calls[1], { name: 'set_book_hiatus', args: { p_book_id: 'book', p_on_hiatus: true } });
    await assert.rejects(setBookHiatus(client, 'book', 'true'), /Choose/);
    await assert.rejects(getBookHiatus({ rpc: async () => ({ data: null }) }, 'gone'), /not available/);
    await assert.rejects(getBookHiatus({ rpc: async () => ({ error: { message: 'network' } }) }, 'book'), /Could not check/);
    assert.match(hiatusNotice({ lastAuthorUpdate: null }), /Date unavailable/);
});
test('inactivity reminders resolve the authenticated recipient’s book', async () => {
    const calls = [];
    const client = { async rpc(name, args) { calls.push({ name, args }); return { data: [{ book_id: 'book & title' }] }; } };
    assert.equal(await resolveNotificationDestination(client, { id: '12', kind: 'book_inactivity', bookId: 'untrusted' }), '/book?id=book%20%26%20title');
    assert.deepEqual(calls, [{ name: 'get_book_inactivity_notification_target', args: { p_notification_id: '12' } }]);
    await assert.rejects(resolveNotificationDestination({ rpc: async () => ({ data: [] }) }, { id: '12', kind: 'book_inactivity' }), /no longer available/);
});
