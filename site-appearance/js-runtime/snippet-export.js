/** Export locally; no upload, popup, or public image URL. */
export function canShareSnippet(file, browser = navigator) {
    try { return typeof browser.share === "function" && typeof browser.canShare === "function" && browser.canShare({ files: [file] }); }
    catch { return false; }
}

export function shareSnippet(file, browser = navigator) {
    if (!canShareSnippet(file, browser)) throw new Error("This browser cannot share image files. Save the PNG, then share it from Downloads or open Alysum in Chrome or Safari.");
    // Call immediately within the click event to retain the device's user activation.
    return browser.share({ files: [file] });
}

export async function saveSnippet(file, mount, browser = navigator, host = window) {
    const controller = browser.serviceWorker?.controller;
    if (!controller) throw new Error("Reload Alysum once to enable image downloads, then try Save PNG again.");
    const token = host.crypto.randomUUID();
    const channel = new MessageChannel();
    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { channel.port1.close(); reject(new Error("Image download is not ready. Reload Alysum and try again.")); }, 5000);
        channel.port1.onmessage = ({ data }) => {
            clearTimeout(timer); channel.port1.close();
            if (data?.ok) resolve(); else reject(new Error(data?.error || "Could not prepare the PNG download."));
        };
    });
    controller.postMessage({ type: "ALYSUM_DOWNLOAD_PNG", token, file }, [channel.port2]);
    await ready;
    // The local worker returns Content-Disposition: attachment. The hidden frame
    // starts the download without navigating the editor or opening an image tab.
    let frame = mount.querySelector("iframe[data-snippet-download]");
    if (!frame) {
        frame = document.createElement("iframe");
        frame.hidden = true; frame.setAttribute("data-snippet-download", ""); frame.title = "PNG download";
        mount.append(frame);
    }
    frame.src = `/__alysum-download/${token}`;
    return "PNG download started. Check your browser’s Downloads.";
}
