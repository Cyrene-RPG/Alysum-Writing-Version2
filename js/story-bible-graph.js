/**
 * Interactive relationship web — force-directed SVG graph.
 */

import { escapeHtml, normalizeText, avatarGradient, getInitials } from "./story-bible-utils.js?v=1";

/**
 * @param {HTMLElement} container
 * @param {{ nodes: object[], edges: object[] }} graph
 * @param {{ onNodeClick?: (id: string) => void }} opts
 */
export function mountRelationshipGraph(container, graph, opts = {}) {
    if (!container) return { destroy: () => {} };
    const nodes = (graph.nodes || []).map(n => ({ ...n }));
    const edges = graph.edges || [];
    if (!edges.length) {
        container.innerHTML =
            '<p class="sb-empty-inline">No relationships mapped yet. Extract relationship facts from your manuscript (e.g. "sister of Marcus").</p>';
        return { destroy: () => {} };
    }

    const width = Math.max(container.clientWidth || 800, 640);
    const height = Math.min(Math.max(420, nodes.length * 36), 640);
    const cx = width / 2;
    const cy = height / 2;

    for (let i = 0; i < nodes.length; i++) {
        const angle = (i / nodes.length) * Math.PI * 2;
        const r = Math.min(width, height) * 0.32;
        nodes[i].x = cx + Math.cos(angle) * r + (Math.random() - 0.5) * 20;
        nodes[i].y = cy + Math.sin(angle) * r + (Math.random() - 0.5) * 20;
        nodes[i].vx = 0;
        nodes[i].vy = 0;
    }

    const nodeById = new Map(nodes.map(n => [n.id, n]));

    container.innerHTML = `
        <div class="sb-graph-wrap">
            <div class="sb-graph-toolbar">
                <span class="sb-graph-stat"><strong>${nodes.length}</strong> nodes · <strong>${edges.length}</strong> bonds</span>
                <button type="button" class="sb-btn sb-btn-ghost sb-graph-reset" type="button">Reset layout</button>
            </div>
            <svg class="sb-graph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Relationship graph">
                <defs>
                    <marker id="sbArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 Z" fill="rgba(196,181,253,0.7)"/>
                    </marker>
                </defs>
                <g class="sb-graph-edges"></g>
                <g class="sb-graph-nodes"></g>
            </svg>
            <p class="sb-graph-hint">Drag nodes to rearrange. Click a character to open their codex entry.</p>
        </div>`;

    const svg = container.querySelector(".sb-graph-svg");
    const gEdges = container.querySelector(".sb-graph-edges");
    const gNodes = container.querySelector(".sb-graph-nodes");
    let raf = 0;
    let dragging = null;
    let tick = 0;
    const maxTicks = 280;

    function renderFrame() {
        gEdges.innerHTML = edges
            .map(e => {
                const a = nodeById.get(e.from);
                const b = nodeById.get(e.to);
                if (!a || !b) return "";
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                return `<g class="sb-graph-edge">
                    <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" marker-end="url(#sbArrow)"/>
                    <text x="${mx}" y="${my - 4}" class="sb-graph-edge-label">${escapeHtml(e.label)}</text>
                </g>`;
            })
            .join("");

        gNodes.innerHTML = nodes
            .map(n => {
                const isMentioned = n.type === "mentioned";
                const r = isMentioned ? 18 : 22;
                const fill = isMentioned ? "rgba(100,116,139,0.85)" : avatarGradient(n.name);
                const label = isMentioned ? "?" : escapeHtml(getInitials(n.name));
                return `<g class="sb-graph-node${isMentioned ? " is-mentioned" : ""}" data-id="${escapeHtml(n.id)}" transform="translate(${n.x},${n.y})">
                    <circle r="${r}" fill="${isMentioned ? fill : "url(#grad-" + n.id + ")"}" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
                    <text dy="5" text-anchor="middle" class="sb-graph-node-init">${label}</text>
                    <text dy="${r + 16}" text-anchor="middle" class="sb-graph-node-name">${escapeHtml(n.name)}</text>
                </g>`;
            })
            .join("");

        let defs = svg.querySelector("defs");
        if (!defs) {
            defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            svg.prepend(defs);
        }
        for (const n of nodes) {
            if (n.type === "mentioned") continue;
            const id = `grad-${n.id}`;
            if (defs.querySelector(`#${CSS.escape(id)}`)) continue;
            const g = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
            g.setAttribute("id", id);
            g.setAttribute("x1", "0%");
            g.setAttribute("y1", "0%");
            g.setAttribute("x2", "100%");
            g.setAttribute("y2", "100%");
            const hue = (n.name || "").split("").reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0);
            const c1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
            c1.setAttribute("offset", "0%");
            c1.setAttribute("stop-color", `hsl(${Math.abs(hue) % 360}, 58%, 48%)`);
            const c2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
            c2.setAttribute("offset", "100%");
            c2.setAttribute("stop-color", `hsl(${(Math.abs(hue) + 40) % 360}, 52%, 32%)`);
            g.appendChild(c1);
            g.appendChild(c2);
            defs.appendChild(g);
        }
    }

    function simulate() {
        const repulsion = 4200;
        const attraction = 0.0042;
        const centerPull = 0.012;

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
            n.vx *= 0.86;
            n.vy *= 0.86;
            if (dragging !== n) {
                n.x += n.vx;
                n.y += n.vy;
            }
            n.x = Math.max(40, Math.min(width - 40, n.x));
            n.y = Math.max(40, Math.min(height - 40, n.y));
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
        const g = ev.target.closest(".sb-graph-node");
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
        dragging.x = pt.x;
        dragging.y = pt.y;
        dragging.vx = 0;
        dragging.vy = 0;
    });

    gNodes.addEventListener("pointerup", ev => {
        if (!dragging) return;
        const id = dragging.id;
        dragging = null;
        if (!ev.defaultPrevented && opts.onNodeClick && id && !String(id).startsWith("rel_")) {
            opts.onNodeClick(id);
        }
    });

    gNodes.addEventListener("click", ev => {
        const g = ev.target.closest(".sb-graph-node");
        if (!g) return;
        const id = g.getAttribute("data-id");
        if (id && !String(id).startsWith("rel_") && opts.onNodeClick) opts.onNodeClick(id);
    });

    container.querySelector(".sb-graph-reset")?.addEventListener("click", () => {
        tick = 0;
        for (let i = 0; i < nodes.length; i++) {
            const angle = (i / nodes.length) * Math.PI * 2;
            const r = Math.min(width, height) * 0.32;
            nodes[i].x = cx + Math.cos(angle) * r;
            nodes[i].y = cy + Math.sin(angle) * r;
            nodes[i].vx = 0;
            nodes[i].vy = 0;
        }
    });

    loop();

    return {
        destroy() {
            cancelAnimationFrame(raf);
            container.innerHTML = "";
        }
    };
}
