/**
 * Alysum Plotweave — canvas engine (SVG flowchart / process map).
 */

import { createPlotweaveSupabaseDriver } from "./plotweave-supabase.js?v=1";

export const PLOTWEAVE_STORAGE_KEY = "alysum-plotweave-v1";
const STORAGE_KEY = PLOTWEAVE_STORAGE_KEY;
const LEGACY_STORAGE_KEY = "alysum-flow-mapper-v1";
const MAX_HISTORY = 60;
const MIN_ZOOM = 0.001;
const MAX_ZOOM = 2.5;

export const SHAPE_DEFS = {
    start: {
        label: "Start",
        w: 140,
        h: 56,
        defaultText: "Start",
        fill: "#14532d",
        stroke: "#4ade80",
    },
    process: {
        label: "Process",
        w: 168,
        h: 72,
        defaultText: "Process step",
        fill: "#1e1b4b",
        stroke: "#a78bfa",
    },
    box: {
        label: "Box",
        w: 160,
        h: 72,
        defaultText: "Box",
        fill: "#1e293b",
        stroke: "#cbd5e1",
    },
    decision: {
        label: "Decision",
        w: 150,
        h: 100,
        defaultText: "Decision?",
        fill: "#422006",
        stroke: "#fbbf24",
    },
    end: {
        label: "End",
        w: 140,
        h: 56,
        defaultText: "End",
        fill: "#4c0519",
        stroke: "#fb7185",
    },
    note: {
        label: "Note",
        w: 160,
        h: 88,
        defaultText: "Note",
        fill: "#1e293b",
        stroke: "#94a3b8",
    },
    data: {
        label: "Data",
        w: 156,
        h: 68,
        defaultText: "Data / beat",
        fill: "#0c4a6e",
        stroke: "#38bdf8",
    },
};

const FILL_SWATCHES = [
    "#1e1b4b",
    "#312e81",
    "#3b0764",
    "#581c87",
    "#4a044e",
    "#172554",
    "#1e3a5f",
    "#0c4a6e",
    "#134e4a",
    "#064e3b",
    "#14532d",
    "#365314",
    "#422006",
    "#713f12",
    "#431407",
    "#4c0519",
    "#7f1d1d",
    "#881337",
    "#1e293b",
    "#374151",
    "#3f3f46",
    "#27272a",
    "#1c1917",
    "#831843",
    "#44403c",
    "#2d1b00",
    "#1a1a2e",
    "#0f3d3e",
    "#78350f",
];

const STROKE_SWATCHES = [
    "#a78bfa",
    "#c4b5fd",
    "#818cf8",
    "#60a5fa",
    "#38bdf8",
    "#2dd4bf",
    "#34d399",
    "#4ade80",
    "#a3e635",
    "#fde047",
    "#fbbf24",
    "#f97316",
    "#fb7185",
    "#f87171",
    "#f472b6",
    "#cbd5e1",
    "#94a3b8",
    "#e2e8f0",
    "#e879f9",
    "#86efac",
    "#67e8f9",
    "#fcd34d",
    "#d8b4fe",
    "#ffffff",
];

function normalizeHex(color) {
    return String(color || "").trim().toLowerCase();
}

function colorInputValue(color, fallback) {
    const c = String(color || fallback || "#1e1b4b").trim();
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(c)) {
        const r = c[1];
        const g = c[2];
        const b = c[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return colorInputValue(fallback, "#1e1b4b");
}

function isPresetColor(color, presets) {
    return presets.some((c) => normalizeHex(c) === normalizeHex(color));
}

function renderSwatches(presets, current) {
    return presets
        .map(
            (c) =>
                `<button type="button" class="fm-swatch${normalizeHex(current) === normalizeHex(c) ? " is-active" : ""}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`
        )
        .join("");
}

function uid(prefix = "n") {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}

function formatZoomLabel(zoom) {
    const pct = zoom * 100;
    if (pct < 1) return `${pct.toFixed(2)}%`;
    if (pct < 10) return `${pct.toFixed(1)}%`;
    return `${Math.round(pct)}%`;
}

function loadStore() {
    try {
        let raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            raw = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (raw) {
                localStorage.setItem(STORAGE_KEY, raw);
                localStorage.removeItem(LEGACY_STORAGE_KEY);
            }
        }
        if (!raw) return { diagrams: [], activeId: null };
        const parsed = JSON.parse(raw);
        return normalizeStore(parsed);
    } catch {
        return { diagrams: [], activeId: null };
    }
}

function normalizeDiagram(d) {
    if (!d || typeof d !== "object") return emptyDiagram();
    if (!Array.isArray(d.nodes)) d.nodes = [];
    if (!Array.isArray(d.edges)) d.edges = [];
    if (!d.camera || typeof d.camera !== "object") d.camera = { x: 0, y: 0, zoom: 1 };
    if (typeof d.camera.x !== "number" || !Number.isFinite(d.camera.x)) d.camera.x = 0;
    if (typeof d.camera.y !== "number" || !Number.isFinite(d.camera.y)) d.camera.y = 0;
    if (typeof d.camera.zoom !== "number" || !Number.isFinite(d.camera.zoom) || d.camera.zoom <= 0) {
        d.camera.zoom = 1;
    }
    return d;
}

function normalizeStore(store) {
    if (!store || !Array.isArray(store.diagrams)) return { diagrams: [], activeId: null };
    return {
        activeId: typeof store.activeId === "string" ? store.activeId : null,
        diagrams: store.diagrams.map((d) => normalizeDiagram(d)),
    };
}

function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function emptyDiagram(title = "Untitled map") {
    const now = Date.now();
    return {
        id: uid("map"),
        title,
        updatedAt: now,
        createdAt: now,
        nodes: [],
        edges: [],
        camera: { x: 0, y: 0, zoom: 1 },
    };
}

function samplePlotMap() {
    const d = emptyDiagram("Sample: Hero's journey beat map");
    const n1 = { id: uid("n"), type: "start", x: 80, y: 180, text: "Ordinary world", fill: "#14532d", stroke: "#4ade80", w: 150, h: 56 };
    const n2 = { id: uid("n"), type: "process", x: 300, y: 170, text: "Inciting incident", fill: "#1e1b4b", stroke: "#a78bfa", w: 168, h: 72 };
    const n3 = { id: uid("n"), type: "decision", x: 540, y: 155, text: "Accept the call?", fill: "#422006", stroke: "#fbbf24", w: 150, h: 100 };
    const n4 = { id: uid("n"), type: "process", x: 780, y: 80, text: "Crossing the threshold", fill: "#1e1b4b", stroke: "#a78bfa", w: 180, h: 72 };
    const n5 = { id: uid("n"), type: "note", x: 780, y: 280, text: "Refusal / delay beat", fill: "#1e293b", stroke: "#94a3b8", w: 160, h: 80 };
    const n6 = { id: uid("n"), type: "process", x: 1040, y: 170, text: "Tests & allies", fill: "#312e81", stroke: "#c4b5fd", w: 160, h: 72 };
    const n7 = { id: uid("n"), type: "end", x: 1280, y: 180, text: "Midpoint turn", fill: "#4c0519", stroke: "#fb7185", w: 150, h: 56 };
    d.nodes = [n1, n2, n3, n4, n5, n6, n7];
    d.edges = [
        { id: uid("e"), from: n1.id, to: n2.id, fromPort: "right", toPort: "left", label: "" },
        { id: uid("e"), from: n2.id, to: n3.id, fromPort: "right", toPort: "left", label: "" },
        { id: uid("e"), from: n3.id, to: n4.id, fromPort: "top", toPort: "left", label: "Yes" },
        { id: uid("e"), from: n3.id, to: n5.id, fromPort: "bottom", toPort: "left", label: "No" },
        { id: uid("e"), from: n4.id, to: n6.id, fromPort: "right", toPort: "left", label: "" },
        { id: uid("e"), from: n5.id, to: n6.id, fromPort: "right", toPort: "bottom", label: "later" },
        { id: uid("e"), from: n6.id, to: n7.id, fromPort: "right", toPort: "left", label: "" },
    ];
    d.camera = { x: -40, y: -40, zoom: 0.85 };
    return d;
}

function defaultShapeSize(type) {
    const def = SHAPE_DEFS[type] || SHAPE_DEFS.process;
    return { w: def.w, h: def.h };
}

function nodeSize(node) {
    const def = SHAPE_DEFS[node.type] || SHAPE_DEFS.process;
    let w = Number(node.w);
    let h = Number(node.h);
    if (!Number.isFinite(w) || w <= 0) w = def.w;
    if (!Number.isFinite(h) || h <= 0) h = def.h;
    return { w, h };
}

const RESIZE_MIN_W = 48;
const RESIZE_MIN_H = 36;
const RESIZE_MAX_W = 800;
const RESIZE_MAX_H = 600;

function clampNodeSize(w, h) {
    return {
        w: clamp(Math.round(w), RESIZE_MIN_W, RESIZE_MAX_W),
        h: clamp(Math.round(h), RESIZE_MIN_H, RESIZE_MAX_H),
    };
}

function resizeHandlesForNode(n) {
    const { w, h } = nodeSize(n);
    return [
        { id: "nw", x: n.x, y: n.y },
        { id: "ne", x: n.x + w, y: n.y },
        { id: "se", x: n.x + w, y: n.y + h },
        { id: "sw", x: n.x, y: n.y + h },
    ];
}

function applyNodeResize(node, handle, orig, dx, dy) {
    let x = orig.x;
    let y = orig.y;
    let w = orig.w;
    let h = orig.h;

    if (handle === "se") {
        w += dx;
        h += dy;
    } else if (handle === "sw") {
        x += dx;
        w -= dx;
        h += dy;
    } else if (handle === "ne") {
        y += dy;
        w += dx;
        h -= dy;
    } else if (handle === "nw") {
        x += dx;
        y += dy;
        w -= dx;
        h -= dy;
    }

    if (w < RESIZE_MIN_W) {
        if (handle === "sw" || handle === "nw") x -= RESIZE_MIN_W - w;
        w = RESIZE_MIN_W;
    }
    if (h < RESIZE_MIN_H) {
        if (handle === "nw" || handle === "ne") y -= RESIZE_MIN_H - h;
        h = RESIZE_MIN_H;
    }
    if (w > RESIZE_MAX_W) {
        if (handle === "sw" || handle === "nw") x -= w - RESIZE_MAX_W;
        w = RESIZE_MAX_W;
    }
    if (h > RESIZE_MAX_H) {
        if (handle === "nw" || handle === "ne") y -= h - RESIZE_MAX_H;
        h = RESIZE_MAX_H;
    }

    node.x = x;
    node.y = y;
    node.w = w;
    node.h = h;
}

function portPoint(node, port) {
    const { w, h } = nodeSize(node);
    const cx = node.x + w / 2;
    const cy = node.y + h / 2;
    switch (port) {
        case "top":
            return { x: cx, y: node.y };
        case "bottom":
            return { x: cx, y: node.y + h };
        case "left":
            return { x: node.x, y: cy };
        case "right":
        default:
            return { x: node.x + w, y: cy };
    }
}

function nearestPort(node, worldX, worldY) {
    const ports = ["top", "right", "bottom", "left"];
    let best = "right";
    let bestDist = Infinity;
    for (const p of ports) {
        const pt = portPoint(node, p);
        const d = (pt.x - worldX) ** 2 + (pt.y - worldY) ** 2;
        if (d < bestDist) {
            bestDist = d;
            best = p;
        }
    }
    return best;
}

function orthogonalPath(a, b) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dx > dy) {
        return `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;
    }
    return `M ${a.x} ${a.y} L ${a.x} ${my} L ${b.x} ${my} L ${b.x} ${b.y}`;
}

function edgeStroke(label, selected) {
    if (selected) return "#fbbf24";
    const t = String(label || "").trim().toLowerCase();
    if (t === "yes" || t === "y") return "#4ade80";
    if (t === "no" || t === "n") return "#fb7185";
    return "rgba(196,181,253,0.65)";
}

function edgeLabelFill(label) {
    const t = String(label || "").trim().toLowerCase();
    if (t === "yes" || t === "y") return "#14532d";
    if (t === "no" || t === "n") return "#4c0519";
    return "#1e1b4b";
}

function edgeLabelStroke(label) {
    const t = String(label || "").trim().toLowerCase();
    if (t === "yes" || t === "y") return "#4ade80";
    if (t === "no" || t === "n") return "#fb7185";
    return "#a78bfa";
}

function escapeXml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function wrapLines(text, maxChars = 18) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines = [];
    let cur = "";
    for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (next.length > maxChars && cur) {
            lines.push(cur);
            cur = w;
        } else {
            cur = next;
        }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 4);
}

function shapePath(type, w, h) {
    switch (type) {
        case "start":
        case "end": {
            const r = Math.min(h / 2, 28);
            return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
        }
        case "decision":
            return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
        case "box":
            return `M 0 0 H ${w} V ${h} H 0 Z`;
        case "data": {
            const skew = 18;
            return `M ${skew} 0 H ${w} L ${w - skew} ${h} H 0 Z`;
        }
        case "note": {
            const fold = 16;
            return `M 0 0 H ${w - fold} L ${w} ${fold} V ${h} H 0 Z`;
        }
        case "process":
        default: {
            const r = 10;
            return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
        }
    }
}

/**
 * @param {object} ui — DOM refs + callbacks
 * @param {object} [config]
 * @param {import("@supabase/supabase-js").SupabaseClient} [config.supabase]
 * @param {string} [config.supabaseUserId]
 */
export async function createPlotweave(ui, config = {}) {
    let store = loadStore();
    let remoteDriver = null;

    let diagram;
    let selectedIds = new Set();
    let selectedEdgeId = null;
    let tool = "select"; // select | pan | connect | place
    let placeType = null;
    let dirty = false;
    let history = [];
    let future = [];
    let connecting = null; // { fromId, fromPort, x, y }
    let drag = null;
    let lasso = null;
    let spaceDown = false;
    let raf = 0;
    let autoSaveTimer = null;
    const AUTO_SAVE_MS = 1500;
    let palettePlace = null;

    function isOverCanvas(clientX, clientY) {
        const wrap = svg.closest(".fm-stage-wrap");
        if (!wrap) return false;
        const r = wrap.getBoundingClientRect();
        return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    }

    function commitDiagram() {
        const idx = store.diagrams.findIndex((d) => d.id === diagram.id);
        if (idx >= 0) store.diagrams[idx] = diagram;
        else store.diagrams.push(diagram);
        store.activeId = diagram.id;
    }

    function scheduleAutoSave() {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            autoSaveTimer = null;
            if (dirty) persist("auto");
        }, AUTO_SAVE_MS);
    }

    function flushAutoSave() {
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
        }
        if (dirty) persist("auto");
    }

    function writeStore() {
        saveStore(store);
        remoteDriver?.pushDebounced();
    }

    if (config.supabase && config.supabaseUserId) {
        remoteDriver = createPlotweaveSupabaseDriver({
            supabase: config.supabase,
            userId: config.supabaseUserId,
            storageKey: STORAGE_KEY,
            getStore: () => store,
            setStore: (next) => {
                store = normalizeStore(next);
            },
            saveStore,
            refresh: () => {},
            setStatus: ui.setStatus,
        });
        await remoteDriver.pullOnce();
    }

    store = normalizeStore(store);

    if (!store.diagrams.length) {
        const sample = samplePlotMap();
        store.diagrams = [sample];
        store.activeId = sample.id;
        writeStore();
    }

    diagram = store.diagrams.find((d) => d.id === store.activeId) || store.diagrams[0];
    store.activeId = diagram.id;

    const svg = ui.stage;
    const world = svg.querySelector(".fm-world");
    const gEdges = svg.querySelector(".fm-edges");
    const gNodes = svg.querySelector(".fm-nodes");
    const gOverlay = svg.querySelector(".fm-overlay");

    function pushHistory() {
        history.push(deepClone({ nodes: diagram.nodes, edges: diagram.edges }));
        if (history.length > MAX_HISTORY) history.shift();
        future = [];
        updateUndoButtons();
    }

    function markDirty(opts = {}) {
        dirty = true;
        ui.setStatus?.("Unsaved changes", "dirty");
        scheduleAutoSave();
        scheduleRender();
        if (opts.refreshProps) refreshProps();
    }

    function persist(mode = false) {
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
        }
        diagram.updatedAt = Date.now();
        commitDiagram();
        writeStore();
        dirty = false;
        if (mode === "auto") {
            ui.setStatus?.(remoteDriver ? "Auto-saved" : "Auto-saved locally", "saved");
        } else if (mode !== true) {
            ui.setStatus?.(remoteDriver ? "Saved" : "Saved locally", "saved");
        }
        renderDiagramList();
    }

    function updateUndoButtons() {
        ui.btnUndo.disabled = !history.length;
        ui.btnRedo.disabled = !future.length;
    }

    function undo() {
        if (!history.length) return;
        future.push(deepClone({ nodes: diagram.nodes, edges: diagram.edges }));
        const prev = history.pop();
        diagram.nodes = prev.nodes;
        diagram.edges = prev.edges;
        selectedIds.clear();
        selectedEdgeId = null;
        markDirty({ refreshProps: true });
        updateUndoButtons();
    }

    function redo() {
        if (!future.length) return;
        history.push(deepClone({ nodes: diagram.nodes, edges: diagram.edges }));
        const next = future.pop();
        diagram.nodes = next.nodes;
        diagram.edges = next.edges;
        selectedIds.clear();
        selectedEdgeId = null;
        markDirty({ refreshProps: true });
        updateUndoButtons();
    }

    function screenToWorld(clientX, clientY) {
        const rect = svg.getBoundingClientRect();
        const sx = clientX - rect.left;
        const sy = clientY - rect.top;
        const z = diagram.camera.zoom;
        return {
            x: (sx - diagram.camera.x) / z,
            y: (sy - diagram.camera.y) / z,
        };
    }

    function applyCamera() {
        const { x, y, zoom } = diagram.camera;
        world.setAttribute("transform", `translate(${x} ${y}) scale(${zoom})`);
        ui.zoomLabel.textContent = formatZoomLabel(zoom);
    }

    function setZoom(next, centerClient) {
        const z0 = diagram.camera.zoom;
        const z1 = clamp(next, MIN_ZOOM, MAX_ZOOM);
        if (centerClient) {
            const rect = svg.getBoundingClientRect();
            const sx = centerClient.x - rect.left;
            const sy = centerClient.y - rect.top;
            const wx = (sx - diagram.camera.x) / z0;
            const wy = (sy - diagram.camera.y) / z0;
            diagram.camera.zoom = z1;
            diagram.camera.x = sx - wx * z1;
            diagram.camera.y = sy - wy * z1;
        } else {
            diagram.camera.zoom = z1;
        }
        applyCamera();
        markDirty();
    }

    function fitView() {
        if (!diagram.nodes.length) {
            diagram.camera = { x: 40, y: 40, zoom: 1 };
            applyCamera();
            return;
        }
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const n of diagram.nodes) {
            const { w, h } = nodeSize(n);
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + w);
            maxY = Math.max(maxY, n.y + h);
        }
        const pad = 80;
        const rect = svg.getBoundingClientRect();
        const bw = maxX - minX + pad * 2;
        const bh = maxY - minY + pad * 2;
        const zoom = clamp(Math.min(rect.width / bw, rect.height / bh), MIN_ZOOM, MAX_ZOOM);
        diagram.camera.zoom = zoom;
        diagram.camera.x = (rect.width - bw * zoom) / 2 - (minX - pad) * zoom;
        diagram.camera.y = (rect.height - bh * zoom) / 2 - (minY - pad) * zoom;
        applyCamera();
        markDirty();
    }

    function hitNode(wx, wy) {
        for (let i = diagram.nodes.length - 1; i >= 0; i--) {
            const n = diagram.nodes[i];
            const { w, h } = nodeSize(n);
            if (wx >= n.x && wx <= n.x + w && wy >= n.y && wy <= n.y + h) return n;
        }
        return null;
    }

    function hitEdge(wx, wy) {
        const thresh = 8 / diagram.camera.zoom;
        for (const e of diagram.edges) {
            const a = diagram.nodes.find((n) => n.id === e.from);
            const b = diagram.nodes.find((n) => n.id === e.to);
            if (!a || !b) continue;
            const p1 = portPoint(a, e.fromPort || "right");
            const p2 = portPoint(b, e.toPort || "left");
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            // sample mid segment
            const dist = pointSegDist(wx, wy, p1.x, p1.y, mx, my) ||
                pointSegDist(wx, wy, mx, my, p2.x, p2.y);
            if (dist < thresh) return e;
        }
        return null;
    }

    function pointSegDist(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len2 = dx * dx + dy * dy || 1;
        let t = ((px - x1) * dx + (py - y1) * dy) / len2;
        t = clamp(t, 0, 1);
        const qx = x1 + t * dx;
        const qy = y1 + t * dy;
        return Math.hypot(px - qx, py - qy);
    }

    function scheduleRender() {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            render();
        });
    }

    function render() {
        applyCamera();
        ui.empty.classList.toggle("is-hidden", diagram.nodes.length > 0);

        const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));

        gEdges.innerHTML = diagram.edges
            .map((e) => {
                const a = nodeById.get(e.from);
                const b = nodeById.get(e.to);
                if (!a || !b) return "";
                const p1 = portPoint(a, e.fromPort || "right");
                const p2 = portPoint(b, e.toPort || "left");
                const path = orthogonalPath(p1, p2);
                const mx = (p1.x + p2.x) / 2;
                const my = (p1.y + p2.y) / 2;
                const sel = e.id === selectedEdgeId;
                const stroke = edgeStroke(e.label, sel);
                const label = String(e.label || "").trim();
                let labelSvg = "";
                if (label) {
                    const tw = Math.max(28, Math.min(120, label.length * 7 + 16));
                    const th = 20;
                    labelSvg = `<g class="fm-edge-label-g" transform="translate(${mx} ${my - 4})">
                        <rect x="${-tw / 2}" y="${-th / 2 - 2}" width="${tw}" height="${th}" rx="6"
                            fill="${edgeLabelFill(label)}" stroke="${edgeLabelStroke(label)}" stroke-width="1.5"/>
                        <text class="fm-edge-label" x="0" y="4" text-anchor="middle" fill="#f8fafc">${escapeXml(label)}</text>
                    </g>`;
                }
                return `<g class="fm-edge${sel ? " is-selected" : ""}" data-id="${e.id}">
                    <path d="${path}" fill="none" stroke="${stroke}" stroke-width="${sel ? 3 : 2}" marker-end="url(#fmArrow)"/>
                    <path d="${path}" fill="none" stroke="transparent" stroke-width="14" data-edge-hit="${e.id}"/>
                    ${labelSvg}
                </g>`;
            })
            .join("");

        gNodes.innerHTML = diagram.nodes
            .map((n) => {
                const { w, h } = nodeSize(n);
                const sel = selectedIds.has(n.id);
                const fill = n.fill || SHAPE_DEFS[n.type]?.fill || "#1e1b4b";
                const stroke = n.stroke || SHAPE_DEFS[n.type]?.stroke || "#a78bfa";
                const d = shapePath(n.type, w, h);
                const lines = wrapLines(n.text || "", n.type === "decision" ? 12 : 16);
                const lineH = 15;
                const textBlockH = lines.length * lineH;
                const textY = h / 2 - textBlockH / 2 + 12;
                const ports = ["top", "right", "bottom", "left"]
                    .map((p) => {
                        const pt = portPoint({ ...n, x: 0, y: 0, w, h }, p);
                        return `<circle class="fm-port" data-port="${p}" cx="${pt.x}" cy="${pt.y}" r="6"/>`;
                    })
                    .join("");
                const labels = lines
                    .map(
                        (line, i) =>
                            `<text class="fm-node-label" x="${w / 2}" y="${textY + i * lineH}" text-anchor="middle">${escapeXml(line)}</text>`
                    )
                    .join("");
                return `<g class="fm-node${sel ? " is-selected" : ""}" data-id="${n.id}" transform="translate(${n.x} ${n.y})">
                    <path d="${d}" fill="${fill}" stroke="${sel ? "#fbbf24" : stroke}" stroke-width="${sel ? 3 : 2}"/>
                    ${labels}
                    ${ports}
                </g>`;
            })
            .join("");

        // overlay: temp edge / lasso
        let overlay = "";
        if (connecting) {
            const from = nodeById.get(connecting.fromId);
            if (from) {
                const p1 = portPoint(from, connecting.fromPort);
                overlay += `<path class="fm-temp-edge" d="${orthogonalPath(p1, { x: connecting.x, y: connecting.y })}"/>`;
            }
        }
        if (lasso) {
            const x = Math.min(lasso.x0, lasso.x1);
            const y = Math.min(lasso.y0, lasso.y1);
            const w = Math.abs(lasso.x1 - lasso.x0);
            const h = Math.abs(lasso.y1 - lasso.y0);
            overlay += `<rect class="fm-lasso" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
        }
        if (selectedIds.size === 1 && tool === "select" && !connecting) {
            const id = [...selectedIds][0];
            const n = nodeById.get(id);
            if (n) {
                const { w, h } = nodeSize(n);
                overlay += `<rect class="fm-selection-box" x="${n.x}" y="${n.y}" width="${w}" height="${h}"/>`;
                for (const handle of resizeHandlesForNode(n)) {
                    overlay += `<rect class="fm-resize-handle" data-handle="${handle.id}" x="${handle.x - 5}" y="${handle.y - 5}" width="10" height="10" rx="2"/>`;
                }
            }
        }
        gOverlay.innerHTML = overlay;
    }

    function refreshProps() {
        const panel = ui.propsBody;
        if (selectedEdgeId) {
            const e = diagram.edges.find((x) => x.id === selectedEdgeId);
            if (!e) {
                panel.innerHTML = `<p class="fm-props-empty">Select a shape or connector to edit its properties.</p>`;
                return;
            }
            panel.innerHTML = `
                <div class="fm-field">
                    <label>Connector label</label>
                    <input type="text" id="fmPropEdgeLabel" value="${escapeXml(e.label || "")}" placeholder="e.g. Yes / No" />
                </div>
                <div class="fm-field">
                    <label>Quick labels</label>
                    <div class="fm-color-row" id="fmPropEdgeQuick">
                        <button type="button" class="fm-btn${(e.label || "") === "Yes" ? " is-active" : ""}" data-label="Yes" style="flex:1;justify-content:center;border-color:rgba(74,222,128,0.45);color:#bbf7d0">Yes</button>
                        <button type="button" class="fm-btn${(e.label || "") === "No" ? " is-active" : ""}" data-label="No" style="flex:1;justify-content:center;border-color:rgba(251,113,133,0.45);color:#fecdd3">No</button>
                        <button type="button" class="fm-btn${!e.label ? " is-active" : ""}" data-label="" style="flex:1;justify-content:center">None</button>
                    </div>
                </div>
                <button type="button" class="fm-btn fm-danger-btn" id="fmPropDeleteEdge">Delete connector</button>
            `;
            const edgeLabel = panel.querySelector("#fmPropEdgeLabel");
            let edgeHist = false;
            edgeLabel.addEventListener("focus", () => {
                edgeHist = false;
            });
            edgeLabel.addEventListener("input", (ev) => {
                if (!edgeHist) {
                    pushHistory();
                    edgeHist = true;
                }
                e.label = ev.target.value;
                markDirty();
            });
            panel.querySelector("#fmPropEdgeQuick").addEventListener("click", (ev) => {
                const btn = ev.target.closest("[data-label]");
                if (!btn) return;
                pushHistory();
                e.label = btn.dataset.label;
                markDirty({ refreshProps: true });
            });
            panel.querySelector("#fmPropDeleteEdge").addEventListener("click", () => {
                pushHistory();
                diagram.edges = diagram.edges.filter((x) => x.id !== e.id);
                selectedEdgeId = null;
                markDirty({ refreshProps: true });
            });
            return;
        }

        if (selectedIds.size === 1) {
            const id = [...selectedIds][0];
            const n = diagram.nodes.find((x) => x.id === id);
            if (!n) {
                panel.innerHTML = `<p class="fm-props-empty">Select a shape or connector to edit its properties.</p>`;
                return;
            }
            const def = SHAPE_DEFS[n.type] || SHAPE_DEFS.process;
            const { w, h } = nodeSize(n);
            panel.innerHTML = `
                <div class="fm-field">
                    <label>Text</label>
                    <textarea id="fmPropText">${escapeXml(n.text || "")}</textarea>
                </div>
                <div class="fm-field-row">
                    <div class="fm-field">
                        <label>Width</label>
                        <input type="number" id="fmPropW" min="${RESIZE_MIN_W}" max="${RESIZE_MAX_W}" value="${w}" />
                    </div>
                    <div class="fm-field">
                        <label>Height</label>
                        <input type="number" id="fmPropH" min="${RESIZE_MIN_H}" max="${RESIZE_MAX_H}" value="${h}" />
                    </div>
                </div>
                <div class="fm-field">
                    <label>Shape</label>
                    <select id="fmPropType">
                        ${Object.entries(SHAPE_DEFS)
                            .map(
                                ([k, v]) =>
                                    `<option value="${k}" ${k === n.type ? "selected" : ""}>${v.label}</option>`
                            )
                            .join("")}
                    </select>
                </div>
                <div class="fm-field">
                    <label>Fill</label>
                    <div class="fm-color-row" id="fmPropFill">
                        ${renderSwatches(FILL_SWATCHES, n.fill || def.fill)}
                        <input type="color" class="fm-color-custom${!isPresetColor(n.fill || def.fill, FILL_SWATCHES) ? " is-active" : ""}" id="fmPropFillCustom" value="${colorInputValue(n.fill, def.fill)}" title="Custom fill color" aria-label="Custom fill color" />
                    </div>
                </div>
                <div class="fm-field">
                    <label>Border</label>
                    <div class="fm-color-row" id="fmPropStroke">
                        ${renderSwatches(STROKE_SWATCHES, n.stroke || def.stroke)}
                        <input type="color" class="fm-color-custom${!isPresetColor(n.stroke || def.stroke, STROKE_SWATCHES) ? " is-active" : ""}" id="fmPropStrokeCustom" value="${colorInputValue(n.stroke, def.stroke)}" title="Custom border color" aria-label="Custom border color" />
                    </div>
                </div>
                <button type="button" class="fm-btn fm-danger-btn" id="fmPropDelete">Delete shape</button>
            `;
            const textEl = panel.querySelector("#fmPropText");
            let textHist = false;
            textEl.addEventListener("focus", () => {
                textHist = false;
            });
            textEl.addEventListener("input", (ev) => {
                if (!textHist) {
                    pushHistory();
                    textHist = true;
                }
                n.text = ev.target.value;
                markDirty();
            });
            const applySizeFromInputs = () => {
                const next = clampNodeSize(
                    Number(panel.querySelector("#fmPropW").value) || w,
                    Number(panel.querySelector("#fmPropH").value) || h
                );
                n.w = next.w;
                n.h = next.h;
                panel.querySelector("#fmPropW").value = String(next.w);
                panel.querySelector("#fmPropH").value = String(next.h);
                markDirty();
            };
            let sizeHist = false;
            for (const el of [panel.querySelector("#fmPropW"), panel.querySelector("#fmPropH")]) {
                el.addEventListener("focus", () => {
                    sizeHist = false;
                });
                el.addEventListener("input", () => {
                    if (!sizeHist) {
                        pushHistory();
                        sizeHist = true;
                    }
                    applySizeFromInputs();
                });
            }
            panel.querySelector("#fmPropType").addEventListener("change", (ev) => {
                pushHistory();
                const t = ev.target.value;
                n.type = t;
                const d = SHAPE_DEFS[t];
                const size = defaultShapeSize(t);
                n.w = size.w;
                n.h = size.h;
                if (!n.fill) n.fill = d.fill;
                n.stroke = d.stroke;
                markDirty({ refreshProps: true });
            });
            panel.querySelector("#fmPropFill").addEventListener("click", (ev) => {
                const btn = ev.target.closest(".fm-swatch");
                if (!btn) return;
                pushHistory();
                n.fill = btn.dataset.color;
                panel.querySelector("#fmPropFillCustom").value = n.fill;
                markDirty({ refreshProps: true });
            });
            panel.querySelector("#fmPropStroke").addEventListener("click", (ev) => {
                const btn = ev.target.closest(".fm-swatch");
                if (!btn) return;
                pushHistory();
                n.stroke = btn.dataset.color;
                panel.querySelector("#fmPropStrokeCustom").value = n.stroke;
                markDirty({ refreshProps: true });
            });
            let fillCustomHist = false;
            let strokeCustomHist = false;
            panel.querySelector("#fmPropFillCustom").addEventListener("focus", () => {
                fillCustomHist = false;
            });
            panel.querySelector("#fmPropFillCustom").addEventListener("input", (ev) => {
                if (!fillCustomHist) {
                    pushHistory();
                    fillCustomHist = true;
                }
                n.fill = ev.target.value;
                markDirty({ refreshProps: true });
            });
            panel.querySelector("#fmPropStrokeCustom").addEventListener("focus", () => {
                strokeCustomHist = false;
            });
            panel.querySelector("#fmPropStrokeCustom").addEventListener("input", (ev) => {
                if (!strokeCustomHist) {
                    pushHistory();
                    strokeCustomHist = true;
                }
                n.stroke = ev.target.value;
                markDirty({ refreshProps: true });
            });
            panel.querySelector("#fmPropDelete").addEventListener("click", () => {
                deleteSelection();
            });
            return;
        }

        if (selectedIds.size > 1) {
            panel.innerHTML = `<p class="fm-props-empty">${selectedIds.size} shapes selected. Drag to move together, or press Delete to remove.</p>
                <button type="button" class="fm-btn fm-danger-btn" id="fmPropDelete">Delete selected</button>`;
            panel.querySelector("#fmPropDelete").addEventListener("click", () => deleteSelection());
            return;
        }

        panel.innerHTML = `<p class="fm-props-empty">Select a shape or connector to edit its properties. Drag shapes from the library, or click a shape then click another to connect.</p>`;
    }

    function deleteSelection() {
        if (!selectedIds.size && !selectedEdgeId) return;
        pushHistory();
        if (selectedEdgeId) {
            diagram.edges = diagram.edges.filter((e) => e.id !== selectedEdgeId);
            selectedEdgeId = null;
        }
        if (selectedIds.size) {
            const ids = selectedIds;
            diagram.nodes = diagram.nodes.filter((n) => !ids.has(n.id));
            diagram.edges = diagram.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to));
            selectedIds.clear();
        }
        markDirty({ refreshProps: true });
    }

    function addNodeAt(type, wx, wy) {
        const def = SHAPE_DEFS[type] || SHAPE_DEFS.process;
        const { w, h } = defaultShapeSize(type);
        if (!Array.isArray(diagram.nodes)) diagram.nodes = [];
        pushHistory();
        const node = {
            id: uid("n"),
            type,
            x: wx - w / 2,
            y: wy - h / 2,
            text: def.defaultText,
            fill: def.fill,
            stroke: def.stroke,
            w,
            h,
        };
        diagram.nodes.push(node);
        commitDiagram();
        selectedIds = new Set([node.id]);
        selectedEdgeId = null;
        updateToolUi();
        markDirty({ refreshProps: true });
        render();
        ui.setStatus?.(`Placed ${def.label} — click again or pick another shape`, "saved");
    }

    function setTool(next, type = null) {
        tool = next;
        placeType = type;
        connecting = null;
        palettePlace = null;
        updateToolUi();
        if (tool === "place" && placeType) {
            const label = SHAPE_DEFS[placeType]?.label || placeType;
            ui.setStatus?.(`Click or drag ${label} onto the canvas`, "saved");
        }
        scheduleRender();
    }

    function updateToolUi() {
        svg.classList.toggle("is-panning", tool === "pan" || spaceDown);
        svg.classList.toggle("is-connecting", tool === "connect" || !!connecting);
        svg.classList.toggle("is-placing", tool === "place");
        ui.btnSelect?.classList.toggle("is-active", tool === "select");
        ui.btnPan?.classList.toggle("is-active", tool === "pan");
        ui.btnConnect?.classList.toggle("is-active", tool === "connect");
        ui.palette?.querySelectorAll(".fm-palette-item").forEach((el) => {
            el.classList.toggle("is-placing", tool === "place" && el.dataset.type === placeType);
        });
    }

    function renderDiagramList() {
        const list = ui.diagramList;
        list.innerHTML = store.diagrams
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((d) => {
                const active = d.id === diagram.id;
                const when = new Date(d.updatedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                });
                return `<button type="button" class="fm-diagram-item${active ? " is-active" : ""}" data-id="${d.id}">
                    <strong>${escapeXml(d.title || "Untitled")}</strong>
                    <span>${when} · ${d.nodes.length} shapes</span>
                </button>`;
            })
            .join("");
    }

    function switchDiagram(id) {
        if (dirty) flushAutoSave();
        const next = store.diagrams.find((d) => d.id === id);
        if (!next) return;
        diagram = next;
        store.activeId = id;
        writeStore();
        selectedIds.clear();
        selectedEdgeId = null;
        history = [];
        future = [];
        updateUndoButtons();
        ui.titleInput.value = diagram.title || "";
        dirty = false;
        ui.setStatus?.("Loaded", "saved");
        renderDiagramList();
        scheduleRender();
        refreshProps();
        fitView();
    }

    function newDiagram() {
        if (dirty) flushAutoSave();
        const d = emptyDiagram("Untitled map");
        store.diagrams.unshift(d);
        store.activeId = d.id;
        diagram = d;
        writeStore();
        selectedIds.clear();
        selectedEdgeId = null;
        history = [];
        future = [];
        updateUndoButtons();
        ui.titleInput.value = d.title;
        dirty = false;
        ui.setStatus?.("New map", "saved");
        renderDiagramList();
        scheduleRender();
        refreshProps();
    }

    function duplicateDiagram() {
        if (dirty) flushAutoSave();
        const copy = deepClone(diagram);
        copy.id = uid("map");
        copy.title = `${diagram.title || "Untitled"} (copy)`;
        copy.createdAt = Date.now();
        copy.updatedAt = Date.now();
        store.diagrams.unshift(copy);
        store.activeId = copy.id;
        diagram = copy;
        writeStore();
        ui.titleInput.value = copy.title;
        history = [];
        future = [];
        updateUndoButtons();
        renderDiagramList();
        ui.setStatus?.("Duplicated", "saved");
    }

    function deleteDiagram() {
        if (store.diagrams.length <= 1) {
            diagram.nodes = [];
            diagram.edges = [];
            diagram.title = "Untitled map";
            ui.titleInput.value = diagram.title;
            pushHistory();
            markDirty();
            persist();
            return;
        }
        store.diagrams = store.diagrams.filter((d) => d.id !== diagram.id);
        diagram = store.diagrams[0];
        store.activeId = diagram.id;
        writeStore();
        selectedIds.clear();
        selectedEdgeId = null;
        history = [];
        future = [];
        ui.titleInput.value = diagram.title;
        renderDiagramList();
        scheduleRender();
        refreshProps();
        ui.setStatus?.("Map deleted", "saved");
    }

    // —— Pointer interactions ——
    function onPointerDown(ev) {
        if (ev.button === 2 || (ev.button === 0 && (tool === "pan" || spaceDown || ev.button === 1))) {
            // pan
            drag = {
                mode: "pan",
                sx: ev.clientX,
                sy: ev.clientY,
                cx: diagram.camera.x,
                cy: diagram.camera.y,
                pointerId: ev.pointerId,
            };
            svg.setPointerCapture(ev.pointerId);
            svg.classList.add("is-panning");
            ev.preventDefault();
            return;
        }
        if (ev.button !== 0) return;

        const worldPt = screenToWorld(ev.clientX, ev.clientY);
        const target = ev.target;

        if (tool === "place" && placeType) {
            addNodeAt(placeType, worldPt.x, worldPt.y);
            if (palettePlace) palettePlace.placed = true;
            ev.preventDefault();
            return;
        }

        const resizeEl = target.closest?.(".fm-resize-handle");
        if (resizeEl && selectedIds.size === 1 && tool === "select") {
            const id = [...selectedIds][0];
            const n = diagram.nodes.find((x) => x.id === id);
            if (n) {
                const size = nodeSize(n);
                drag = {
                    mode: "resize",
                    pointerId: ev.pointerId,
                    handle: resizeEl.dataset.handle,
                    nodeId: id,
                    sx: worldPt.x,
                    sy: worldPt.y,
                    orig: { x: n.x, y: n.y, w: size.w, h: size.h },
                    moved: false,
                };
                svg.setPointerCapture(ev.pointerId);
                ev.preventDefault();
                return;
            }
        }

        // port connect start
        const portEl = target.closest?.(".fm-port");
        if (portEl) {
            const nodeEl = portEl.closest(".fm-node");
            const fromId = nodeEl?.dataset.id;
            if (fromId) {
                connecting = {
                    fromId,
                    fromPort: portEl.dataset.port,
                    x: worldPt.x,
                    y: worldPt.y,
                };
                tool = "connect";
                updateToolUi();
                svg.setPointerCapture(ev.pointerId);
                drag = { mode: "connect", pointerId: ev.pointerId };
                scheduleRender();
                return;
            }
        }

        if (tool === "connect") {
            const node = hitNode(worldPt.x, worldPt.y);
            if (node) {
                if (!connecting) {
                    connecting = {
                        fromId: node.id,
                        fromPort: nearestPort(node, worldPt.x, worldPt.y),
                        x: worldPt.x,
                        y: worldPt.y,
                    };
                    drag = { mode: "connect", pointerId: ev.pointerId };
                    svg.setPointerCapture(ev.pointerId);
                    scheduleRender();
                } else if (connecting.fromId !== node.id) {
                    pushHistory();
                    const toPort = nearestPort(node, worldPt.x, worldPt.y);
                    diagram.edges.push({
                        id: uid("e"),
                        from: connecting.fromId,
                        to: node.id,
                        fromPort: connecting.fromPort,
                        toPort,
                        label: "",
                    });
                    connecting = null;
                    tool = "select";
                    updateToolUi();
                    markDirty();
                }
            }
            return;
        }

        // edge hit
        if (target.dataset?.edgeHit) {
            selectedEdgeId = target.dataset.edgeHit;
            selectedIds.clear();
            refreshProps();
            scheduleRender();
            return;
        }

        const node = hitNode(worldPt.x, worldPt.y);
        if (node) {
            selectedEdgeId = null;
            if (ev.shiftKey) {
                if (selectedIds.has(node.id)) selectedIds.delete(node.id);
                else selectedIds.add(node.id);
            } else if (!selectedIds.has(node.id)) {
                selectedIds = new Set([node.id]);
            }
            const origins = {};
            for (const id of selectedIds) {
                const n = diagram.nodes.find((x) => x.id === id);
                if (n) origins[id] = { x: n.x, y: n.y };
            }
            drag = {
                mode: "move",
                pointerId: ev.pointerId,
                sx: worldPt.x,
                sy: worldPt.y,
                origins,
                moved: false,
            };
            svg.setPointerCapture(ev.pointerId);
            refreshProps();
            scheduleRender();
            return;
        }

        // lasso / clear
        if (!ev.shiftKey) {
            selectedIds.clear();
            selectedEdgeId = null;
            refreshProps();
        }
        lasso = { x0: worldPt.x, y0: worldPt.y, x1: worldPt.x, y1: worldPt.y };
        drag = { mode: "lasso", pointerId: ev.pointerId };
        svg.setPointerCapture(ev.pointerId);
        scheduleRender();
    }

    function onPointerMove(ev) {
        if (!drag) {
            if (connecting) {
                const pt = screenToWorld(ev.clientX, ev.clientY);
                connecting.x = pt.x;
                connecting.y = pt.y;
                scheduleRender();
            }
            return;
        }
        if (drag.mode === "pan") {
            diagram.camera.x = drag.cx + (ev.clientX - drag.sx);
            diagram.camera.y = drag.cy + (ev.clientY - drag.sy);
            applyCamera();
            return;
        }
        const worldPt = screenToWorld(ev.clientX, ev.clientY);
        if (drag.mode === "connect" && connecting) {
            connecting.x = worldPt.x;
            connecting.y = worldPt.y;
            scheduleRender();
            return;
        }
        if (drag.mode === "move") {
            const dx = worldPt.x - drag.sx;
            const dy = worldPt.y - drag.sy;
            if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
                pushHistory();
                drag.moved = true;
            }
            for (const id of Object.keys(drag.origins)) {
                const n = diagram.nodes.find((x) => x.id === id);
                if (!n) continue;
                n.x = drag.origins[id].x + dx;
                n.y = drag.origins[id].y + dy;
            }
            if (drag.moved) markDirty();
            else scheduleRender();
            return;
        }
        if (drag.mode === "resize") {
            const n = diagram.nodes.find((x) => x.id === drag.nodeId);
            if (!n) return;
            const dx = worldPt.x - drag.sx;
            const dy = worldPt.y - drag.sy;
            if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
                pushHistory();
                drag.moved = true;
            }
            applyNodeResize(n, drag.handle, drag.orig, dx, dy);
            if (drag.moved) markDirty();
            else scheduleRender();
            return;
        }
        if (drag.mode === "lasso" && lasso) {
            lasso.x1 = worldPt.x;
            lasso.y1 = worldPt.y;
            scheduleRender();
        }
    }

    function onPointerUp(ev) {
        if (palettePlace?.armed && !palettePlace.placed && isOverCanvas(ev.clientX, ev.clientY)) {
            const worldPt = screenToWorld(ev.clientX, ev.clientY);
            addNodeAt(palettePlace.type, worldPt.x, worldPt.y);
        }
        palettePlace = null;

        if (!drag) return;
        if (drag.mode === "lasso" && lasso) {
            const x1 = Math.min(lasso.x0, lasso.x1);
            const y1 = Math.min(lasso.y0, lasso.y1);
            const x2 = Math.max(lasso.x0, lasso.x1);
            const y2 = Math.max(lasso.y0, lasso.y1);
            if (Math.hypot(lasso.x1 - lasso.x0, lasso.y1 - lasso.y0) > 4) {
                const next = new Set(ev.shiftKey ? selectedIds : []);
                for (const n of diagram.nodes) {
                    const { w, h } = nodeSize(n);
                    const cx = n.x + w / 2;
                    const cy = n.y + h / 2;
                    if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) next.add(n.id);
                }
                selectedIds = next;
                selectedEdgeId = null;
                refreshProps();
            }
            lasso = null;
        }
        if (drag.mode === "connect" && connecting) {
            const worldPt = screenToWorld(ev.clientX, ev.clientY);
            const node = hitNode(worldPt.x, worldPt.y);
            if (node && node.id !== connecting.fromId) {
                pushHistory();
                diagram.edges.push({
                    id: uid("e"),
                    from: connecting.fromId,
                    to: node.id,
                    fromPort: connecting.fromPort,
                    toPort: nearestPort(node, worldPt.x, worldPt.y),
                    label: "",
                });
                markDirty();
            }
            connecting = null;
            tool = "select";
            updateToolUi();
        }
        if (drag.mode === "pan") {
            markDirty();
            svg.classList.toggle("is-panning", tool === "pan" || spaceDown);
        }
        if (drag.mode === "move" && drag.moved) persist("auto");
        if (drag.mode === "resize" && drag.moved) {
            persist("auto");
            refreshProps();
        }
        drag = null;
        scheduleRender();
    }

    function onWheel(ev) {
        ev.preventDefault();
        const factor = ev.deltaY > 0 ? 0.9 : 1.1;
        setZoom(diagram.camera.zoom * factor, { x: ev.clientX, y: ev.clientY });
    }

    function onKeyDown(ev) {
        const tag = (ev.target && ev.target.tagName) || "";
        const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

        if (ev.code === "Space" && !typing) {
            spaceDown = true;
            updateToolUi();
            ev.preventDefault();
            return;
        }
        if (typing) return;

        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
            ev.preventDefault();
            if (ev.shiftKey) redo();
            else undo();
            return;
        }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
            ev.preventDefault();
            redo();
            return;
        }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
            ev.preventDefault();
            persist();
            return;
        }
        if (ev.key === "Delete" || ev.key === "Backspace") {
            ev.preventDefault();
            deleteSelection();
            return;
        }
        if (ev.key === "Escape") {
            connecting = null;
            placeType = null;
            palettePlace = null;
            tool = "select";
            selectedIds.clear();
            selectedEdgeId = null;
            updateToolUi();
            refreshProps();
            scheduleRender();
            return;
        }
        if (ev.key === "v" || ev.key === "V") setTool("select");
        if (ev.key === "h" || ev.key === "H") setTool("pan");
        if (ev.key === "c" || ev.key === "C") setTool("connect");
    }

    function onKeyUp(ev) {
        if (ev.code === "Space") {
            spaceDown = false;
            updateToolUi();
        }
    }

    // —— Wire UI ——
    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointercancel", onPointerUp);
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    ui.btnUndo.addEventListener("click", undo);
    ui.btnRedo.addEventListener("click", redo);
    ui.btnSave.addEventListener("click", () => persist());
    ui.btnSelect?.addEventListener("click", () => setTool("select"));
    ui.btnPan?.addEventListener("click", () => setTool("pan"));
    ui.btnConnect?.addEventListener("click", () => setTool("connect"));
    ui.btnZoomIn.addEventListener("click", () => setZoom(diagram.camera.zoom * 1.15));
    ui.btnZoomOut.addEventListener("click", () => setZoom(diagram.camera.zoom / 1.15));
    ui.btnFit.addEventListener("click", fitView);
    ui.btnNew.addEventListener("click", newDiagram);
    ui.btnDuplicate?.addEventListener("click", duplicateDiagram);
    ui.btnDeleteMap?.addEventListener("click", () => {
        if (confirm("Delete this map?")) deleteDiagram();
    });

    ui.titleInput.value = diagram.title || "";
    ui.titleInput.addEventListener("input", () => {
        diagram.title = ui.titleInput.value || "Untitled map";
        renderDiagramList();
        markDirty();
    });

    ui.palette?.addEventListener("pointerdown", (ev) => {
        const item = ev.target.closest(".fm-palette-item");
        if (!item || ev.button !== 0) return;
        const type = item.dataset.type;
        if (!type) return;
        setTool("place", type);
        palettePlace = { type, armed: true, placed: false };
        ev.preventDefault();
    });

    ui.diagramList.addEventListener("click", (ev) => {
        const item = ev.target.closest(".fm-diagram-item");
        if (!item) return;
        if (item.dataset.id === diagram.id) return;
        switchDiagram(item.dataset.id);
    });

    window.addEventListener("beforeunload", () => {
        flushAutoSave();
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushAutoSave();
    });

    // boot
    updateUndoButtons();
    updateToolUi();
    renderDiagramList();
    applyCamera();
    scheduleRender();
    refreshProps();
    ui.setStatus?.("Ready", "saved");

    return {
        persist,
        fitView,
        getDiagram: () => diagram,
        destroy() {
            if (autoSaveTimer) clearTimeout(autoSaveTimer);
            remoteDriver?.dispose();
        },
    };
}

export { FILL_SWATCHES as SWATCHES, FILL_SWATCHES, STROKE_SWATCHES };
