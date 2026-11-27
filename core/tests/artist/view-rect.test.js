import test from "node:test";
import assert from "node:assert/strict";
import { createViewRectCache } from "../../../applications/artist/page-ui/studio-pointer.js";

test("view rect maps client coordinates through CSS scale into painter space", () => {
    const element = {
        getBoundingClientRect() {
            return { left: 100, top: 50, width: 200, height: 100 };
        },
    };
    const cache = createViewRectCache(element);
    cache.sync();
    const local = cache.localPoint({ clientX: 150, clientY: 75 }, 400, 200);
    assert.equal(local.x, 100);
    assert.equal(local.y, 50);
});

test("cached rect avoids repeated layout until invalidated", () => {
    let reads = 0;
    const element = {
        getBoundingClientRect() {
            reads += 1;
            return { left: 0, top: 0, width: 10, height: 10 };
        },
    };
    const cache = createViewRectCache(element);
    cache.localPoint({ clientX: 1, clientY: 1 }, 10, 10);
    cache.localPoint({ clientX: 2, clientY: 2 }, 10, 10);
    assert.equal(reads, 1);
    cache.invalidate();
    cache.localPoint({ clientX: 3, clientY: 3 }, 10, 10);
    assert.equal(reads, 2);
});
