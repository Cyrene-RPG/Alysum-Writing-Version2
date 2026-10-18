/** Fixed plain-text excerpts carried in URL fragments. No draft storage or network access. */
export const MAX_SNIPPET_LENGTH = 6000;
export const MAX_SNIPPET_LINK_LENGTH = 16000;
const MAX_PAYLOAD_BYTES = 32000;
const MAX_ENCODED_LENGTH = 44000;

function readText(value, maximum, label) {
    if (typeof value !== "string" || value.length > maximum) {
        throw new Error(`${label} must be ${maximum.toLocaleString()} characters or fewer.`);
    }
    return value.replace(/\r\n?/g, "\n").trim();
}

export function normalizeSnippet(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) {
        throw new Error("This snippet link is invalid or uses an unsupported format.");
    }
    const excerpt = readText(value.excerpt, MAX_SNIPPET_LENGTH, "Excerpt");
    if (!excerpt) throw new Error("Add an excerpt before creating a link.");
    return {
        version: 1,
        title: readText(value.title, 120, "Title") || "Untitled excerpt",
        byline: readText(value.byline, 80, "Author"),
        note: readText(value.note, 280, "Note"),
        excerpt,
    };
}

function encodeBytes(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBytes(encoded) {
    if (!encoded || encoded.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
        throw new Error("This snippet link is invalid or incomplete.");
    }
    let binary;
    try { binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/")); }
    catch { throw new Error("This snippet link is invalid or incomplete."); }
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function readBoundedStream(stream) {
    const reader = stream.getReader();
    const parts = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_PAYLOAD_BYTES) throw new Error("This snippet is too large.");
            parts.push(value);
        }
    } catch (error) {
        try { await reader.cancel(); } catch { /* Preserve the original decoding error. */ }
        throw error;
    } finally { reader.releaseLock(); }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
    return result;
}

export async function encodeSnippet(value) {
    const payload = normalizeSnippet(value);
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    if (bytes.byteLength > MAX_PAYLOAD_BYTES) throw new Error("This snippet is too large.");
    let encoded = `v1.${encodeBytes(bytes)}`;
    if (typeof CompressionStream === "function" && typeof DecompressionStream === "function") {
        try {
            const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
            const compressed = await readBoundedStream(stream);
            const candidate = `v1z.${encodeBytes(compressed)}`;
            if (candidate.length < encoded.length) encoded = candidate;
        } catch { /* Plain UTF-8 links remain available without compression. */ }
    }
    return encoded;
}

export async function createSnippetLink(value, origin) {
    const url = new URL("/snippet", origin);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Open Alysum in a browser to create a link.");
    url.hash = await encodeSnippet(value);
    if (url.href.length > MAX_SNIPPET_LINK_LENGTH) {
        throw new Error("This link is too long to share reliably. Shorten the excerpt and try again.");
    }
    return url.href;
}

export async function decodeSnippet(fragment) {
    const raw = String(fragment || "").replace(/^#/, "");
    if (raw.length > MAX_ENCODED_LENGTH + 5) throw new Error("This snippet link is too large.");
    const match = /^(v1|v1z)\.([A-Za-z0-9_-]+)$/.exec(raw);
    if (!match) throw new Error("This snippet link is invalid or incomplete.");
    let bytes = decodeBytes(match[2]);
    if (match[1] === "v1z") {
        if (typeof DecompressionStream !== "function") {
            throw new Error("Open this link in an updated browser to read the snippet.");
        }
        try {
            bytes = await readBoundedStream(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
        } catch { throw new Error("This snippet link is damaged or too large."); }
    }
    if (bytes.byteLength > MAX_PAYLOAD_BYTES) throw new Error("This snippet is too large.");
    try {
        return normalizeSnippet(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    } catch (error) {
        if (error instanceof SyntaxError || error instanceof TypeError) {
            throw new Error("This snippet link is invalid or incomplete.");
        }
        throw error;
    }
}

export function countSnippetWords(excerpt) {
    return String(excerpt || "").trim().split(/\s+/u).filter(Boolean).length;
}
