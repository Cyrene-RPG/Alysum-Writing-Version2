/**
 * Obsidian-style vault graph — force-directed view of [[wikilinks]] between notes.
 */

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function hueFromString(s) {
    const str = String(s || "");
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h) % 360;
}

/**
 * @param {object} state — vault state from alysum-vault.js
 * @returns {{ nodes: object[], edges: object[] }}
 */
export function buildVaultGraph(state) {
    const items = state?.items || [];
    const notes = items.filter(i => i.type === "note");
    const titleToId = new Map();
    for (const n of notes) titleToId.set(n.name.trim().toLowerCase(), n.id);

    const folderById = new Map(items.filter(i => i.type === "folder").map(f => [f.id, f.name]));

    const nodes = notes.map(n => ({
        id: n.id,
        name: n.name,
        type: "note",
        folderId: n.parentId || null,
        folderName: n.parentId ? folderById.get(n.parentId) || null : null,
        degree: 0
    }));

    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const edgeKeys = new Set();
    const edges = [];

    for (const note of notes) {
        const content = String(note.content || "");
        WIKILINK_RE.lastIndex = 0;
        let m;
        while ((m = WIKILINK_RE.exec(content)) !== null) {
            const targetTitle = m[1].trim();
            const targetId = titleToId.get(targetTitle.toLowerCase());
            if (!targetId || targetId === note.id) continue;
            const key = `${note.id}\0${targetId}`;
            if (edgeKeys.has(key)) continue;
            edgeKeys.add(key);
            edges.push({ from: note.id, to: targetId, label: "" });
        }
    }

    for (const e of edges) {
        const a = nodeById.get(e.from);
        const b = nodeById.get(e.to);
        if (a) a.degree++;
        if (b) b.degree++;
    }

    return { nodes, edges };
}

/**
 * @param {HTMLElement} container
 * @param {{ nodes: object[], edges: object[] }} graph
 * @param {{ onNodeClick?: (id: string) => void, filter?: string }} opts
 */
export function mountVaultGraph(container, graph, opts = {}) {
    if (!container) return { destroy: () => {}, refresh: () => {} };

    let filterLower = (opts.filter || "").trim().toLowerCase();
    let graphHandle = null;

    function filteredGraph() {
        const nodes = (graph.nodes || []).map(n => ({ ...n }));
        const edges = (graph.edges || []).slice();
        if (!filterLower) return { nodes, edges };

        const matchIds = new Set(
            nodes
                .filter(n => n.name.toLowerCase().includes(filterLower))
                .map(n => n.id)
        );
        for (const e of edges) {
            if (matchIds.has(e.from)) matchIds.add(e.to);
            if (matchIds.has(e.to)) matchIds.add(e.from);
        }
        return {
            nodes: nodes.filter(n => matchIds.has(n.id)),
            edges: edges.filter(e => matchIds.has(e.from) && matchIds.has(e.to))
        };
    }

    function render() {
        graphHandle?.destroy();
        const g = filteredGraph();
        graphHandle = mountForceGraph(container, g, {
            onNodeClick: opts.onNodeClick,
            activeId: opts.activeId,
            emptyMessage:
                filterLower && g.nodes.length
                    ? "No notes match your filter."
                    : "No links yet. Type [[Note title]] in the editor to connect graph notes."
        });
    }

    render();

    return {
        destroy() {
            graphHandle?.destroy();
            container.innerHTML = "";
        },
        refresh(nextGraph, nextFilter, nextActiveId) {
            if (nextGraph) graph = nextGraph;
            if (nextFilter !== undefined) filterLower = nextFilter.trim().toLowerCase();
            if (nextActiveId !== undefined) opts.activeId = nextActiveId;
            render();
        },
        setFilter(q) {
            filterLower = (q || "").trim().toLowerCase();
            render();
        }
    };
}

/**
 * @param {HTMLElement} container
 * @param {{ nodes: object[], edges: object[] }} graph
 * @param {{ onNodeClick?: (id: string) => void, emptyMessage?: string }} opts
 */
function mountForceGraph(container, graph, opts = {}) {
    const nodes = (graph.nodes || []).map(n => ({ ...n }));
    const edges = graph.edges || [];

    if (!nodes.length) {
        container.innerHTML = `<p class="vault-graph-empty">${escapeHtml(opts.emptyMessage || "No notes to show.")}</p>`;
        return { destroy: () => {} };
    }

    const width = Math.max(container.clientWidth || 900, 720);
    const height = Math.max(container.clientHeight || 520, Math.min(680, Math.max(480, nodes.length * 28)));
    const cx = width / 2;
    const cy = height / 2;

    for (let i = 0; i < nodes.length; i++) {
        const angle = (i / nodes.length) * Math.PI * 2;
        const r = Math.min(width, height) * 0.34;
        nodes[i].x = cx + Math.cos(angle) * r + (Math.random() - 0.5) * 24;
        nodes[i].y = cy + Math.sin(angle) * r + (Math.random() - 0.5) * 24;
        nodes[i].vx = 0;
        nodes[i].vy = 0;
    }

    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const maxDegree = Math.max(1, ...nodes.map(n => n.degree || 0));

    container.innerHTML = `
        <div class="vault-graph-wrap">
            <div class="vault-graph-toolbar">
                <span class="vault-graph-stat"><strong>${nodes.length}</strong> notes · <strong>${edges.length}</strong> links</span>
                <button type="button" class="vault-graph-reset">Reset layout</button>
            </div>
            <div class="vault-graph-stage">
                <svg class="vault-graph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Notes graph">
                    <defs>
                        <marker id="vaultArrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(148,163,184,0.75)"/>
                        </marker>
                    </defs>
                    <g class="vault-graph-zoom">
                        <g class="vault-graph-edges"></g>
                        <g class="vault-graph-nodes"></g>
                    </g>
                </svg>
            </div>
            <p class="vault-graph-hint">Drag nodes to rearrange. Scroll to zoom. Click a note to open it.</p>
        </div>`;

    const svg = container.querySelector(".vault-graph-svg");
    const zoomG = container.querySelector(".vault-graph-zoom");
    const gEdges = container.querySelector(".vault-graph-edges");
    const gNodes = container.querySelector(".vault-graph-nodes");
    let raf = 0;
    let dragging = null;
    let tick = 0;
    const maxTicks = 320;
    let scale = 1;
    let panX = 0;
    let panY = 0;

    function nodeRadius(n) {
        const d = n.degree || 0;
        return 10 + (d / maxDegree) * 14;
    }

    function nodeColor(n) {
        const hue = hueFromString(n.folderId || n.id);
        const sat = n.folderId ? 62 : 48;
        const light = 42 + Math.min((n.degree || 0) * 3, 18);
        return `hsl(${hue}, ${sat}%, ${light}%)`;
    }

    function applyZoom() {
        zoomG.setAttribute("transform", `translate(${panX},${panY}) scale(${scale})`);
    }

    function renderFrame() {
        gEdges.innerHTML = edges
            .map(e => {
                const a = nodeById.get(e.from);
                const b = nodeById.get(e.to);
                if (!a || !b) return "";
                const ra = nodeRadius(a);
                const rb = nodeRadius(b);
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                const ux = dx / dist;
                const uy = dy / dist;
                const x1 = a.x + ux * ra;
                const y1 = a.y + uy * ra;
                const x2 = b.x - ux * rb;
                const y2 = b.y - uy * rb;
                return `<line class="vault-graph-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#vaultArrow)"/>`;
            })
            .join("");

        gNodes.innerHTML = nodes
            .map(n => {
                const r = nodeRadius(n);
                const fill = nodeColor(n);
                const isActive = n.id === opts.activeId;
                return `<g class="vault-graph-node${isActive ? " is-active" : ""}" data-id="${escapeHtml(n.id)}" transform="translate(${n.x},${n.y})">
                    <circle r="${r}" fill="${fill}" stroke="${isActive ? "#fbbf24" : "rgba(255,255,255,0.22)"}" stroke-width="${isActive ? 3 : 2}"/>
                    <text dy="${r + 14}" text-anchor="middle" class="vault-graph-node-label">${escapeHtml(n.name)}</text>
                </g>`;
            })
            .join("");
    }

    function simulate() {
        const repulsion = 5200;
        const attraction = edges.length ? 0.005 : 0;
        const centerPull = 0.01;

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];
                let dx = a.x - b.x;
                let dy = a.y - b.y;
                let dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                const force = repulsion / (dist * dist);
                dx = (dx / dist) * force;
                dy = (dy / dist) * force;
                a.vx += dx;
                a.vy += dy;
                b.vx -= dx;
                b.vy -= dy;
            }
        }

        for (const e of edges) {
            const a = nodeById.get(e.from);
            const b = nodeById.get(e.to);
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
            const force = dist * attraction;
            a.vx += (dx / dist) * force;
            a.vy += (dy / dist) * force;
            b.vx -= (dx / dist) * force;
            b.vy -= (dy / dist) * force;
        }

        for (const n of nodes) {
            n.vx += (cx - n.x) * centerPull;
            n.vy += (cy - n.y) * centerPull;
            n.vx *= 0.84;
            n.vy *= 0.84;
            if (dragging !== n) {
                n.x += n.vx;
                n.y += n.vy;
            }
            n.x = Math.max(30, Math.min(width - 30, n.x));
            n.y = Math.max(30, Math.min(height - 30, n.y));
        }
    }

    function loop() {
        if (tick < maxTicks && !dragging) {
            simulate();
            tick++;
        }
        renderFrame();
        raf = requestAnimationFrame(loop);
    }

    function ptFromEvent(ev) {
        const rect = svg.getBoundingClientRect();
        const scaleX = width / rect.width;
        const scaleY = height / rect.height;
        return {
            x: (ev.clientX - rect.left) * scaleX,
            y: (ev.clientY - rect.top) * scaleY
        };
    }

    gNodes.addEventListener("pointerdown", ev => {
        const g = ev.target.closest(".vault-graph-node");
        if (!g) return;
        const id = g.getAttribute("data-id");
        const n = nodeById.get(id);
        if (!n) return;
        dragging = n;
        g.setPointerCapture(ev.pointerId);
    });

    gNodes.addEventListener("pointermove", ev => {
        if (!dragging) return;
        const pt = ptFromEvent(ev);
        dragging.x = (pt.x - panX) / scale;
        dragging.y = (pt.y - panY) / scale;
        dragging.vx = 0;
        dragging.vy = 0;
    });

    gNodes.addEventListener("pointerup", () => {
        dragging = null;
    });

    gNodes.addEventListener("click", ev => {
        const g = ev.target.closest(".vault-graph-node");
        if (!g) return;
        const id = g.getAttribute("data-id");
        if (id && opts.onNodeClick) opts.onNodeClick(id);
    });

    container.querySelector(".vault-graph-reset")?.addEventListener("click", () => {
        tick = 0;
        scale = 1;
        panX = 0;
        panY = 0;
        applyZoom();
        for (let i = 0; i < nodes.length; i++) {
            const angle = (i / nodes.length) * Math.PI * 2;
            const r = Math.min(width, height) * 0.34;
            nodes[i].x = cx + Math.cos(angle) * r;
            nodes[i].y = cy + Math.sin(angle) * r;
            nodes[i].vx = 0;
            nodes[i].vy = 0;
        }
    });

    svg.addEventListener(
        "wheel",
        ev => {
            ev.preventDefault();
            const rect = svg.getBoundingClientRect();
            const mx = ((ev.clientX - rect.left) / rect.width) * width;
            const my = ((ev.clientY - rect.top) / rect.height) * height;
            const factor = ev.deltaY < 0 ? 1.08 : 0.92;
            const next = Math.min(2.5, Math.max(0.35, scale * factor));
            panX = mx - (mx - panX) * (next / scale);
            panY = my - (my - panY) * (next / scale);
            scale = next;
            applyZoom();
        },
        { passive: false }
    );

    applyZoom();
    loop();

    return {
        destroy() {
            cancelAnimationFrame(raf);
            container.innerHTML = "";
        }
    };
}
