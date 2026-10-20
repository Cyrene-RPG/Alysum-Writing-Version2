import test from "node:test";
import assert from "node:assert/strict";
import { renderNotification } from "../../../applications/notifications/page-ui/render.js";
test("notification messages render as text and actions retain the exact notification", () => {
    class Element {
        constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.dataset = {}; this.attributes = {}; }
        append(...children) { this.children.push(...children); }
        setAttribute(key, value) { this.attributes[key] = value; }
        addEventListener(name, handler) { this.events[name] = handler; }
    }
    const previous = globalThis.document;
    globalThis.document = { createElement: tag => new Element(tag) };
    try {
        const item = { id: "12", kind: "follower", title: "<img onerror=bad>", message: "<script>bad</script>", createdAt: "2026-10-20T12:00:00Z", readAt: null };
        const actions = [];
        const rendered = renderNotification(item, { onOpen: row => actions.push(row), onToggle: row => actions.push(row) });
        const all = [];
        const visit = el => { all.push(el); el.children.forEach(visit); };
        visit(rendered);
        assert.ok(!all.some(el => ["script", "img", "a"].includes(el.tag)));
        assert.ok(all.some(el => el.textContent === "<script>bad</script>"));
        for (const button of all.filter(el => el.tag === "button")) button.events.click();
        assert.deepEqual(actions, [item, item]);
        assert.equal(rendered.dataset.notificationId, "12");
    } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
    }
});
