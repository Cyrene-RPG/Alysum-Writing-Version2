/** Local exports. No upload, background worker, file picker, or popup required. */
export function canShareSnippet(file, browser = navigator) {
    try { return typeof browser.share === "function" && typeof browser.canShare === "function" && browser.canShare({ files: [file] }); }
    catch { return false; }
}
export function shareSnippet(file, browser = navigator) {
    if (!canShareSnippet(file, browser)) return null;
    return browser.share({ files: [file] });
}
export function prepareSnippetDownload(file, link, host = window) {
    const url = host.URL.createObjectURL(file);
    link.href = url;
    link.download = file.name;
    link.removeAttribute("target");
    link.removeAttribute("aria-disabled");
    // Keep the actual link and Blob alive until the preview is replaced/closed.
    return () => {
        link.removeAttribute("href");
        link.setAttribute("aria-disabled", "true");
        host.URL.revokeObjectURL(url);
    };
}
export async function copyReadingLink(input, browser = navigator, doc = document) {
    if (browser.clipboard?.writeText) {
        try { await browser.clipboard.writeText(input.value); return true; } catch { /* Try the tap-triggered copy fallback. */ }
    }
    input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
    try { return typeof doc.execCommand === "function" && doc.execCommand("copy"); } catch { return false; }
}
