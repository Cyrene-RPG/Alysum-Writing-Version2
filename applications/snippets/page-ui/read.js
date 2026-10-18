import { decodeSnippet, countSnippetWords } from "/core/publishing/snippets.js";

let generation = 0;
async function loadSnippet() {
    const current = ++generation;
    const loading = document.getElementById("snippet-loading");
    const content = document.getElementById("snippet-content");
    const unavailable = document.getElementById("snippet-unavailable");
    loading.hidden = false;
    content.hidden = true;
    unavailable.hidden = true;
    try {
        const snippet = await decodeSnippet(window.location.hash);
        if (current !== generation) return;
        document.getElementById("snippet-reader-title").textContent = snippet.title;
        document.getElementById("snippet-reader-byline").textContent = snippet.byline ? `by ${snippet.byline}` : "";
        document.getElementById("snippet-reader-byline").hidden = !snippet.byline;
        document.getElementById("snippet-reader-note").textContent = snippet.note;
        document.getElementById("snippet-reader-note").hidden = !snippet.note;
        document.getElementById("snippet-reader-excerpt").textContent = snippet.excerpt;
        const words = countSnippetWords(snippet.excerpt);
        document.getElementById("snippet-reader-meta").textContent = `${words.toLocaleString()} ${words === 1 ? "word" : "words"} · ${Math.max(1, Math.ceil(words / 220))} min read`;
        document.title = `${snippet.title} — Alysum snippet`;
        content.hidden = false;
    } catch (error) {
        if (current !== generation) return;
        document.getElementById("snippet-unavailable-message").textContent = window.location.hash
            ? error?.message || "Ask the sender for a new link." : "The excerpt is missing from this link. Ask the sender to copy the complete link.";
        document.title = "Snippet unavailable — Alysum";
        unavailable.hidden = false;
    } finally { if (current === generation) loading.hidden = true; }
}
window.addEventListener("hashchange", loadSnippet);
void loadSnippet();
