/**
 * Command palette — global search across characters, places, and facts (Ctrl/Cmd+K).
 */

import { escapeHtml, normalizeText, getInitials, avatarGradient, placeKindIcon } from "./story-bible-utils.js?v=1";

/**
 * @param {object} opts
 */
export function mountCommandPalette(opts) {
    const overlay = document.getElementById("sbCommandPalette");
    const input = document.getElementById("sbCommandInput");
    const results = document.getElementById("sbCommandResults");
    const trigger = document.getElementById("sbSearchBtn");
    if (!overlay || !input || !results) return { open: () => {}, close: () => {}, updateIndex: () => {} };

    /** @type {object} */
    let index = [];
    let activeIx = 0;
    let open = false;

    function buildIndex(ctx) {
        const rows = [];
        for (const c of ctx.characters || []) {
            const name = normalizeText(c.name);
            if (!name) continue;
            rows.push({
                kind: "character",
                id: c.id,
                title: name,
                subtitle: [(c.aliases || []).join(", "), (c.tags || []).join(", ")].filter(Boolean).join(" · "),
                hay: [name, ...(c.aliases || []), ...(c.tags || []), c.notes].join(" ").toLowerCase()
            });
        }
        for (const p of ctx.places || []) {
            const name = normalizeText(p.name);
            if (!name) continue;
            rows.push({
                kind: "place",
                id: p.id,
                title: name,
                subtitle: [p.kind, p.parentPlace, ...(p.tags || [])].filter(Boolean).join(" · "),
                hay: [name, ...(p.aliases || []), p.parentPlace, p.notes].join(" ").toLowerCase()
            });
        }
        for (const f of ctx.facts || []) {
            const char = (ctx.characters || []).find(c => c.id === f.character_id);
            rows.push({
                kind: "fact",
                id: f.id,
                charId: f.character_id,
                title: `${f.category}: ${f.value}`,
                subtitle: `${char?.name || "Unknown"} · ${f.source_chapter || "?"}`,
                hay: [f.category, f.value, f.source_text, char?.name].join(" ").toLowerCase()
            });
        }
        index = rows;
    }

    function filtered(q) {
        const query = normalizeText(q).toLowerCase();
        if (!query) return index.slice(0, 24);
        return index.filter(r => r.hay.includes(query)).slice(0, 24);
    }

    function renderList(q) {
        const rows = filtered(q);
        activeIx = Math.min(activeIx, Math.max(0, rows.length - 1));
        if (!rows.length) {
            results.innerHTML = `<p class="sb-cmd-empty">${q ? "No matches." : "Type to search characters, places, and canon facts."}</p>`;
            return;
        }
        results.innerHTML = rows
            .map((r, i) => {
                const icon =
                    r.kind === "character"
                        ? `<span class="sb-cmd-avatar" style="background:${avatarGradient(r.title)}">${escapeHtml(getInitials(r.title))}</span>`
                        : r.kind === "place"
                          ? `<span class="sb-cmd-avatar is-place">${placeKindIcon(r.subtitle.split(" · ")[0])}</span>`
                          : `<span class="sb-cmd-avatar is-fact">◆</span>`;
                return `<button type="button" class="sb-cmd-row${i === activeIx ? " is-active" : ""}" data-ix="${i}" data-kind="${r.kind}" data-id="${escapeHtml(r.id)}" data-char="${escapeHtml(r.charId || "")}">
                    ${icon}
                    <span class="sb-cmd-text">
                        <strong>${escapeHtml(r.title)}</strong>
                        <span>${escapeHtml(r.subtitle)}</span>
                    </span>
                    <span class="sb-cmd-type">${escapeHtml(r.kind)}</span>
                </button>`;
            })
            .join("");

        results.querySelectorAll(".sb-cmd-row").forEach(btn => {
            btn.addEventListener("click", () => pick(parseInt(btn.getAttribute("data-ix") || "0", 10), q));
        });
    }

    function pick(ix, q) {
        const rows = filtered(q);
        const row = rows[ix];
        if (!row) return;
        closePalette();
        if (row.kind === "character") {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-navigate", { detail: { view: "codex", tab: "characters", charId: row.id } })
            );
        } else if (row.kind === "place") {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-navigate", { detail: { view: "codex", tab: "places", placeId: row.id } })
            );
        } else if (row.kind === "fact" && row.charId) {
            window.dispatchEvent(
                new CustomEvent("alysum-bible-navigate", { detail: { view: "codex", tab: "characters", charId: row.charId } })
            );
        }
    }

    function openPalette() {
        open = true;
        overlay.classList.remove("hidden");
        input.value = "";
        activeIx = 0;
        renderList("");
        requestAnimationFrame(() => input.focus());
    }

    function closePalette() {
        open = false;
        overlay.classList.add("hidden");
    }

    input.addEventListener("input", () => {
        activeIx = 0;
        renderList(input.value);
    });

    input.addEventListener("keydown", ev => {
        const rows = filtered(input.value);
        if (ev.key === "ArrowDown") {
            ev.preventDefault();
            activeIx = Math.min(activeIx + 1, rows.length - 1);
            renderList(input.value);
        } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            activeIx = Math.max(activeIx - 1, 0);
            renderList(input.value);
        } else if (ev.key === "Enter") {
            ev.preventDefault();
            pick(activeIx, input.value);
        } else if (ev.key === "Escape") {
            closePalette();
        }
    });

    overlay.addEventListener("click", ev => {
        if (ev.target === overlay) closePalette();
    });

    trigger?.addEventListener("click", openPalette);

    document.addEventListener("keydown", ev => {
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
            ev.preventDefault();
            if (open) closePalette();
            else openPalette();
        }
        if (ev.key === "Escape" && open) closePalette();
    });

    return {
        open: openPalette,
        close: closePalette,
        updateIndex: buildIndex
    };
}
