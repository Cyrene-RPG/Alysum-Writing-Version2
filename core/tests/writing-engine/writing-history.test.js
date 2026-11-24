import test from "node:test";
import assert from "node:assert/strict";
import { writingHistory } from "../../writing-engine/writing-history.js";

const added = { "2024-12-31": 75, "2025-01-02": 20, "2025-01-05": 3, "2025-01-08": 999 };
const removed = { "2025-01-03": 25 };
const report = (period, limit = 14) => writingHistory(added, removed, period, limit, "2025-01-06");

test("days include inactive dates, skip future activity and page back to the first record", () => {
    assert.deepEqual(report("day", 2), { rows: [
        { start: "2025-01-06", words: 0 }, { start: "2025-01-05", words: 3 }
    ], hasEarlier: true });
    assert.equal(report("day").rows.length, 7);
    assert.equal(report("day").hasEarlier, false);
});

test("Sunday weeks can cross years and subtract deletion-only days before clamping", () => {
    assert.deepEqual(report("week").rows, [
        { start: "2025-01-05", words: 3 }, { start: "2024-12-29", words: 70 }
    ]);
});

test("months and years use calendar boundaries and clamp negative totals", () => {
    for (const period of ["month", "year"]) assert.deepEqual(report(period).rows.map(row => row.words), [0, 75]);
});

test("empty accounts have no history", () => {
    assert.deepEqual(writingHistory({}, {}, "day", 14), { rows: [], hasEarlier: false });
});
