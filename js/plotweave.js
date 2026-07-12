/**
 * Plotweave — iGrafx-style SVG flowchart editor.
 */

import { PLOTWEAVE_TEMPLATES, buildDiagramFromTemplate } from "./plotweave-templates.js";

export const STORAGE_KEY = "alysum-plotweave-v2";

const MAX_HISTORY = 50;
const GRID = 12;
const MIN_NODE = 48;

/** Alysum flowchart palette — readable on the dark studio canvas. */
const SHAPES = {
    start: { label: "Start", w: 140, h: 56, text: "Start", fill: "#14532d", stroke: "#4ade80" },
    process: { label: "Process", w: 168, h: 72, text: "Process", fill: "#1e1b4b", stroke: "#a78bfa" },
    box: { label: "Activity", w: 160, h: 72, text: "Activity", fill: "#1e293b", stroke: "#cbd5e1" },
    decision: { label: "Decision", w: 150, h: 100, text: "Decision?", fill: "#422006", stroke: "#fbbf24" },
    data: { label: "Document", w: 160, h: 72, text: "Document", fill: "#0c4a6e", stroke: "#38bdf8" },
    note: { label: "Note", w: 160, h: 80, text: "Note", fill: "#1e293b", stroke: "#94a3b8" },
    end: { label: "End", w: 140, h: 56, text: "End", fill: "#4c0519", stroke: "#fb7185" },
};

/** Quick fill + border combos for the Properties panel. */
const COLOR_PRESETS = [
    { label: "Purple", fill: "#1e1b4b", stroke: "#a78bfa" },
    { label: "Violet", fill: "#4c1d95", stroke: "#c4b5fd" },
    { label: "Indigo", fill: "#312e81", stroke: "#818cf8" },
    { label: "Lavender", fill: "#3b0764", stroke: "#e9d5ff" },
    { label: "Pink", fill: "#500724", stroke: "#f472b6" },
    { label: "Rose", fill: "#4c0519", stroke: "#fb7185" },
    { label: "Coral", fill: "#7f1d1d", stroke: "#fca5a5" },
    { label: "Red", fill: "#450a0a", stroke: "#f87171" },
    { label: "Orange", fill: "#7c2d12", stroke: "#fb923c" },
    { label: "Amber", fill: "#78350f", stroke: "#fbbf24" },
    { label: "Gold", fill: "#422006", stroke: "#fcd34d" },
    { label: "Yellow", fill: "#713f12", stroke: "#fde047" },
    { label: "Lime", fill: "#365314", stroke: "#a3e635" },
    { label: "Green", fill: "#14532d", stroke: "#4ade80" },
    { label: "Forest", fill: "#052e16", stroke: "#86efac" },
    { label: "Teal", fill: "#134e4a", stroke: "#2dd4bf" },
    { label: "Cyan", fill: "#164e63", stroke: "#22d3ee" },
    { label: "Sky", fill: "#0c4a6e", stroke: "#38bdf8" },
    { label: "Blue", fill: "#1e3a8a", stroke: "#60a5fa" },
    { label: "Navy", fill: "#172554", stroke: "#93c5fd" },
    { label: "Slate", fill: "#1e293b", stroke: "#cbd5e1" },
    { label: "Stone", fill: "#292524", stroke: "#d6d3d1" },
    { label: "Neutral", fill: "#334155", stroke: "#94a3b8" },
    { label: "Charcoal", fill: "#18181b", stroke: "#a1a1aa" },
    { label: "Light", fill: "#f8fafc", stroke: "#475569" },
    { label: "Cream", fill: "#fffbeb", stroke: "#a8a29e" },
    { label: "Mint", fill: "#ecfdf5", stroke: "#059669" },
    { label: "Ice", fill: "#eff6ff", stroke: "#2563eb" },
    { label: "Dark", fill: "#0f172a", stroke: "#e2e8f0" },
    { label: "Midnight", fill: "#020617", stroke: "#94a3b8" },
];

const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const clone = (v) => JSON.parse(JSON.stringify(v));
const snap = (n) => Math.round(n / GRID) * GRID;

function colorInputValue(hex) {
    const h = String(hex || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(h)) return h.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(h)) {
        const [, a, b, c] = h;
        return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
    }
    return "#1e293b";
}

function renderColorSwatches(activeFill, activeStroke) {
    return COLOR_PRESETS.map((p) => {
        const on = p.fill === activeFill && p.stroke === activeStroke;
        return `<button type="button" class="pw-color-swatch${on ? " is-active" : ""}" data-fill="${p.fill}" data-stroke="${p.stroke}" title="${esc(p.label)}">
            <span class="pw-color-swatch-fill" style="background:${p.fill}"></span>
            <span class="pw-color-swatch-stroke" style="background:${p.stroke}"></span>
        </button>`;
    }).join("");
}

export function loadStore() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { diagrams: [], activeId: null };
        const parsed = JSON.parse(raw);
        if (!parsed?.diagrams || !Array.isArray(parsed.diagrams)) return { diagrams: [], activeId: null };
        return { diagrams: parsed.diagrams, activeId: parsed.activeId ?? null };
    } catch {
        return { diagrams: [], activeId: null };
    }
}

export function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function newDiagram(title = "Untitled map") {
    const t = Date.now();
    return {
        id: uid("map"),
        title,
        createdAt: t,
        updatedAt: t,
        nodes: [],
        edges: [],
        camera: { x: 40, y: 40, zoom: 1 },
    };
}

function nodeSize(n) {
    return { w: n.w || SHAPES[n.type]?.w || 132, h: n.h || SHAPES[n.type]?.h || 60 };
}

function portPoint(node, port) {
    const { w, h } = nodeSize(node);
    const cx = node.x + w / 2;
    const cy = node.y + h / 2;
    if (node.type === "decision") {
        if (port === "n") return { x: cx, y: node.y };
        if (port === "e") return { x: node.x + w, y: cy };
        if (port === "s") return { x: cx, y: node.y + h };
        return { x: node.x, y: cy };
    }
    if (port === "n") return { x: cx, y: node.y };
    if (port === "e") return { x: node.x + w, y: cy };
    if (port === "s") return { x: cx, y: node.y + h };
    return { x: node.x, y: cy };
}

function shapePath(type, w, h) {
    if (type === "start" || type === "end") {
        const r = Math.min(h / 2, 24);
        return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    }
    if (type === "decision") {
        const cx = w / 2;
        const cy = h / 2;
        return `M ${cx} 0 L ${w} ${cy} L ${cx} ${h} L 0 ${cy} Z`;
    }
    if (type === "data") {
        const wave = 8;
        const base = h - wave;
        return `M 0 0 H ${w} V ${base} Q ${w * 0.75} ${h} ${w * 0.5} ${base} Q ${w * 0.25} ${h - wave * 2} 0 ${base} Z`;
    }
    if (type === "note") {
        const fold = 12;
        return `M 0 0 H ${w - fold} L ${w} ${fold} V ${h} H 0 Z`;
    }
    const r = type === "process" ? 6 : 2;
    return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
}

/** Orthogonal (elbow) connector routing — iGrafx style. */
function edgeSegments(from, to, fromPort, toPort) {
    const a = portPoint(from, fromPort);
    const b = portPoint(to, toPort);
    const stub = 24;
    const ea = { ...a };
    const eb = { ...b };

    if (fromPort === "e") ea.x += stub;
    else if (fromPort === "w") ea.x -= stub;
    else if (fromPort === "s") ea.y += stub;
    else ea.y -= stub;

    if (toPort === "e") eb.x += stub;
    else if (toPort === "w") eb.x -= stub;
    else if (toPort === "s") eb.y += stub;
    else eb.y -= stub;

    const pts = [a, ea];

    if (fromPort === "e" || fromPort === "w") {
        const midX = (ea.x + eb.x) / 2;
        pts.push({ x: midX, y: ea.y }, { x: midX, y: eb.y });
    } else {
        const midY = (ea.y + eb.y) / 2;
        pts.push({ x: ea.x, y: midY }, { x: eb.x, y: midY });
    }

    pts.push(eb, b);
    return pts;
}

function edgePathD(segments) {
    if (!segments.length) return "";
    const [first, ...rest] = segments;
    return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(" ")}`;
}

function edgeMidpoint(segments) {
    if (segments.length < 2) return segments[0] || { x: 0, y: 0 };
    const midIdx = Math.floor((segments.length - 1) / 2);
    const p0 = segments[midIdx];
    const p1 = segments[midIdx + 1];
    return { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
}

function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (!len2) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function esc(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function wrapText(text, maxChars = 18) {
    const words = String(text || "").split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (next.length > maxChars && line) {
            lines.push(line);
            line = w;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
}

/**
 * @param {object} ui
 */
export function createPlotweave(ui) {
    let store = loadStore();
    /** @type {ReturnType<typeof newDiagram> | null} */
    let map = null;
    let tool = "select";
    let placeType = null;
    let dirty = false;
    let history = [];
    let future = [];
    let selectedNodeIds = new Set();
    let selectedEdgeId = null;
    let drag = null;
    let connect = null;
    let spaceDown = false;

    const svg = ui.stage;
    const gEdges = svg.querySelector(".pw-edges");
    const gNodes = svg.querySelector(".pw-nodes");
    const gOverlay = svg.querySelector(".pw-overlay");

    function attachMap() {
        if (!store.diagrams.length) {
            map = null;
            return;
        }
        map = store.diagrams.find((d) => d.id === store.activeId) || store.diagrams[0];
        store.activeId = map.id;
    }

    attachMap();

    function ensureMap() {
        if (map) return map;
        const d = newDiagram();
        store.diagrams.unshift(d);
        store.activeId = d.id;
        map = d;
        saveStore(store);
        renderMapList();
        ui.onPersist?.();
        return map;
    }

    function setStatus(text, kind) {
        ui.setStatus?.(text, kind);
    }

    function markDirty() {
        dirty = true;
        setStatus("Unsaved changes", "dirty");
        render();
        ui.onPersist?.();
    }

    function persist(silent = false) {
        if (!map) return;
        map.updatedAt = Date.now();
        const i = store.diagrams.findIndex((d) => d.id === map.id);
        if (i >= 0) store.diagrams[i] = map;
        else store.diagrams.unshift(map);
        store.activeId = map.id;
        saveStore(store);
        dirty = false;
        if (!silent) setStatus("Saved", "saved");
        renderMapList();
        ui.onPersist?.();
    }

    function pushHistory() {
        if (!map) return;
        history.push(clone({ nodes: map.nodes, edges: map.edges }));
        if (history.length > MAX_HISTORY) history.shift();
        future = [];
        ui.btnUndo.disabled = !history.length;
        ui.btnRedo.disabled = !future.length;
    }

    function undo() {
        if (!map || !history.length) return;
        future.push(clone({ nodes: map.nodes, edges: map.edges }));
        const prev = history.pop();
        map.nodes = prev.nodes;
        map.edges = prev.edges;
        selectedNodeIds.clear();
        selectedEdgeId = null;
        markDirty();
        ui.btnUndo.disabled = !history.length;
        ui.btnRedo.disabled = !future.length;
        refreshProps();
    }

    function redo() {
        if (!map || !future.length) return;
        history.push(clone({ nodes: map.nodes, edges: map.edges }));
        const next = future.pop();
        map.nodes = next.nodes;
        map.edges = next.edges;
        selectedNodeIds.clear();
        selectedEdgeId = null;
        markDirty();
        ui.btnUndo.disabled = !history.length;
        ui.btnRedo.disabled = !future.length;
        refreshProps();
    }

    function toWorld(clientX, clientY) {
        const r = svg.getBoundingClientRect();
        const z = map?.camera.zoom ?? 1;
        const cam = map?.camera ?? { x: 0, y: 0 };
        return { x: (clientX - r.left - cam.x) / z, y: (clientY - r.top - cam.y) / z };
    }

    function applyCamera() {
        if (!map) return;
        const world = svg.querySelector(".pw-world");
        const { x, y, zoom } = map.camera;
        world.setAttribute("transform", `translate(${x} ${y}) scale(${zoom})`);
        ui.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    }

    function setZoom(next, center) {
        if (!map) return;
        const z0 = map.camera.zoom;
        const z1 = clamp(next, 0.25, 2.5);
        if (center) {
            const r = svg.getBoundingClientRect();
            const sx = center.x - r.left;
            const sy = center.y - r.top;
            const wx = (sx - map.camera.x) / z0;
            const wy = (sy - map.camera.y) / z0;
            map.camera.zoom = z1;
            map.camera.x = sx - wx * z1;
            map.camera.y = sy - wy * z1;
        } else {
            map.camera.zoom = z1;
        }
        applyCamera();
        persist(true);
    }

    function fitView() {
        if (!map || !map.nodes.length) {
            if (map) map.camera = { x: 40, y: 40, zoom: 1 };
            applyCamera();
            return;
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of map.nodes) {
            const { w, h } = nodeSize(n);
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + w);
            maxY = Math.max(maxY, n.y + h);
        }
        const pad = 64;
        const r = svg.getBoundingClientRect();
        const bw = maxX - minX + pad * 2;
        const bh = maxY - minY + pad * 2;
        const zoom = clamp(Math.min(r.width / bw, r.height / bh), 0.4, 1.25);
        map.camera.zoom = zoom;
        map.camera.x = (r.width - bw * zoom) / 2 - (minX - pad) * zoom;
        map.camera.y = (r.height - bh * zoom) / 2 - (minY - pad) * zoom;
        applyCamera();
        persist(true);
    }

    function hitNode(wx, wy) {
        if (!map) return null;
        for (let i = map.nodes.length - 1; i >= 0; i--) {
            const n = map.nodes[i];
            const { w, h } = nodeSize(n);
            if (wx >= n.x && wx <= n.x + w && wy >= n.y && wy <= n.y + h) return n;
        }
        return null;
    }

    function hitEdge(wx, wy) {
        if (!map) return null;
        const thresh = 8 / (map.camera.zoom || 1);
        for (const e of map.edges) {
            const a = map.nodes.find((n) => n.id === e.from);
            const b = map.nodes.find((n) => n.id === e.to);
            if (!a || !b) continue;
            const segs = edgeSegments(a, b, e.fromPort || "e", e.toPort || "w");
            for (let i = 0; i < segs.length - 1; i++) {
                const p0 = segs[i];
                const p1 = segs[i + 1];
                if (distToSeg(wx, wy, p0.x, p0.y, p1.x, p1.y) <= thresh) return e;
            }
        }
        return null;
    }

    function hitPort(node, wx, wy) {
        for (const port of ["n", "e", "s", "w"]) {
            const p = portPoint(node, port);
            if (Math.hypot(wx - p.x, wy - p.y) <= 10 / (map.camera.zoom || 1)) return port;
        }
        return null;
    }

    function setTool(next, shapeType = null) {
        tool = next;
        placeType = shapeType;
        svg.dataset.tool = next === "place" ? "place" : next === "pan" ? "pan" : "select";
        ui.btnSelect.classList.toggle("is-active", next === "select");
        ui.btnPan.classList.toggle("is-active", next === "pan");
        ui.btnConnect.classList.toggle("is-active", next === "connect");
        for (const btn of ui.palette.querySelectorAll(".pw-stencil-item")) {
            btn.classList.toggle("is-active", next === "place" && btn.dataset.type === shapeType);
        }
    }

    function addNode(type, x, y) {
        const def = SHAPES[type] || SHAPES.box;
        const m = ensureMap();
        pushHistory();
        const n = {
            id: uid("n"),
            type,
            x: snap(x - def.w / 2),
            y: snap(y - def.h / 2),
            w: def.w,
            h: def.h,
            text: def.text,
            fill: def.fill,
            stroke: def.stroke,
        };
        m.nodes.push(n);
        selectedNodeIds = new Set([n.id]);
        selectedEdgeId = null;
        markDirty();
        refreshProps();
        ui.stage.focus();
    }

    function deleteSelection() {
        if (!map) return;
        pushHistory();
        if (selectedEdgeId) {
            map.edges = map.edges.filter((e) => e.id !== selectedEdgeId);
            selectedEdgeId = null;
        } else if (selectedNodeIds.size) {
            const ids = selectedNodeIds;
            map.nodes = map.nodes.filter((n) => !ids.has(n.id));
            map.edges = map.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to));
            selectedNodeIds.clear();
        }
        markDirty();
        refreshProps();
    }

    function updateEmptyOverlay() {
        if (!ui.empty) return;
        if (map) {
            ui.empty.classList.add("is-hidden");
            return;
        }
        ui.empty.classList.remove("is-hidden");
    }

    function renderMapList() {
        ui.mapList.innerHTML = store.diagrams
            .map((d) => {
                const active = map && d.id === map.id;
                const when = new Date(d.updatedAt).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                });
                return `<button type="button" class="pw-map-item${active ? " is-active" : ""}" data-id="${d.id}">
                    <strong>${esc(d.title || "Untitled")}</strong>
                    <span>${when} · ${d.nodes?.length || 0} shapes</span>
                </button>`;
            })
            .join("");
    }

    function nodeTextSvg(n, w, h) {
        const lines = wrapText(n.text, Math.floor(w / 8));
        const lineH = 14;
        const startY = h / 2 - ((lines.length - 1) * lineH) / 2;
        return lines.map((line, i) =>
            `<text class="pw-node-text" x="${w / 2}" y="${startY + i * lineH}" text-anchor="middle" dominant-baseline="middle">${esc(line)}</text>`
        ).join("");
    }

    function render() {
        if (!map) {
            gNodes.innerHTML = "";
            gEdges.innerHTML = "";
            gOverlay.innerHTML = "";
            ui.titleInput.value = "";
            updateEmptyOverlay();
            return;
        }

        updateEmptyOverlay();
        ui.titleInput.value = map.title || "";

        gEdges.innerHTML = map.edges.map((e) => {
            const a = map.nodes.find((n) => n.id === e.from);
            const b = map.nodes.find((n) => n.id === e.to);
            if (!a || !b) return "";
            const segs = edgeSegments(a, b, e.fromPort || "e", e.toPort || "w");
            const d = edgePathD(segs);
            const sel = e.id === selectedEdgeId;
            const mid = edgeMidpoint(segs);
            const label = e.label
                ? (() => {
                    const lw = Math.max(36, e.label.length * 7 + 12);
                    return `<g class="pw-edge-label">
                    <rect class="pw-edge-label-bg" x="${mid.x - lw / 2}" y="${mid.y - 16}" width="${lw}" height="16" rx="4"/>
                    <text class="pw-edge-label-text" x="${mid.x}" y="${mid.y - 6}" text-anchor="middle">${esc(e.label)}</text>
                   </g>`;
                })()
                : "";
            return `<g class="pw-edge${sel ? " is-selected" : ""}" data-id="${e.id}">
                <path d="${d}" fill="none" stroke="${sel ? "#fbbf24" : "rgba(196,181,253,0.85)"}" stroke-width="${sel ? 2.5 : 1.75}" marker-end="url(#pwArrow)"/>
                ${label}
            </g>`;
        }).join("");

        gNodes.innerHTML = map.nodes.map((n) => {
            const { w, h } = nodeSize(n);
            const sel = selectedNodeIds.has(n.id);
            const path = shapePath(n.type, w, h);
            const stroke = sel ? "#fbbf24" : n.stroke;
            const sw = sel ? 2.5 : 1.75;
            const rel = { ...n, x: 0, y: 0 };
            const ports = ["n", "e", "s", "w"].map((port) => {
                const p = portPoint(rel, port);
                return `<circle class="pw-port" data-node="${n.id}" data-port="${port}" cx="${p.x}" cy="${p.y}" r="5"/>`;
            }).join("");
            const handles = sel ? `
                <rect class="pw-handle" data-handle="nw" x="-4" y="-4" width="8" height="8"/>
                <rect class="pw-handle" data-handle="ne" x="${w - 4}" y="-4" width="8" height="8"/>
                <rect class="pw-handle" data-handle="se" x="${w - 4}" y="${h - 4}" width="8" height="8"/>
                <rect class="pw-handle" data-handle="sw" x="-4" y="${h - 4}" width="8" height="8"/>
            ` : "";
            return `<g class="pw-node${sel ? " is-selected" : ""}" data-id="${n.id}" transform="translate(${n.x} ${n.y})">
                <g filter="url(#pwShadow)">
                    <path d="${path}" fill="${n.fill}" stroke="${stroke}" stroke-width="${sw}"/>
                    ${nodeTextSvg(n, w, h)}
                </g>
                ${ports}
                ${handles}
            </g>`;
        }).join("");

        if (connect) {
            const segs = [{ x: connect.x1, y: connect.y1 }, { x: connect.x2, y: connect.y2 }];
            gOverlay.innerHTML = `<path d="${edgePathD(segs)}" fill="none" stroke="#c4b5fd" stroke-width="1.5" stroke-dasharray="5 4"/>`;
        } else {
            gOverlay.innerHTML = "";
        }
    }

    function refreshProps() {
        if (!map) {
            ui.propsBody.innerHTML = `<p class="pw-props-empty">Create a map or place a shape to begin.</p>`;
            return;
        }
        if (selectedEdgeId) {
            const e = map.edges.find((x) => x.id === selectedEdgeId);
            ui.propsBody.innerHTML = `
                <div class="pw-field"><label>Flow label</label>
                <input type="text" id="pwPropLabel" value="${esc(e?.label || "")}" placeholder="Yes / No"/></div>
                <div class="pw-label-pills">
                    <button type="button" class="pw-label-pill" data-label="Yes">Yes</button>
                    <button type="button" class="pw-label-pill" data-label="No">No</button>
                    <button type="button" class="pw-label-pill" data-label="">Clear</button>
                </div>
                <button type="button" class="pw-btn pw-btn-danger" id="pwPropDelete" style="margin-top:10px">Delete connector</button>`;
            ui.propsBody.querySelector("#pwPropLabel")?.addEventListener("input", (ev) => {
                if (!e) return;
                e.label = ev.target.value;
                markDirty();
            });
            ui.propsBody.querySelectorAll(".pw-label-pill").forEach((btn) => {
                btn.addEventListener("click", () => {
                    if (!e) return;
                    e.label = btn.dataset.label || "";
                    markDirty();
                    refreshProps();
                });
            });
            ui.propsBody.querySelector("#pwPropDelete")?.addEventListener("click", deleteSelection);
            return;
        }
        if (selectedNodeIds.size === 1) {
            const id = [...selectedNodeIds][0];
            const n = map.nodes.find((x) => x.id === id);
            if (!n) return;
            const def = SHAPES[n.type] || SHAPES.box;
            ui.propsBody.innerHTML = `
                <div class="pw-field"><label>Name</label>
                <textarea id="pwPropText">${esc(n.text)}</textarea></div>
                <div class="pw-field-row">
                    <div class="pw-field"><label>Width</label><input type="number" id="pwPropW" min="${MIN_NODE}" value="${nodeSize(n).w}"/></div>
                    <div class="pw-field"><label>Height</label><input type="number" id="pwPropH" min="${MIN_NODE}" value="${nodeSize(n).h}"/></div>
                </div>
                <div class="pw-field"><label>Color presets</label>
                <div class="pw-color-swatches" id="pwColorSwatches">${renderColorSwatches(n.fill, n.stroke)}</div></div>
                <div class="pw-field-row">
                    <div class="pw-field"><label>Fill</label><input type="color" id="pwPropFill" value="${colorInputValue(n.fill)}"/></div>
                    <div class="pw-field"><label>Border</label><input type="color" id="pwPropStroke" value="${colorInputValue(n.stroke)}"/></div>
                </div>
                <button type="button" class="pw-btn" id="pwPropResetColors" style="width:100%;margin-bottom:8px">Reset ${esc(def.label)} colors</button>
                <button type="button" class="pw-btn pw-btn-danger" id="pwPropDelete">Delete shape</button>`;

            const applyColors = (fill, stroke) => {
                n.fill = fill;
                n.stroke = stroke;
                markDirty();
                const fillEl = ui.propsBody.querySelector("#pwPropFill");
                const strokeEl = ui.propsBody.querySelector("#pwPropStroke");
                if (fillEl) fillEl.value = colorInputValue(fill);
                if (strokeEl) strokeEl.value = colorInputValue(stroke);
                ui.propsBody.querySelectorAll(".pw-color-swatch").forEach((btn) => {
                    btn.classList.toggle("is-active", btn.dataset.fill === fill && btn.dataset.stroke === stroke);
                });
            };

            ui.propsBody.querySelector("#pwPropText")?.addEventListener("input", (ev) => {
                n.text = ev.target.value;
                markDirty();
            });
            const resize = () => {
                n.w = clamp(Number(ui.propsBody.querySelector("#pwPropW").value) || n.w, MIN_NODE, 480);
                n.h = clamp(Number(ui.propsBody.querySelector("#pwPropH").value) || n.h, MIN_NODE, 320);
                markDirty();
            };
            ui.propsBody.querySelector("#pwPropW")?.addEventListener("change", resize);
            ui.propsBody.querySelector("#pwPropH")?.addEventListener("change", resize);
            ui.propsBody.querySelector("#pwPropFill")?.addEventListener("input", (ev) => {
                applyColors(ev.target.value, n.stroke);
            });
            ui.propsBody.querySelector("#pwPropStroke")?.addEventListener("input", (ev) => {
                applyColors(n.fill, ev.target.value);
            });
            ui.propsBody.querySelectorAll(".pw-color-swatch").forEach((btn) => {
                btn.addEventListener("click", () => {
                    applyColors(btn.dataset.fill, btn.dataset.stroke);
                });
            });
            ui.propsBody.querySelector("#pwPropResetColors")?.addEventListener("click", () => {
                applyColors(def.fill, def.stroke);
            });
            ui.propsBody.querySelector("#pwPropDelete")?.addEventListener("click", deleteSelection);
            return;
        }
        ui.propsBody.innerHTML = `<p class="pw-props-empty">Select a shape or connector to edit.</p>`;
        if (!map.nodes.length && !selectedNodeIds.size && !selectedEdgeId) {
            ui.propsBody.innerHTML = `
                <p class="pw-props-empty">Your canvas is ready.</p>
                <p class="pw-hint" style="margin-top:8px">Choose a shape in the <strong>Stencil</strong> panel, then click anywhere on the grid to place it.</p>`;
        }
    }

    function switchMap(id) {
        if (dirty) persist(true);
        const next = store.diagrams.find((d) => d.id === id);
        if (!next) return;
        map = next;
        store.activeId = id;
        saveStore(store);
        selectedNodeIds.clear();
        selectedEdgeId = null;
        history = [];
        future = [];
        dirty = false;
        ui.btnUndo.disabled = true;
        ui.btnRedo.disabled = true;
        renderMapList();
        applyCamera();
        render();
        refreshProps();
        setStatus("Loaded", "saved");
    }

    function createMap(title) {
        createMapFromTemplate("blank", title);
    }

    function createMapFromTemplate(templateId, titleOverride) {
        if (dirty) persist(true);
        const d = buildDiagramFromTemplate(templateId, uid, SHAPES);
        if (titleOverride) d.title = titleOverride;
        store.diagrams.unshift(d);
        store.activeId = d.id;
        map = d;
        saveStore(store);
        selectedNodeIds.clear();
        selectedEdgeId = null;
        history = [];
        future = [];
        dirty = false;
        ui.btnUndo.disabled = true;
        ui.btnRedo.disabled = true;
        renderMapList();
        applyCamera();
        render();
        refreshProps();
        updateEmptyOverlay();
        if (map.nodes.length) {
            requestAnimationFrame(() => fitView());
        } else {
            ui.stage.focus();
            setTool("select");
        }
        setStatus(
            templateId === "blank"
                ? "Blank map — pick a shape, click the canvas"
                : "Template added",
            "saved"
        );
        ui.onPersist?.();
        closeNewMapModal();
    }

    function renderTemplatePicker() {
        if (!ui.templateGrid) return;
        const byCategory = new Map();
        for (const t of PLOTWEAVE_TEMPLATES) {
            if (!byCategory.has(t.category)) byCategory.set(t.category, []);
            byCategory.get(t.category).push(t);
        }
        const order = ["Basic", "Story", "Chapter", "Scene", "Character", "World"];
        const cats = [...byCategory.keys()].sort((a, b) => {
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        ui.templateGrid.innerHTML = cats.map((cat) => {
            const items = byCategory.get(cat) || [];
            return `<div class="pw-template-group">
                <h4 class="pw-template-cat">${esc(cat)}</h4>
                <div class="pw-template-cards">
                ${items.map((t) => `
                    <button type="button" class="pw-template-card${t.id === "blank" ? " is-blank" : ""}" data-template="${t.id}">
                        <strong>${esc(t.id === "blank" ? "Blank map" : t.title)}</strong>
                        <span>${esc(t.description)}</span>
                        ${t.nodeCount ? `<em>${t.nodeCount} shapes</em>` : `<em>Empty</em>`}
                    </button>
                `).join("")}
                </div>
            </div>`;
        }).join("");
    }

    function openNewMapModal() {
        if (!ui.newMapModal) {
            createMapFromTemplate("blank", "Untitled map");
            return;
        }
        renderTemplatePicker();
        ui.newMapModal.hidden = false;
        ui.newMapModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("pw-modal-open");
        ui.templateGrid?.querySelector(".pw-template-card")?.focus();
    }

    function closeNewMapModal() {
        if (!ui.newMapModal) return;
        ui.newMapModal.hidden = true;
        ui.newMapModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("pw-modal-open");
    }

    function duplicateMap() {
        if (!map) return;
        if (dirty) persist(true);
        const copy = clone(map);
        copy.id = uid("map");
        copy.title = `${map.title || "Untitled"} (copy)`;
        copy.createdAt = copy.updatedAt = Date.now();
        store.diagrams.unshift(copy);
        store.activeId = copy.id;
        map = copy;
        saveStore(store);
        renderMapList();
        render();
        setStatus("Duplicated", "saved");
        ui.onPersist?.();
    }

    function deleteMap() {
        if (!map) return;
        if (store.diagrams.length <= 1) {
            map.nodes = [];
            map.edges = [];
            map.title = "Untitled map";
            pushHistory();
            markDirty();
            persist();
            return;
        }
        store.diagrams = store.diagrams.filter((d) => d.id !== map.id);
        map = store.diagrams[0];
        store.activeId = map.id;
        saveStore(store);
        selectedNodeIds.clear();
        selectedEdgeId = null;
        renderMapList();
        applyCamera();
        render();
        refreshProps();
        setStatus("Map deleted", "saved");
        ui.onPersist?.();
    }

    function reloadFromStore(nextStore) {
        store = nextStore;
        attachMap();
        selectedNodeIds.clear();
        selectedEdgeId = null;
        history = [];
        future = [];
        dirty = false;
        ui.btnUndo.disabled = true;
        ui.btnRedo.disabled = true;
        renderMapList();
        applyCamera();
        render();
        refreshProps();
    }

    svg.addEventListener("wheel", (ev) => {
        ev.preventDefault();
        if (!map) return;
        setZoom(map.camera.zoom * (ev.deltaY > 0 ? 0.92 : 1.08), { x: ev.clientX, y: ev.clientY });
    }, { passive: false });

    svg.addEventListener("pointerdown", (ev) => {
        if (tool === "place" && placeType) ensureMap();
        if (!map) return;

        svg.setPointerCapture(ev.pointerId);
        const w = toWorld(ev.clientX, ev.clientY);

        if (tool === "pan" || ev.button === 2 || (spaceDown && ev.button === 0)) {
            drag = { kind: "pan", x0: ev.clientX, y0: ev.clientY, cam: { ...map.camera } };
            return;
        }

        const handleEl = ev.target.closest?.(".pw-handle");
        if (handleEl && selectedNodeIds.size === 1) {
            const id = [...selectedNodeIds][0];
            const n = map.nodes.find((x) => x.id === id);
            if (n) {
                pushHistory();
                drag = { kind: "resize", id, corner: handleEl.dataset.handle, x0: w.x, y0: w.y, orig: { ...n, ...nodeSize(n) } };
            }
            return;
        }

        const portEl = ev.target.closest?.(".pw-port");
        if (portEl && (tool === "connect" || tool === "select")) {
            const node = map.nodes.find((n) => n.id === portEl.dataset.node);
            if (node) {
                const p = portPoint(node, portEl.dataset.port);
                connect = { fromId: node.id, fromPort: portEl.dataset.port, x1: p.x, y1: p.y, x2: w.x, y2: w.y };
                render();
            }
            return;
        }

        if (tool === "place" && placeType) {
            addNode(placeType, w.x, w.y);
            setTool("select");
            return;
        }

        const edge = hitEdge(w.x, w.y);
        if (edge && tool !== "pan") {
            selectedEdgeId = edge.id;
            selectedNodeIds.clear();
            refreshProps();
            render();
            return;
        }

        const node = hitNode(w.x, w.y);
        if (node) {
            selectedNodeIds = new Set([node.id]);
            selectedEdgeId = null;
            drag = { kind: "node", id: node.id, x0: w.x, y0: w.y, ox: node.x, oy: node.y };
            refreshProps();
            render();
            return;
        }

        selectedNodeIds.clear();
        selectedEdgeId = null;
        refreshProps();
        render();
    });

    svg.addEventListener("pointermove", (ev) => {
        if (!map) return;
        const w = toWorld(ev.clientX, ev.clientY);
        if (connect) {
            connect.x2 = w.x;
            connect.y2 = w.y;
            render();
            return;
        }
        if (!drag) return;

        if (drag.kind === "pan") {
            map.camera.x = drag.cam.x + (ev.clientX - drag.x0);
            map.camera.y = drag.cam.y + (ev.clientY - drag.y0);
            applyCamera();
            return;
        }

        if (drag.kind === "resize") {
            const n = map.nodes.find((x) => x.id === drag.id);
            if (!n) return;
            const o = drag.orig;
            let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
            if (drag.corner.includes("e")) nw = Math.max(MIN_NODE, snap(w.x - o.x));
            if (drag.corner.includes("s")) nh = Math.max(MIN_NODE, snap(w.y - o.y));
            if (drag.corner.includes("w")) {
                nw = Math.max(MIN_NODE, snap(o.x + o.w - w.x));
                nx = snap(o.x + o.w - nw);
            }
            if (drag.corner.includes("n")) {
                nh = Math.max(MIN_NODE, snap(o.y + o.h - w.y));
                ny = snap(o.y + o.h - nh);
            }
            n.x = nx; n.y = ny; n.w = nw; n.h = nh;
            markDirty();
            return;
        }

        if (drag.kind === "node") {
            const n = map.nodes.find((x) => x.id === drag.id);
            if (!n) return;
            n.x = snap(drag.ox + (w.x - drag.x0));
            n.y = snap(drag.oy + (w.y - drag.y0));
            markDirty();
        }
    });

    svg.addEventListener("pointerup", (ev) => {
        if (connect && map) {
            const w = toWorld(ev.clientX, ev.clientY);
            const target = hitNode(w.x, w.y);
            const port = target ? hitPort(target, w.x, w.y) : null;
            if (target && target.id !== connect.fromId) {
                pushHistory();
                map.edges.push({
                    id: uid("e"),
                    from: connect.fromId,
                    to: target.id,
                    fromPort: connect.fromPort,
                    toPort: port || "w",
                    label: "",
                });
                markDirty();
            }
            connect = null;
            render();
        }
        if (drag?.kind === "node" || drag?.kind === "resize") persist(true);
        if (drag?.kind === "pan") persist(true);
        drag = null;
        try { svg.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    });

    svg.addEventListener("contextmenu", (ev) => ev.preventDefault());

    window.addEventListener("keydown", (ev) => {
        if (ev.target.matches("input, textarea, select")) return;
        if (ev.code === "Space") spaceDown = true;
        if (ev.key === "v" || ev.key === "V") setTool("select");
        if (ev.key === "h" || ev.key === "H") setTool("pan");
        if (ev.key === "c" || ev.key === "C") setTool("connect");
        if (ev.key === "Delete" || ev.key === "Backspace") deleteSelection();
        if (ev.ctrlKey && ev.key === "z") { ev.preventDefault(); undo(); }
        if (ev.ctrlKey && ev.key === "y") { ev.preventDefault(); redo(); }
        if (ev.ctrlKey && ev.key === "s") { ev.preventDefault(); persist(); }
    });
    window.addEventListener("keyup", (ev) => {
        if (ev.code === "Space") spaceDown = false;
    });

    ui.titleInput.addEventListener("input", () => {
        if (!map) return;
        map.title = ui.titleInput.value;
        markDirty();
        renderMapList();
    });

    ui.btnSelect.addEventListener("click", () => setTool("select"));
    ui.btnPan.addEventListener("click", () => setTool("pan"));
    ui.btnConnect.addEventListener("click", () => setTool("connect"));
    ui.btnUndo.addEventListener("click", undo);
    ui.btnRedo.addEventListener("click", redo);
    ui.btnSave.addEventListener("click", () => persist());
    ui.btnZoomIn.addEventListener("click", () => setZoom((map?.camera.zoom || 1) * 1.15));
    ui.btnZoomOut.addEventListener("click", () => setZoom((map?.camera.zoom || 1) / 1.15));
    ui.btnFit.addEventListener("click", fitView);
    ui.btnNew.addEventListener("click", () => openNewMapModal());
    ui.btnDuplicate.addEventListener("click", duplicateMap);
    ui.btnDeleteMap.addEventListener("click", deleteMap);

    ui.btnBrowseTemplates?.addEventListener("click", () => openNewMapModal());
    ui.templateClose?.addEventListener("click", () => closeNewMapModal());
    ui.templateBackdrop?.addEventListener("click", () => closeNewMapModal());
    ui.templateGrid?.addEventListener("click", (ev) => {
        const card = ev.target.closest(".pw-template-card");
        if (!card) return;
        createMapFromTemplate(card.dataset.template);
    });
    ui.newMapModal?.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") closeNewMapModal();
    });

    ui.palette.addEventListener("click", (ev) => {
        const item = ev.target.closest(".pw-stencil-item");
        if (!item) return;
        setTool("place", item.dataset.type);
    });

    ui.mapList.addEventListener("click", (ev) => {
        const item = ev.target.closest(".pw-map-item");
        if (!item || !map || item.dataset.id === map.id) return;
        switchMap(item.dataset.id);
    });

    setInterval(() => { if (dirty) persist(true); }, 10000);
    window.addEventListener("beforeunload", () => { if (dirty) persist(true); });

    setTool("select");
    renderMapList();
    applyCamera();
    render();
    refreshProps();

    return {
        getStore: () => store,
        setStore: (next) => { store = next; },
        saveStore: (next) => saveStore(next ?? store),
        reloadFromStore,
        persist,
        openNewMapModal,
        createMapFromTemplate,
    };
}
