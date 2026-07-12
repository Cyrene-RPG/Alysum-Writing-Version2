/**
 * Salvage Plotweave from corrupted LevelDB text dump.
 * Run: node recovery-audit/salvage-plotweave.mjs
 */
import fs from "fs";

const rawPath = "recovery-audit/plotweave-recovered/raw-map_x3obawu_mrhdr9d1-001065.ldb.txt";
const outPath = "recovery-audit/plotweave-recovered/CYRENE-RPG-RECOVERED.json";
const raw = fs.readFileSync(rawPath, "utf8");

// Focus on the Cyrene map section (before Sample Hero's journey duplicate)
const cyreneEnd = raw.indexOf("Sample: Hero's journe");
const section = cyreneEnd > 0 ? raw.slice(0, cyreneEnd) : raw;

const SHAPE_DEFAULTS = {
    start: { fill: "#14532d", stroke: "#4ade80", w: 140, h: 56 },
    process: { fill: "#1e1b4b", stroke: "#a78bfa", w: 168, h: 72 },
    box: { fill: "#1e293b", stroke: "#cbd5e1", w: 160, h: 72 },
    decision: { fill: "#422006", stroke: "#fbbf24", w: 150, h: 100 },
    end: { fill: "#4c0519", stroke: "#fb7185", w: 140, h: 56 },
    note: { fill: "#1e293b", stroke: "#94a3b8", w: 160, h: 88 },
    data: { fill: "#0c4a6e", stroke: "#38bdf8", w: 156, h: 68 },
};

function inferType(text, fill, stroke) {
    const t = String(text || "").toLowerCase();
    if (t.includes("start") || t.includes("wake up")) return "start";
    if (t.includes("end") || t.includes("alarm blares")) return "end";
    if (t.includes("decision") || t.includes("?") || t.includes("check to")) return "decision";
    if (t.includes("note") || t.includes("dc raw") || t.includes("consequence")) return "note";
    if (fill === "#312e81" || fill === "#14532d") return "process";
    if (stroke === "#fbbf24" || fill === "#422006") return "decision";
    if (stroke === "#4ade80" || fill === "#14532d") return "start";
    if (stroke === "#fb7185" || fill === "#4c0519") return "end";
    if (stroke === "#94a3b8") return "note";
    if (stroke === "#38bdf8" || fill === "#0c4a6e") return "data";
    return "box";
}

/** Extract node blobs from corrupted JSON fragments */
function extractNodes(text) {
    const nodes = [];
    const blobRe =
        /x":\s*(-?\d+(?:\.\d+)?)[^y]{0,12}y":\s*(-?\d+(?:\.\d+)?)[\s\S]{0,400}?(?:ex\s+|text":\s*")([^"$\n]{8,400}?)(?:A\s*\$?ype|"\s*,\s*"(?:box|process|decision|start|end|note|data)|type":\s*"(start|process|box|decision|end|note|data))/gi;

    let m;
    let i = 0;
    while ((m = blobRe.exec(text))) {
        const x = Number(m[1]);
        const y = Number(m[2]);
        let nodeText = m[3]
            .replace(/\s{2,}/g, " ")
            .replace(/@\s*/g, "")
            .replace(/<\s*/g, "")
            .replace(/\s*:\s*/g, " ")
            .trim();
        const hintedType = m[4];
        const fillMatch = m[0].match(/#([0-9a-fA-F]{6})/g) || [];
        const fill = fillMatch[0] ? `#${fillMatch[0].slice(-6)}` : "#1e293b";
        const stroke = fillMatch[1] ? `#${fillMatch[1].slice(-6)}` : "#cbd5e1";
        const type = hintedType || inferType(nodeText, fill, stroke);
        const def = SHAPE_DEFAULTS[type] || SHAPE_DEFAULTS.box;
        nodes.push({
            id: `n_recovered_${i++}`,
            type,
            x,
            y,
            text: nodeText,
            fill: fill.startsWith("#") ? fill : def.fill,
            stroke: stroke.startsWith("#") ? stroke : def.stroke,
            w: def.w,
            h: def.h,
        });
    }

    // Fallback: known text anchors if regex missed them
    const known = [
        ["Wake up in suspended animation tank", "start", -61, 160],
        ["Realize you are trapped, feel oxygen mask over your face and that home unknown liquid.", "box", 148, -86],
        ["Attempt strength based check to try and break the glass.", "decision", 54, -77],
        ["Wisdom check — see if you can remember who you are", "decision", 337, 460],
        ["Dex. Try to move / pull off", "decision", -46, -196],
        ["DC Raw 16 CE (for passing)", "note", 661, 879],
        ["Success (16-20)\n\nTank cracks under your force — blow it open", "process", 1056, 422],
        ["Fail (6-15) vibrates but doesn't give", "note", 71, 55],
        ["Crit (1-5) A low alarm blares from outside", "end", 8176, 463],
        ["Memory — you grasp it then it slips away in fog", "note", 873, 152],
        ["Your name (allow player to pick character now, carry into creator)", "note", 47, 251],
        ["10-18 strain — recall anything about self", "decision", 82, 504],
        ["A sharp pain, stab in head like red hot spike driven into skull", "note", 691, 480],
        ["Manage IV ache — free.", "process", 360, -879],
        ["Dex check to escape", "decision", 64, 90],
        ["Consequence: Must make DC 15 constitution save with disadvantage or lungs flood", "note", 879, 487],
    ];

    if (nodes.length < 8) {
        return known.map(([text, type, x, y], idx) => {
            const def = SHAPE_DEFAULTS[type] || SHAPE_DEFAULTS.box;
            return {
                id: `n_recovered_${idx}`,
                type,
                x,
                y,
                text,
                fill: def.fill,
                stroke: def.stroke,
                w: def.w,
                h: def.h,
            };
        });
    }

    return nodes;
}

function extractEdges(text, nodes) {
    const edges = [];
    const idPairs = [...text.matchAll(/from\s*([a-z0-9_]+)[^t]{0,20}to[^"]*"?([a-z0-9_]+)/gi)];
    const labels = [...text.matchAll(/label":\s*"([^"]*)"/g)].map((m) => m[1].trim());

    if (idPairs.length >= 3) {
        idPairs.forEach(([_, from, to], i) => {
            edges.push({
                id: `e_recovered_${i}`,
                from: from.replace(/\s/g, ""),
                to: to.replace(/\s/g, ""),
                fromPort: "right",
                toPort: "left",
                label: labels[i] || "",
            });
        });
        return edges;
    }

    // Reconnect recovered nodes in narrative order when ids were lost
    for (let i = 0; i < nodes.length - 1; i++) {
        const label =
            nodes[i].text.includes("?") && nodes[i + 1].text.toLowerCase().includes("success")
                ? "Yes"
                : nodes[i].text.includes("?") && nodes[i + 1].text.toLowerCase().includes("fail")
                  ? "No"
                  : "";
        edges.push({
            id: `e_recovered_${i}`,
            from: nodes[i].id,
            to: nodes[i + 1].id,
            fromPort: label === "No" ? "bottom" : "right",
            toPort: "left",
            label,
        });
    }
    return edges;
}

const nodes = extractNodes(section);
const edges = extractEdges(section, nodes);

const store = {
    activeId: "map_x3obawu_mrhdr9d1",
    diagrams: [
        {
            id: "map_x3obawu_mrhdr9d1",
            title: "Cyrene RPG Storyline camera",
            createdAt: 1783883850290,
            updatedAt: 1783888548481,
            nodes,
            edges,
            camera: { x: 390.23, y: 330.835, zoom: 0.695 },
        },
    ],
};

fs.writeFileSync(outPath, JSON.stringify(store, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`${nodes.length} nodes, ${edges.length} edges`);
nodes.forEach((n) => console.log(`  - [${n.type}] ${n.text.slice(0, 70)}`));
