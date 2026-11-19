import test from "node:test";
import assert from "node:assert/strict";
import { midpoint, pressureOf, pointerSamples } from "../../../applications/artist/page-ui/studio-pointer.js";

test("midpoint averages two pointer samples", () => {
    assert.deepEqual(midpoint({ x: 0, y: 0 }, { x: 10, y: 4 }), { x: 5, y: 2 });
});

test("mouse pressure is always full", () => {
    assert.equal(pressureOf({ pointerType: "mouse", pressure: 0 }), 1);
});

test("missing pen pressure falls back without treating zero as absent once buttons are down", () => {
    assert.ok(pressureOf({ pointerType: "pen", pressure: undefined }) > 0);
    assert.ok(pressureOf({ pointerType: "pen", pressure: 0, buttons: 1 }) > 0);
    assert.equal(pressureOf({ pointerType: "pen", pressure: 0.42, buttons: 1 }), 0.42);
});

test("touch without pressure still returns a usable value", () => {
    assert.ok(pressureOf({ pointerType: "touch", pressure: 0, buttons: 1 }) > 0);
});

test("pointerSamples falls back to the event when coalesced samples are empty", () => {
    const event = { clientX: 1, clientY: 2, getCoalescedEvents: () => [] };
    assert.equal(pointerSamples(event)[0], event);
});
