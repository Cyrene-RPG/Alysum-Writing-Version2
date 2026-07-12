/**
 * Plotweave map templates — starter diagrams users can pick when creating a map.
 */

/** @typedef {{ key: string, type: string, x: number, y: number, text: string }} TemplateNode */
/** @typedef {{ from: string, to: string, fromPort?: string, toPort?: string, label?: string }} TemplateEdge */
/** @typedef {{ title: string, description: string, category: string, nodes: TemplateNode[], edges: TemplateEdge[] }} TemplateSpec */

/** @type {Record<string, TemplateSpec>} */
const SPECS = {
    blank: {
        title: "Blank map",
        description: "Empty canvas — build your own flow from scratch.",
        category: "Basic",
        nodes: [],
        edges: [],
    },
    "full-story": {
        title: "Full story plot",
        description: "Novel-scale arc from opening hook through climax to resolution.",
        category: "Story",
        nodes: [
            { key: "s", type: "start", x: 48, y: 168, text: "Opening hook" },
            { key: "a1", type: "process", x: 240, y: 156, text: "Act I — Setup" },
            { key: "a2", type: "process", x: 432, y: 156, text: "Inciting incident" },
            { key: "a3", type: "process", x: 624, y: 156, text: "Rising action" },
            { key: "mid", type: "decision", x: 816, y: 140, text: "Midpoint shift?" },
            { key: "a4", type: "process", x: 1008, y: 156, text: "Escalation" },
            { key: "a5", type: "process", x: 1200, y: 156, text: "All is lost" },
            { key: "cli", type: "process", x: 1392, y: 156, text: "Climax" },
            { key: "res", type: "process", x: 1584, y: 156, text: "Resolution" },
            { key: "e", type: "end", x: 1776, y: 168, text: "Story end" },
            { key: "note", type: "note", x: 816, y: 24, text: "Theme / subplot notes" },
        ],
        edges: [
            { from: "s", to: "a1" },
            { from: "a1", to: "a2" },
            { from: "a2", to: "a3" },
            { from: "a3", to: "mid" },
            { from: "mid", to: "a4", label: "Yes" },
            { from: "a4", to: "a5" },
            { from: "a5", to: "cli" },
            { from: "cli", to: "res" },
            { from: "res", to: "e" },
        ],
    },
    "three-act": {
        title: "Three-act structure",
        description: "Classic setup, confrontation, and resolution with plot points.",
        category: "Story",
        nodes: [
            { key: "s", type: "start", x: 48, y: 180, text: "Establish stakes" },
            { key: "act1", type: "process", x: 240, y: 168, text: "Act I — Setup" },
            { key: "pp1", type: "data", x: 432, y: 168, text: "Plot point I" },
            { key: "act2", type: "process", x: 624, y: 168, text: "Act II — Confrontation" },
            { key: "mid", type: "decision", x: 816, y: 152, text: "Midpoint reversal?" },
            { key: "pp2", type: "data", x: 1008, y: 168, text: "Plot point II" },
            { key: "act3", type: "process", x: 1200, y: 168, text: "Act III — Resolution" },
            { key: "e", type: "end", x: 1392, y: 180, text: "Final image" },
        ],
        edges: [
            { from: "s", to: "act1" },
            { from: "act1", to: "pp1" },
            { from: "pp1", to: "act2" },
            { from: "act2", to: "mid" },
            { from: "mid", to: "pp2", label: "Yes" },
            { from: "pp2", to: "act3" },
            { from: "act3", to: "e" },
        ],
    },
    chapter: {
        title: "Chapter plot",
        description: "Beat sheet for one chapter — hook, conflict, turn, and landing.",
        category: "Chapter",
        nodes: [
            { key: "s", type: "start", x: 48, y: 180, text: "Chapter hook" },
            { key: "goal", type: "process", x: 264, y: 168, text: "Scene goal" },
            { key: "conf", type: "process", x: 480, y: 168, text: "Conflict / obstacle" },
            { key: "turn", type: "decision", x: 696, y: 152, text: "Plan succeeds?" },
            { key: "comp", type: "process", x: 912, y: 72, text: "Complication" },
            { key: "rev", type: "process", x: 912, y: 264, text: "Beat reversal" },
            { key: "rev2", type: "data", x: 1128, y: 168, text: "Reveal / clue" },
            { key: "e", type: "end", x: 1344, y: 180, text: "Chapter end" },
        ],
        edges: [
            { from: "s", to: "goal" },
            { from: "goal", to: "conf" },
            { from: "conf", to: "turn" },
            { from: "turn", to: "comp", label: "No" },
            { from: "turn", to: "rev", label: "Yes" },
            { from: "comp", to: "rev2" },
            { from: "rev", to: "rev2" },
            { from: "rev2", to: "e" },
        ],
    },
    scene: {
        title: "Single scene",
        description: "One scene from entry to exit — goal, action, reaction, outcome.",
        category: "Scene",
        nodes: [
            { key: "s", type: "start", x: 120, y: 48, text: "Scene entry" },
            { key: "goal", type: "process", x: 120, y: 168, text: "Character goal" },
            { key: "action", type: "process", x: 120, y: 288, text: "Action / dialogue" },
            { key: "react", type: "process", x: 120, y: 408, text: "Reaction" },
            { key: "out", type: "decision", x: 120, y: 528, text: "Outcome?" },
            { key: "win", type: "box", x: 360, y: 480, text: "Partial win" },
            { key: "lose", type: "box", x: 360, y: 600, text: "Setback" },
            { key: "e", type: "end", x: 120, y: 672, text: "Scene exit" },
        ],
        edges: [
            { from: "s", to: "goal", fromPort: "s", toPort: "n" },
            { from: "goal", to: "action", fromPort: "s", toPort: "n" },
            { from: "action", to: "react", fromPort: "s", toPort: "n" },
            { from: "react", to: "out", fromPort: "s", toPort: "n" },
            { from: "out", to: "win", fromPort: "e", toPort: "w", label: "Yes" },
            { from: "out", to: "lose", fromPort: "e", toPort: "w", label: "No" },
            { from: "win", to: "e", fromPort: "s", toPort: "e" },
            { from: "lose", to: "e", fromPort: "s", toPort: "e" },
        ],
    },
    "hero-journey": {
        title: "Hero's journey",
        description: "Campbell-style arc — call, trials, ordeal, and return.",
        category: "Story",
        nodes: [
            { key: "s", type: "start", x: 48, y: 180, text: "Ordinary world" },
            { key: "call", type: "process", x: 240, y: 168, text: "Call to adventure" },
            { key: "choice", type: "decision", x: 432, y: 152, text: "Accept the call?" },
            { key: "cross", type: "process", x: 624, y: 72, text: "Crossing threshold" },
            { key: "refuse", type: "note", x: 624, y: 264, text: "Refusal / delay" },
            { key: "tests", type: "process", x: 816, y: 168, text: "Tests & allies" },
            { key: "ordeal", type: "process", x: 1008, y: 168, text: "Ordeal" },
            { key: "reward", type: "data", x: 1200, y: 168, text: "Reward / insight" },
            { key: "return", type: "process", x: 1392, y: 168, text: "Return changed" },
            { key: "e", type: "end", x: 1584, y: 180, text: "New equilibrium" },
        ],
        edges: [
            { from: "s", to: "call" },
            { from: "call", to: "choice" },
            { from: "choice", to: "cross", label: "Yes" },
            { from: "choice", to: "refuse", label: "No" },
            { from: "refuse", to: "cross" },
            { from: "cross", to: "tests" },
            { from: "tests", to: "ordeal" },
            { from: "ordeal", to: "reward" },
            { from: "reward", to: "return" },
            { from: "return", to: "e" },
        ],
    },
    quest: {
        title: "Quest arc",
        description: "RPG-style quest flow — hook, objective, encounter, reward.",
        category: "World",
        nodes: [
            { key: "s", type: "start", x: 48, y: 180, text: "Quest hook" },
            { key: "giver", type: "data", x: 240, y: 168, text: "Quest giver" },
            { key: "accept", type: "decision", x: 432, y: 152, text: "Accept quest?" },
            { key: "travel", type: "process", x: 624, y: 168, text: "Travel / explore" },
            { key: "enc", type: "process", x: 816, y: 168, text: "Encounter" },
            { key: "tactic", type: "decision", x: 1008, y: 152, text: "Fight or parley?" },
            { key: "fight", type: "box", x: 1200, y: 72, text: "Combat beat" },
            { key: "talk", type: "box", x: 1200, y: 264, text: "Social beat" },
            { key: "obj", type: "process", x: 1392, y: 168, text: "Complete objective" },
            { key: "reward", type: "data", x: 1584, y: 168, text: "Reward" },
            { key: "e", type: "end", x: 1776, y: 180, text: "Quest resolved" },
        ],
        edges: [
            { from: "s", to: "giver" },
            { from: "giver", to: "accept" },
            { from: "accept", to: "travel", label: "Yes" },
            { from: "travel", to: "enc" },
            { from: "enc", to: "tactic" },
            { from: "tactic", to: "fight", label: "Fight" },
            { from: "tactic", to: "talk", label: "Talk" },
            { from: "fight", to: "obj" },
            { from: "talk", to: "obj" },
            { from: "obj", to: "reward" },
            { from: "reward", to: "e" },
        ],
    },
    "character-arc": {
        title: "Character arc",
        description: "Track belief, wound, change, and who they become.",
        category: "Character",
        nodes: [
            { key: "s", type: "start", x: 48, y: 180, text: "Who they are" },
            { key: "want", type: "process", x: 264, y: 168, text: "External want" },
            { key: "need", type: "process", x: 480, y: 168, text: "Internal need" },
            { key: "wound", type: "note", x: 480, y: 24, text: "Wound / flaw" },
            { key: "test", type: "decision", x: 696, y: 152, text: "Tested how?" },
            { key: "fail", type: "box", x: 912, y: 72, text: "Old way fails" },
            { key: "grow", type: "box", x: 912, y: 264, text: "Growth moment" },
            { key: "change", type: "process", x: 1128, y: 168, text: "Transformation" },
            { key: "e", type: "end", x: 1344, y: 180, text: "Who they become" },
        ],
        edges: [
            { from: "s", to: "want" },
            { from: "want", to: "need" },
            { from: "need", to: "test" },
            { from: "test", to: "fail", label: "Resist" },
            { from: "test", to: "grow", label: "Learn" },
            { from: "fail", to: "change" },
            { from: "grow", to: "change" },
            { from: "change", to: "e" },
        ],
    },
};

export const PLOTWEAVE_TEMPLATES = Object.entries(SPECS).map(([id, spec]) => ({
    id,
    title: spec.title,
    description: spec.description,
    category: spec.category,
    nodeCount: spec.nodes.length,
}));

/**
 * Build a diagram object from a template id.
 * @param {string} templateId
 * @param {(prefix: string) => string} mkId
 * @param {Record<string, { w: number, h: number, fill: string, stroke: string, text: string }>} shapes
 */
export function buildDiagramFromTemplate(templateId, mkId, shapes) {
    const spec = SPECS[templateId] || SPECS.blank;
    const t = Date.now();
    const diagram = {
        id: mkId("map"),
        title: spec.title,
        createdAt: t,
        updatedAt: t,
        nodes: [],
        edges: [],
        camera: { x: 40, y: 40, zoom: 1 },
    };

    const idByKey = new Map();

    for (const n of spec.nodes) {
        const def = shapes[n.type] || shapes.box;
        const id = mkId("n");
        idByKey.set(n.key, id);
        diagram.nodes.push({
            id,
            type: n.type,
            x: n.x,
            y: n.y,
            w: def.w,
            h: def.h,
            text: n.text,
            fill: def.fill,
            stroke: def.stroke,
        });
    }

    for (const e of spec.edges) {
        const from = idByKey.get(e.from);
        const to = idByKey.get(e.to);
        if (!from || !to) continue;
        diagram.edges.push({
            id: mkId("e"),
            from,
            to,
            fromPort: e.fromPort || "e",
            toPort: e.toPort || "w",
            label: e.label || "",
        });
    }

    return diagram;
}

export function getTemplateSpec(templateId) {
    return SPECS[templateId] || SPECS.blank;
}
