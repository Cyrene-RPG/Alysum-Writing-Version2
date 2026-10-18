import { fetchSharedExcerpt } from "/core/publishing/excerpt-reader.js";
let generation = 0;
async function load() {
    const request = ++generation;
    const content = document.getElementById("section-content");
    const unavailable = document.getElementById("section-unavailable");
    const status = document.getElementById("section-status");
    content.hidden = true;
    unavailable.hidden = true;
    status.hidden = false;
    document.getElementById("section-text").textContent = "";
    try {
        const token = window.location.hash.slice(1);
        if (!/^[a-f0-9]{48}$/.test(token)) throw new Error("Invalid link");
        const section = await fetchSharedExcerpt(token);
        if (request !== generation) return;
        if (!section) throw new Error("Unavailable");
        document.getElementById("section-title").textContent = section.title;
        document.getElementById("section-author").textContent = section.author ? `by ${section.author}` : "";
        document.getElementById("section-author").hidden = !section.author;
        document.getElementById("section-meta").textContent = `${section.wordCount.toLocaleString()} words · ${Math.max(1, Math.ceil(section.wordCount / 220))} min read`;
        document.getElementById("section-text").textContent = section.excerpt;
        document.title = `${section.title} — Alysum`;
        content.hidden = false;
    } catch { if (request === generation) { unavailable.hidden = false; document.title = "Section unavailable — Alysum"; } }
    finally { if (request === generation) status.hidden = true; }
}
window.addEventListener("hashchange", load);
window.addEventListener("pageshow", (event) => { if (event.persisted) void load(); });
document.getElementById("section-retry").addEventListener("click", load);
void load();
