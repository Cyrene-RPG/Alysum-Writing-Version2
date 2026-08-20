/**
 * Fill statistics-spec.html from awards.js / level tables so print matches code.
 */
import { AWARDS } from "@alysum/statistics/awards.js";
import { XP_THRESHOLDS, metalForLevel, bandStepForLevel } from "@alysum/statistics/xp-levels.js";
import { WORKED_EXAMPLES, evaluateSentence } from "@alysum/statistics/eligibility.js";

function row(cells) {
    return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
}

function fill(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function awardsRows() {
    return Object.keys(AWARDS).map((key) => {
        const v = AWARDS[key];
        return row([`<code>${key}</code>`, v == null ? "null (off)" : String(v)]);
    }).join("");
}

function xpRows() {
    const lines = [];
    for (let n = 1; n <= 30; n += 1) {
        lines.push(row([
            String(n),
            String(XP_THRESHOLDS[n]),
            `${metalForLevel(n)} ${bandStepForLevel(n)}`
        ]));
    }
    return lines.join("");
}

function repRows() {
    const lines = [];
    for (let n = 1; n <= 50; n += 1) {
        lines.push(row([
            String(n),
            String(REP_THRESHOLDS[n]),
            gemColorForLevel(n),
            String(gemCutStep(n))
        ]));
    }
    return lines.join("");
}

fill("awardsBody", awardsRows());
fill("xpBody", xpRows());
fill("repBody", repRows());
fill("eligibilityBody", WORKED_EXAMPLES.map((ex) => {
    const got = evaluateSentence({ text: ex.text, isDialogue: ex.isDialogue });
    return row([
        ex.text,
        ex.expect,
        `${got.verdict} (L${got.layer || "—"})`,
        ex.why
    ]);
}).join(""));
