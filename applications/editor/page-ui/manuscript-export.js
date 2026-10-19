import { walkBookChapters } from "../../../core/writing-engine/manuscript.js";
import { createManuscriptDocument } from "../../../core/writing-engine/manuscript-export.js";

/** Parse a detached document. Never normalize or rewrite the saved chapter HTML. */
export function parseManuscriptHtml(html) {
    const root = new DOMParser().parseFromString(String(html || ""), "text/html").body;
    if (root.querySelector("img, video, audio, iframe, svg, canvas")) {
        throw new Error("Text manuscript export does not support embedded media yet. Your saved book is unchanged; use the existing ZIP export or a separate text-only copy.");
    }
    const paragraphs = [];
    let runs = [];
    const flush = () => {
        if (runs.some(item => item.break || item.text.trim())) paragraphs.push({ runs });
        runs = [];
    };
    function visit(node, italic = false) {
        if (node.nodeType === 3) {
            if (node.textContent) runs.push({ text: node.textContent, italic });
            return;
        }
        if (node.nodeType !== 1) return;
        if (["SCRIPT", "STYLE", "TEMPLATE"].includes(node.tagName)) return;
        if (node.matches(".scene-break, .scene-spacer, hr")) {
            flush();
            paragraphs.push({ sceneBreak: true });
            return;
        }
        if (node.tagName === "BR") {
            runs.push({ break: true });
            return;
        }
        const block = /^(P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE|TABLE|TR|TD|TH|PRE|SECTION|ARTICLE)$/.test(node.tagName);
        if (block) flush();
        const start = paragraphs.length;
        const isItalic = node.style.fontStyle === "normal" ? false : italic || ["I", "EM"].includes(node.tagName) || /^(italic|oblique)/.test(node.style.fontStyle);
        node.childNodes.forEach(child => visit(child, isItalic));
        if (block) {
            flush();
            if (paragraphs.length === start && ["P", "DIV", "LI"].includes(node.tagName)) paragraphs.push({ runs: [] });
        }
    }
    root.childNodes.forEach(node => visit(node));
    flush();
    return paragraphs;
}

export function prepareManuscript(book, details = {}) {
    const keys = details.includeMatter ? ["front", "body", "back"] : ["body"];
    const chapters = keys.flatMap(key => walkBookChapters(book?.sections?.[key] || []))
        .map(chapter => ({ title: String(chapter.title || ""), paragraphs: parseManuscriptHtml(chapter.content) }));
    if (!chapters.length) throw new Error("There are no chapters to export.");
    const text = chapters.flatMap(chapter => chapter.paragraphs.filter(p => !p.sceneBreak)
        .flatMap(p => p.runs.map(run => run.break ? " " : run.text).join(""))).join(" ");
    return { title: String(details.title || "").trim() || String(book?.title || "Untitled Book"), words: text.trim().split(/\s+/).filter(Boolean).length, chapters };
}

let libraryPromise;
export async function downloadManuscript(book, details) {
    // Capture and validate before fetching the library. This object never writes back.
    const manuscript = prepareManuscript(book, details);
    libraryPromise ||= import("https://cdn.jsdelivr.net/npm/docx@9.6.1/dist/index.mjs").catch(error => {
        libraryPromise = null;
        throw error;
    });
    const library = await libraryPromise;
    const document = createManuscriptDocument(manuscript, details, library);
    const blob = await library.Packer.toBlob(document);
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${manuscript.title.replace(/[<>:"/\\|?*]/g, "-").slice(0, 100) || "manuscript"}.docx`;
    window.document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}
