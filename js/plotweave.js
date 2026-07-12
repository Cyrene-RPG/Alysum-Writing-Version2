/**
 * Plotweave — SVG flowchart editor (built fresh for Alysum Studio).
 */

export const STORAGE_KEY = "alysum-plotweave-v2";

const MAX_HISTORY = 50;

const SHAPES = {
    start: { label: "Start", w: 140, h: 56, text: "Start", fill: "#14532d", stroke: "#4ade80" },
    process: { label: "Process", w: 168, h: 72, text: "Step", fill: "#1e1b4b", stroke: "#a78bfa" },
    box: { label: "Box", w: 160, h: 72, text: "Box", fill: "#1e293b", stroke: "#cbd5e1" },
    decision: { label: "Decision", w: 150, h: 100, text: "Choice?", fill: "#422006", stroke: "#fbbf24" },
    data: { label: "Data", w: 160, h: 72, text: "Data", fill: "#0c4a6e", stroke: "#38bdf8" },
    note: { label: "Note", w: 160, h: 80, text: "Note", fill: "#1e293b", stroke: "#94a3b8" },
    end: { label: "End", w: 140, h: 56, text: "End", fill: "#4c0519", stroke: "#fb7185" },
};

const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const clone = (v) => JSON.parse(JSON.stringify(v));

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
        camera: { x: 48, y: 48, zoom: 1 },
    };
}

function nodeSize(n) {
    return { w: n.w || SHAPES[n.type]?.w || 160, h: n.h || SHAPES[n.type]?.h || 72 };
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
        const r = Math.min(h / 2, 28);
        return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    }
    if (type === "decision") {
        const cx = w / 2;
        const cy = h / 2;
        return `M ${cx} 0 L ${w} ${cy} L ${cx} ${h} L 0 ${cy} Z`;
    }
    if (type === "data") {
        const sl = 18;
        return `M 0 0 H ${w - sl} L ${w} ${h} H 0 Z`;
    }
    if (type === "note") {
        const fold = 14;
        return `M 0 0 H ${w - fold} L ${w} ${fold} V ${h} H 0 Z`;
    }
    const r = type === "process" ? 10 : 4;
    return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
}

function edgePath(from, to, fromPort, toPort) {
    const a = portPoint(from, fromPort);
    const b = portPoint(to, toPort);
    const mx = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
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
    const world = svg.querySelector(".pw-world");
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
            if (map) map.camera = { x: 48, y: 48, zoom: 1 };
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
        const pad = 72;
        const r = svg.getBoundingClientRect();
        const bw = maxX - minX + pad * 2;
        const bh = maxY - minY + pad * 2;
        const zoom = clamp(Math.min(r.width / bw, r.height / bh), 0.35, 1.4);
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
        const thresh = 10 / (map.camera.zoom || 1);
        for (const e of map.edges) {
            const a = map.nodes.find((n) => n.id === e.from);
            const b = map.nodes.find((n) => n.id === e.to);
            if (!a || !b) continue;
            const p1 = portPoint(a, e.fromPort || "e");
            const p2 = portPoint(b, e.toPort || "w");
            const mx = (p1.x + p2.x) / 2;
            const samples = 12;
            let prev = p1;
            for (let i = 1; i <= samples; i++) {
                const t = i / samples;
                const cx = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * mx + t * t * p2.x;
                const cy = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * ((p1.y + p2.y) / 2) + t * t * p2.y;
                if (distToSeg(wx, wy, prev.x, prev.y, cx, cy) <= thresh) return e;
                prev = { x: cx, y: cy };
            }
        }
        return null;
    }

    function hitPort(node, wx, wy) {
        for (const port of ["n", "e", "s", "w"]) {
            const p = portPoint(node, port);
            if (Math.hypot(wx - p.x, wy - p.y) <= 12 / (map.camera.zoom || 1)) return port;
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
        for (const btn of ui.palette.querySelectorAll(".pw-palette-item")) {
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
            x: x - def.w / 2,
            y: y - def.h / 2,
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
        ui.empty?.classList.add("is-hidden");
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
        if (!map.nodes.length) ui.empty?.classList.remove("is-hidden");
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

    function render() {
        if (!map) {
            gNodes.innerHTML = "";
            gEdges.innerHTML = "";
            gOverlay.innerHTML = "";
            ui.empty?.classList.remove("is-hidden");
            ui.titleInput.value = "";
            return;
        }

        ui.empty?.classList.toggle("is-hidden", map.nodes.length > 0);
        ui.titleInput.value = map.title || "";

        gEdges.innerHTML = map.edges.map((e) => {
            const a = map.nodes.find((n) => n.id === e.from);
            const b = map.nodes.find((n) => n.id === e.to);
            if (!a || !b) return "";
            const d = edgePath(a, b, e.fromPort || "e", e.toPort || "w");
            const sel = e.id === selectedEdgeId;
            const label = e.label ? `<text class="pw-edge-label" x="0" y="0">${esc(e.label)}</text>` : "";
            return `<g class="pw-edge${sel ? " is-selected" : ""}" data-id="${e.id}">
                <path d="${d}" fill="none" stroke="${sel ? "#fbbf24" : "rgba(196,181,253,0.85)"}" stroke-width="${sel ? 3 : 2}" marker-end="url(#pwArrow)"/>
                ${label}
            </g>`;
        }).join("");

        gNodes.innerHTML = map.nodes.map((n) => {
            const { w, h } = nodeSize(n);
            const sel = selectedNodeIds.has(n.id);
            const path = shapePath(n.type, w, h);
            const ports = ["n", "e", "s", "w"].map((port) => {
                const p = portPoint(n, port);
                return `<circle class="pw-port" data-node="${n.id}" data-port="${port}" cx="${p.x}" cy="${p.y}" r="5" fill="${sel ? "#fbbf24" : "#c4b5fd"}"/>`;
            }).join("");
            return `<g class="pw-node${sel ? " is-selected" : ""}" data-id="${n.id}" transform="translate(${n.x} ${n.y})">
                <path d="${path}" fill="${n.fill}" stroke="${sel ? "#fbbf24" : n.stroke}" stroke-width="${sel ? 3 : 2}"/>
                <foreignObject x="8" y="8" width="${w - 16}" height="${h - 16}">
                    <div xmlns="http://www.w3.org/1999/xhtml" class="pw-node-text">${esc(n.text)}</div>
                </foreignObject>
                ${ports}
            </g>`;
        }).join("");

        gOverlay.innerHTML = connect
            ? `<path d="M ${connect.x1} ${connect.y1} L ${connect.x2} ${connect.y2}" stroke="#c4b5fd" stroke-width="2" stroke-dasharray="6 4"/>`
            : "";

        for (const g of gEdges.querySelectorAll(".pw-edge")) {
            const e = map.edges.find((x) => x.id === g.dataset.id);
            if (!e?.label) continue;
            const a = map.nodes.find((n) => n.id === e.from);
            const b = map.nodes.find((n) => n.id === e.to);
            if (!a || !b) continue;
            const p1 = portPoint(a, e.fromPort || "e");
            const p2 = portPoint(b, e.toPort || "w");
            const t = g.querySelector(".pw-edge-label");
            if (t) {
                t.setAttribute("x", String((p1.x + p2.x) / 2));
                t.setAttribute("y", String((p1.y + p2.y) / 2 - 6));
                t.setAttribute("fill", "#e9d5ff");
                t.setAttribute("font-size", "12");
                t.setAttribute("text-anchor", "middle");
            }
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
                <div class="pw-field"><label>Connector label</label>
                <input type="text" id="pwPropLabel" value="${esc(e?.label || "")}" placeholder="Yes / No / optional"/></div>
                <button type="button" class="pw-btn pw-btn-danger" id="pwPropDelete">Delete connector</button>`;
            ui.propsBody.querySelector("#pwPropLabel")?.addEventListener("input", (ev) => {
                if (!e) return;
                e.label = ev.target.value;
                markDirty();
                render();
            });
            ui.propsBody.querySelector("#pwPropDelete")?.addEventListener("click", deleteSelection);
            return;
        }
        if (selectedNodeIds.size === 1) {
            const id = [...selectedNodeIds][0];
            const n = map.nodes.find((x) => x.id === id);
            if (!n) return;
            ui.propsBody.innerHTML = `
                <div class="pw-field"><label>Text</label>
                <textarea id="pwPropText">${esc(n.text)}</textarea></div>
                <div class="pw-field"><label>Fill</label><input type="color" id="pwPropFill" value="${n.fill}"/></div>
                <div class="pw-field"><label>Stroke</label><input type="color" id="pwPropStroke" value="${n.stroke}"/></div>
                <button type="button" class="pw-btn pw-btn-danger" id="pwPropDelete">Delete shape</button>`;
            ui.propsBody.querySelector("#pwPropText")?.addEventListener("input", (ev) => {
                n.text = ev.target.value;
                markDirty();
            });
            ui.propsBody.querySelector("#pwPropFill")?.addEventListener("input", (ev) => {
                n.fill = ev.target.value;
                markDirty();
            });
            ui.propsBody.querySelector("#pwPropStroke")?.addEventListener("input", (ev) => {
                n.stroke = ev.target.value;
                markDirty();
            });
            ui.propsBody.querySelector("#pwPropDelete")?.addEventListener("click", deleteSelection);
            return;
        }
        ui.propsBody.innerHTML = `<p class="pw-props-empty">Select a shape or connector to edit.</p>`;
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
        if (dirty) persist(true);
        const d = newDiagram(title);
        store.diagrams.unshift(d);
        store.activeId = d.id;
        map = d;
        saveStore(store);
        selectedNodeIds.clear();
        selectedEdgeId = null;
        history = [];
        future = [];
        dirty = false;
        renderMapList();
        applyCamera();
        render();
        refreshProps();
        setStatus("New map", "saved");
        ui.onPersist?.();
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

    // —— Pointer / keyboard ——
    svg.addEventListener("wheel", (ev) => {
        ev.preventDefault();
        if (!map) return;
        const delta = ev.deltaY > 0 ? 0.92 : 1.08;
        setZoom(map.camera.zoom * delta, { x: ev.clientX, y: ev.clientY });
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
        if (drag.kind === "node") {
            const n = map.nodes.find((x) => x.id === drag.id);
            if (!n) return;
            n.x = drag.ox + (w.x - drag.x0);
            n.y = drag.oy + (w.y - drag.y0);
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
        if (drag?.kind === "node") persist(true);
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
    ui.btnNew.addEventListener("click", () => createMap("Untitled map"));
    ui.btnDuplicate.addEventListener("click", duplicateMap);
    ui.btnDeleteMap.addEventListener("click", deleteMap);

    ui.palette.addEventListener("click", (ev) => {
        const item = ev.target.closest(".pw-palette-item");
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
    };
}
