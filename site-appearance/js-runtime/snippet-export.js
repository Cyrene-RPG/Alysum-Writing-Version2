/** Device sharing and short-lived HTTP attachment downloads. */
export function canShareSnippet(file, browser = navigator) {
    try { return typeof browser.share === "function" && typeof browser.canShare === "function" && browser.canShare({ files: [file] }); }
    catch { return false; }
}
export function shareSnippet(file, browser = navigator) {
    if (!canShareSnippet(file, browser)) return null;
    return browser.share({ files: [file] });
}
export async function requestSnippetDownload(file, mount, api, isCurrent = () => true) {
    if (!api) throw new Error("Sign in to prepare the PNG download.");
    const result = await api.prepare(file);
    if (!isCurrent()) return false;
    let frame = mount.querySelector('iframe[data-snippet-download]');
    if (!frame) {
        frame = document.createElement('iframe'); frame.hidden = true;
        frame.setAttribute('data-snippet-download', ''); frame.title = 'PNG file download';
        mount.append(frame);
    }
    frame.src = result.url;
    return true;
}
export async function copyReadingLink(input, browser = navigator, doc = document) {
    if (browser.clipboard?.writeText) {
        try { await browser.clipboard.writeText(input.value); return true; } catch { /* Try the tap-triggered copy fallback. */ }
    }
    input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
    try { return typeof doc.execCommand === "function" && doc.execCommand("copy"); } catch { return false; }
}
