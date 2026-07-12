/**
 * Alysum Plotweave — canvas engine (SVG flowchart / process map).
 */

import {
    createPlotweaveSupabaseDriver,
    isSampleOnlyStore,
    PLOTWEAVE_SALVAGE_URL,
    storeHasRealMaps,
} from "./plotweave-supabase.js?v=4";

export const PLOTWEAVE_STORAGE_KEY = "alysum-plotweave-v1";
const STORAGE_KEY = PLOTWEAVE_STORAGE_KEY;
const BACKUP_STORAGE_KEY = "alysum-plotweave-v1-backup";
const LEGACY_STORAGE_KEY = "alysum-flow-mapper-v1";
const MAX_HISTORY = 60;

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

const SWATCHES = [
    "#1e1b4b",
    "#14532d",
    "#422006",
    "#4c0519",
    "#0c4a6e",
    "#1e293b",
    "#312e81",
    "#3b0764",
];

function uid(prefix = "n") {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function parseStore(raw) {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.diagrams)) return null;
        for (const d of parsed.diagrams) {
            if (d.view && !d.camera) {
                d.camera = {
                    x: Number(d.view.x) || 0,
                    y: Number(d.view.y) || 0,
                    zoom: Number(d.view.scale ?? d.view.zoom) || 1,
                };
            }
            if (!d.camera) d.camera = { x: 0, y: 0, zoom: 1 };
        }
        return parsed;
    } catch {
        return null;
    }
}

function loadBackupStore() {
    for (const key of [BACKUP_STORAGE_KEY, `${STORAGE_KEY}-prev`, LEGACY_STORAGE_KEY]) {
        const parsed = parseStore(localStorage.getItem(key));
        if (parsed?.diagrams?.length) return parsed;
    }
    return null;
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
        let store = parseStore(raw);
        if (!store) {
            store = loadBackupStore();
            if (store) {
                saveStore(store);
                return store;
            }
            return { diagrams: [], activeId: null };
        }
        if (store.diagrams.length === 0) {
            const backup = loadBackupStore();
            if (backup) {
                saveStore(backup);
                return backup;
            }
        }
        return store;
    } catch {
        const backup = loadBackupStore();
        return backup || { diagrams: [], activeId: null };
    }
}

function saveStore(store) {
    const json = JSON.stringify(store);
    try {
        const prev = localStorage.getItem(STORAGE_KEY);
        if (prev) localStorage.setItem(BACKUP_STORAGE_KEY, prev);
    } catch {
        /* ignore quota */
    }
    localStorage.setItem(STORAGE_KEY, json);
}

function pruneEmptyDiagrams(store) {
    const diagrams = (store.diagrams || []).filter((d) => (d.nodes?.length || 0) > 0);
    let activeId = store.activeId;
    if (!diagrams.some((d) => d.id === activeId)) {
        activeId = diagrams[0]?.id ?? null;
    }
    return { diagrams, activeId };
}

async function fetchSalvageStore() {
    try {
        const res = await fetch(PLOTWEAVE_SALVAGE_URL, { cache: "no-store" });
        if (!res.ok) return null;
        return parseStore(await res.text());
    } catch {
        return null;
    }
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

function nodeSize(node) {
    const def = SHAPE_DEFS[node.type] || SHAPE_DEFS.process;
    return { w: node.w || def.w, h: node.h || def.h };
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
    if (isSampleOnlyStore(store)) {
        store = { diagrams: [], activeId: null };
    }
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
                store = next;
            },
            saveStore,
            loadBackup: loadBackupStore,
            refresh: () => {},
            setStatus: ui.setStatus,
        });
        await remoteDriver.pullOnce();
    }

    store = pruneEmptyDiagrams(store);

    if (!storeHasRealMaps(store)) {
        const backup = loadBackupStore();
        if (storeHasRealMaps(backup)) {
            store = pruneEmptyDiagrams(backup);
            saveStore(store);
        }
    }

    let recoveredFromSalvage = false;
    if (!storeHasRealMaps(store)) {
        const salvage = await fetchSalvageStore();
        if (storeHasRealMaps(salvage)) {
            store = pruneEmptyDiagrams(salvage);
            saveStore(store);
            recoveredFromSalvage = true;
            if (remoteDriver) {
                try {
                    await remoteDriver.pushNow();
                } catch (e) {
                    console.error("Salvage cloud save:", e);
                }
            }
        }
    }

    if (!store.diagrams.length) {
        const d = emptyDiagram("Untitled map");
        store.diagrams = [d];
        store.activeId = d.id;
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
        scheduleRender();
        if (opts.refreshProps) refreshProps();
    }

    function persist(silent = false) {
        diagram.updatedAt = Date.now();
        const idx = store.diagrams.findIndex((d) => d.id === diagram.id);
        if (idx >= 0) store.diagrams[idx] = diagram;
        else store.diagrams.push(diagram);
        store.activeId = diagram.id;
        writeStore();
        dirty = false;
        if (!silent) ui.setStatus?.(remoteDriver ? "Saved" : "Saved locally", "saved");
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
        ui.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    }

    function setZoom(next, centerClient) {
        const z0 = diagram.camera.zoom;
        const z1 = clamp(next, 0.25, 2.5);
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
        persist(true);
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
        const zoom = clamp(Math.min(rect.width / bw, rect.height / bh), 0.35, 1.4);
        diagram.camera.zoom = zoom;
        diagram.camera.x = (rect.width - bw * zoom) / 2 - (minX - pad) * zoom;
        diagram.camera.y = (rect.height - bh * zoom) / 2 - (minY - pad) * zoom;
        applyCamera();
        persist(true);
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
            panel.innerHTML = `
                <div class="fm-field">
                    <label>Text</label>
                    <textarea id="fmPropText">${escapeXml(n.text || "")}</textarea>
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
                        ${SWATCHES.map(
                            (c) =>
                                `<button type="button" class="fm-swatch${(n.fill || def.fill) === c ? " is-active" : ""}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`
                        ).join("")}
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
            panel.querySelector("#fmPropType").addEventListener("change", (ev) => {
                pushHistory();
                const t = ev.target.value;
                n.type = t;
                const d = SHAPE_DEFS[t];
                n.w = d.w;
                n.h = d.h;
                if (!n.fill) n.fill = d.fill;
                n.stroke = d.stroke;
                markDirty({ refreshProps: true });
            });
            panel.querySelector("#fmPropFill").addEventListener("click", (ev) => {
                const btn = ev.target.closest(".fm-swatch");
                if (!btn) return;
                pushHistory();
                n.fill = btn.dataset.color;
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
        pushHistory();
        const node = {
            id: uid("n"),
            type,
            x: wx - def.w / 2,
            y: wy - def.h / 2,
            text: def.defaultText,
            fill: def.fill,
            stroke: def.stroke,
            w: def.w,
            h: def.h,
        };
        diagram.nodes.push(node);
        selectedIds = new Set([node.id]);
        selectedEdgeId = null;
        placeType = null;
        tool = "select";
        updateToolUi();
        markDirty({ refreshProps: true });
    }

    function setTool(next, type = null) {
        tool = next;
        placeType = type;
        connecting = null;
        updateToolUi();
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
        if (dirty) persist(true);
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
        if (dirty) persist(true);
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
        if (dirty) persist(true);
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
            return;
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
        if (drag.mode === "lasso" && lasso) {
            lasso.x1 = worldPt.x;
            lasso.y1 = worldPt.y;
            scheduleRender();
        }
    }

    function onPointerUp(ev) {
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
            persist(true);
            svg.classList.toggle("is-panning", tool === "pan" || spaceDown);
        }
        if (drag.mode === "move" && drag.moved) persist(true);
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
        dirty = true;
        ui.setStatus?.("Unsaved changes", "dirty");
        renderDiagramList();
    });
    ui.titleInput.addEventListener("change", () => persist());

    ui.palette?.addEventListener("click", (ev) => {
        const item = ev.target.closest(".fm-palette-item");
        if (!item) return;
        setTool("place", item.dataset.type);
    });

    ui.diagramList.addEventListener("click", (ev) => {
        const item = ev.target.closest(".fm-diagram-item");
        if (!item) return;
        if (item.dataset.id === diagram.id) return;
        switchDiagram(item.dataset.id);
    });

    // auto-save
    setInterval(() => {
        if (dirty) persist(true);
    }, 8000);

    window.addEventListener("beforeunload", () => {
        if (dirty) persist(true);
    });

    // boot
    updateUndoButtons();
    updateToolUi();
    renderDiagramList();
    applyCamera();
    scheduleRender();
    refreshProps();
    if (recoveredFromSalvage && diagram.nodes?.length) {
        fitView();
        ui.setStatus?.("Recovered your Cyrene RPG map", "saved");
    } else {
        ui.setStatus?.("Ready", "saved");
    }

    return {
        persist,
        fitView,
        getDiagram: () => diagram,
        destroy() {
            remoteDriver?.dispose();
        },
    };
}

export { SWATCHES };
