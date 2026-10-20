import test from "node:test";
import assert from "node:assert/strict";
import { fetchFollowState, setFollowing } from "../../library/author-follow.js";

// Models the migration's INSERT/DELETE-only permissions and a shared cloud store.
function createClient(rows = new Set(), options = {}) {
    const calls = [];
    return {
        calls,
        from(table) {
            assert.equal(table, "author_follows");
            let operation = "select";
            let payload;
            let conflict;
            let head = false;
            const filters = {};
            const query = {
                select(columns, settings) { head = Boolean(settings?.head); return query; },
                eq(key, value) { filters[key] = value; return query; },
                maybeSingle() { return query; },
                upsert(value, settings) { operation = "insert"; payload = value; conflict = settings; return query; },
                delete() { operation = "delete"; return query; },
                then(resolve, reject) {
                    return Promise.resolve().then(() => {
                        calls.push({ operation, filters: { ...filters } });
                        if (options.error) return { error: options.error };
                        if (operation === "insert") {
                            if (!conflict?.ignoreDuplicates) {
                                return { error: { message: "permission denied: UPDATE is not granted", code: "42501" } };
                            }
                            if (!options.ignoreWrites) rows.add(payload.follower_id + ":" + payload.author_id);
                            return { error: null };
                        }
                        const matches = [...rows].filter(key => {
                            const [follower, author] = key.split(":");
                            return (!filters.follower_id || follower === filters.follower_id)
                                && (!filters.author_id || author === filters.author_id);
                        });
                        if (operation === "delete") {
                            if (!options.ignoreWrites) matches.forEach(key => rows.delete(key));
                            return { error: null };
                        }
                        return head
                            ? { count: matches.length, error: null }
                            : { data: matches.length ? { follower_id: matches[0].split(":")[0] } : null, error: null };
                    }).then(resolve, reject);
                },
            };
            return query;
        },
    };
}
const following = { authorId: "author", viewerId: "reader", follow: true };

test("follow persists for another device and repeated follows need no UPDATE permission", async () => {
    const rows = new Set(["other:author"]);
    const firstDevice = createClient(rows);
    assert.deepEqual(await setFollowing(firstDevice, following), { count: 2, following: true, localOnly: false });
    assert.equal((await setFollowing(firstDevice, following)).count, 2);
    const anotherDevice = createClient(rows);
    assert.equal((await fetchFollowState(anotherDevice, following)).following, true);
    await setFollowing(anotherDevice, { ...following, follow: false });
    assert.deepEqual([...rows], ["other:author"]);
    assert.equal((await fetchFollowState(firstDevice, following)).following, false);
    assert.equal((await setFollowing(firstDevice, { ...following, follow: false })).count, 1);
});

test("missing table and disconnected client never report local success", async () => {
    const missing = createClient(new Set(), { error: { message: "Could not find public.author_follows in the schema cache" } });
    await assert.rejects(setFollowing(missing, following), /temporarily unavailable/);
    await assert.rejects(fetchFollowState(missing, following), /temporarily unavailable/);
    await assert.rejects(setFollowing(null, following), /Could not connect/);
    await assert.rejects(fetchFollowState(null, following), /Could not connect/);
});

test("permission failures and writes that did not take effect cannot report success", async () => {
    const denied = { message: "permission denied", code: "42501" };
    await assert.rejects(setFollowing(createClient(new Set(), { error: denied }), following), error => error === denied);
    await assert.rejects(setFollowing(createClient(new Set(), { ignoreWrites: true }), following), /Could not confirm/);
    await assert.rejects(setFollowing(createClient(new Set(["reader:author"]), { ignoreWrites: true }), { ...following, follow: false }), /Could not confirm/);
});

test("signed-out and self-follow attempts never reach the database", async () => {
    const client = createClient();
    await assert.rejects(setFollowing(client, { ...following, viewerId: "" }), /Sign in/);
    await assert.rejects(setFollowing(client, { ...following, viewerId: "author" }), /yourself/);
    assert.equal(client.calls.length, 0);
});
