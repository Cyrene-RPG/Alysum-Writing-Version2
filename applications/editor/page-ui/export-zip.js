import { walkBookChapters } from "@alysum/writing-engine/manuscript.js?v=5";

function safeName(text, fallback, index) {
    const raw = String(text || fallback || `page-${index + 1}`)
        .replace(/[<>:"/\\|?*]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    return raw || `page-${index + 1}`;
}

function asDocHtml(title, html) {
    const body = String(html || "").trim() || "<p></p>";
    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>${body}</body>
</html>`;
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function pagesForSection(sections, key) {
    const list = sections && typeof sections === "object" ? sections[key] : [];
    return walkBookChapters(Array.isArray(list) ? list : []);
}

export async function downloadBookZip(book) {
    const JSZipCtor = typeof window !== "undefined" ? window.JSZip : null;
    if (!JSZipCtor) throw new Error("Zip library not loaded");
    const zip = new JSZipCtor();
    const sections = book?.sections || {};
    const folders = [
        ["front", "01-front"],
        ["body", "02-body"],
        ["back", "03-back"],
    ];
    for (const [key, folder] of folders) {
        pagesForSection(sections, key).forEach((page, index) => {
            const title = page.title || `Page ${index + 1}`;
            const name = `${String(index + 1).padStart(2, "0")}-${safeName(title, "page", index)}.doc`;
            zip.file(`${folder}/${name}`, asDocHtml(title, page.content));
        });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const slug = safeName(book?.title, "book", 0).replace(/\s+/g, "-");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
