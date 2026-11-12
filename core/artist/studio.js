/** Drawing-studio model. No DOM. The page paints; this file decides. */

export const MIN_EDGE = 64;
export const MAX_EDGE = 4096;

export const BLEND_MODES = [
    { id: "source-over", label: "Normal" },
    { id: "multiply", label: "Multiply" },
    { id: "screen", label: "Screen" },
    { id: "overlay", label: "Overlay" },
    { id: "darken", label: "Darken" },
    { id: "lighten", label: "Lighten" },
    { id: "color-dodge", label: "Color Dodge" },
    { id: "color-burn", label: "Color Burn" },
    { id: "soft-light", label: "Soft Light" },
    { id: "hard-light", label: "Hard Light" },
    { id: "difference", label: "Difference" },
    { id: "exclusion", label: "Exclusion" },
    { id: "hue", label: "Hue" },
    { id: "saturation", label: "Saturation" },
    { id: "color", label: "Color" },
    { id: "luminosity", label: "Luminosity" },
];

export const CANVAS_PRESETS = [
    { id: "screen", name: "Screen", width: 0, height: 0 },
    { id: "sketch", name: "Sketch", width: 1600, height: 1200 },
    { id: "square", name: "Square", width: 2048, height: 2048 },
    { id: "portrait", name: "Portrait", width: 1800, height: 2400 },
    { id: "landscape", name: "Landscape", width: 2400, height: 1800 },
    { id: "story", name: "Story", width: 1080, height: 1920 },
    { id: "comic", name: "Comic page", width: 2063, height: 3150 },
    { id: "a4", name: "A4", width: 2480, height: 3508 },
    { id: "uhd", name: "4K", width: 3840, height: 2160 },
];

export const PAPER_COLORS = [
    { id: "white", name: "White", value: "#ffffff" },
    { id: "cream", name: "Cream", value: "#f4f1ea" },
    { id: "paper", name: "Paper", value: "#ebe6df" },
    { id: "black", name: "Black", value: "#111111" },
    { id: "clear", name: "Clear", value: "transparent" },
];

export const BRUSHES = [
    { id: "6b-pencil", name: "6B Pencil", category: "Sketching", shape: "pencil", spacing: 0.07, hardness: 0.82, grain: 0.62, scatter: 0.05, streamline: 0.4, pressureSize: true, pressureOpacity: true, buildUp: false, defaultSize: 7, defaultOpacity: 0.9 },
    { id: "hb-pencil", name: "HB Pencil", category: "Sketching", shape: "pencil", spacing: 0.08, hardness: 0.9, grain: 0.35, scatter: 0.02, streamline: 0.45, pressureSize: true, pressureOpacity: true, buildUp: false, defaultSize: 4, defaultOpacity: 0.85 },
    { id: "technical-pencil", name: "Technical Pencil", category: "Sketching", shape: "round", spacing: 0.05, hardness: 1, grain: 0, scatter: 0, streamline: 0.7, pressureSize: false, pressureOpacity: true, buildUp: false, defaultSize: 2, defaultOpacity: 1 },
    { id: "studio-pen", name: "Studio Pen", category: "Inking", shape: "round", spacing: 0.04, hardness: 0.98, grain: 0, scatter: 0, streamline: 0.55, pressureSize: true, pressureOpacity: false, buildUp: false, defaultSize: 8, defaultOpacity: 1 },
    { id: "gel-pen", name: "Gel Pen", category: "Inking", shape: "round", spacing: 0.05, hardness: 0.92, grain: 0.08, scatter: 0, streamline: 0.35, pressureSize: true, pressureOpacity: false, buildUp: false, defaultSize: 6, defaultOpacity: 1 },
    { id: "dry-ink", name: "Dry Ink", category: "Inking", shape: "pencil", spacing: 0.1, hardness: 0.7, grain: 0.75, scatter: 0.08, streamline: 0.25, pressureSize: true, pressureOpacity: true, buildUp: false, defaultSize: 12, defaultOpacity: 0.9 },
    { id: "marker", name: "Marker", category: "Inking", shape: "flat", spacing: 0.06, hardness: 0.75, grain: 0.12, scatter: 0, streamline: 0.5, pressureSize: false, pressureOpacity: false, buildUp: false, defaultSize: 28, defaultOpacity: 0.75, angleFollow: true },
    { id: "round-brush", name: "Round Brush", category: "Painting", shape: "round", spacing: 0.08, hardness: 0.72, grain: 0.05, scatter: 0, streamline: 0.3, pressureSize: true, pressureOpacity: true, buildUp: false, defaultSize: 24, defaultOpacity: 0.9 },
    { id: "flat-brush", name: "Flat Brush", category: "Painting", shape: "flat", spacing: 0.07, hardness: 0.8, grain: 0.04, scatter: 0, streamline: 0.35, pressureSize: true, pressureOpacity: false, buildUp: false, defaultSize: 36, defaultOpacity: 1, angleFollow: true },
    { id: "oil-brush", name: "Oil Brush", category: "Painting", shape: "round", spacing: 0.12, hardness: 0.55, grain: 0.28, scatter: 0.06, streamline: 0.2, pressureSize: true, pressureOpacity: true, buildUp: true, defaultSize: 32, defaultOpacity: 0.55 },
    { id: "soft-airbrush", name: "Soft Airbrush", category: "Airbrushing", shape: "round", spacing: 0.04, hardness: 0, grain: 0, scatter: 0, streamline: 0.15, pressureSize: true, pressureOpacity: true, buildUp: true, defaultSize: 80, defaultOpacity: 0.25 },
    { id: "hard-airbrush", name: "Hard Airbrush", category: "Airbrushing", shape: "round", spacing: 0.06, hardness: 0.45, grain: 0, scatter: 0, streamline: 0.2, pressureSize: true, pressureOpacity: true, buildUp: true, defaultSize: 40, defaultOpacity: 0.4 },
    { id: "spraypaint", name: "Spraypaint", category: "Airbrushing", shape: "spray", spacing: 0.18, hardness: 0.2, grain: 0, scatter: 1, streamline: 0.1, pressureSize: true, pressureOpacity: true, buildUp: true, defaultSize: 48, defaultOpacity: 0.55 },
    { id: "vine-charcoal", name: "Vine Charcoal", category: "Charcoal", shape: "charcoal", spacing: 0.09, hardness: 0.4, grain: 0.8, scatter: 0.12, streamline: 0.2, pressureSize: true, pressureOpacity: true, buildUp: false, defaultSize: 18, defaultOpacity: 0.7 },
    { id: "compressed-charcoal", name: "Compressed Charcoal", category: "Charcoal", shape: "charcoal", spacing: 0.08, hardness: 0.65, grain: 0.55, scatter: 0.06, streamline: 0.25, pressureSize: true, pressureOpacity: true, buildUp: true, defaultSize: 22, defaultOpacity: 0.85 },
    { id: "noise", name: "Noise Brush", category: "Textures", shape: "spray", spacing: 0.15, hardness: 0.3, grain: 0.4, scatter: 1.2, streamline: 0, pressureSize: true, pressureOpacity: true, buildUp: true, defaultSize: 36, defaultOpacity: 0.45 },
];

const BLEND_IDS = new Set(BLEND_MODES.map((mode) => mode.id));

export function brushById(id) {
    return BRUSHES.find((brush) => brush.id === id) || BRUSHES[3];
}

export function brushCategories() {
    const seen = [];
    for (const brush of BRUSHES) {
        if (!seen.includes(brush.category)) seen.push(brush.category);
    }
    return seen;
}

export function clampEdge(value, fallback = 1600) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(MAX_EDGE, Math.max(MIN_EDGE, n));
}

export function clampDpi(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 300;
    return Math.min(600, Math.max(36, n));
}

export function screenCanvasSize(viewportWidth, viewportHeight, pixelRatio = 1) {
    const ratio = Math.min(2, Math.max(1, Number(pixelRatio) || 1));
    return {
        width: clampEdge(Math.round(Number(viewportWidth) * ratio)),
        height: clampEdge(Math.round((Number(viewportHeight) - 80) * ratio)),
    };
}

export function pixelsFromMeasure(value, unit, dpi) {
    const n = Number(value);
    if (!Number.isFinite(n)) return clampEdge(NaN, MIN_EDGE);
    const dots = clampDpi(dpi);
    if (unit === "in") return clampEdge(n * dots);
    if (unit === "cm") return clampEdge((n / 2.54) * dots);
    return clampEdge(n);
}

export function measureFromPixels(pixels, unit, dpi) {
    const dots = clampDpi(dpi);
    const edge = clampEdge(pixels);
    if (unit === "in") return edge / dots;
    if (unit === "cm") return (edge / dots) * 2.54;
    return edge;
}

export function canvasMemoryMb(width, height) {
    return (clampEdge(width) * clampEdge(height) * 4) / (1024 * 1024);
}

export function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
}

export function undoLimitFor(width, height) {
    return width * height > 2_500_000 ? 8 : 24;
}

function layerId() {
    const rand = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `ly_${String(rand).replace(/-/g, "").slice(0, 12)}`;
}

function documentId() {
    const rand = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `draw_${String(rand).replace(/-/g, "").slice(0, 12)}`;
}

export function createLayer(partial = {}) {
    const blend = BLEND_IDS.has(partial.blend) ? partial.blend : "source-over";
    return {
        id: partial.id || layerId(),
        name: String(partial.name || "Layer 1").slice(0, 80),
        visible: partial.visible !== false,
        opacity: clamp01(partial.opacity ?? 1),
        blend,
        clipping: Boolean(partial.clipping),
        alphaLock: Boolean(partial.alphaLock),
    };
}

export function createStudioDocument(partial = {}) {
    const width = clampEdge(partial.width, 1600);
    const height = clampEdge(partial.height, 1200);
    const first = createLayer({ name: "Layer 1" });
    const layers = Array.isArray(partial.layers) && partial.layers.length
        ? partial.layers.map((layer, index) => createLayer({ ...layer, name: layer.name || `Layer ${index + 1}` }))
        : [first];
    const active = layers.some((layer) => layer.id === partial.activeLayerId) ? partial.activeLayerId : layers[layers.length - 1].id;
    return {
        id: partial.id || documentId(),
        name: String(partial.name || "Untitled Canvas").slice(0, 80),
        width,
        height,
        background: normalizeBackground(partial.background),
        characterId: partial.characterId ? String(partial.characterId) : "",
        layers,
        activeLayerId: active,
        symmetry: partial.symmetry || "off",
        symmetryCount: Math.min(12, Math.max(2, partial.symmetryCount || 8)),
        updatedAt: partial.updatedAt || Date.now(),
    };
}

export function normalizeBackground(value) {
    if (value === "transparent") return "transparent";
    const hex = String(value || "#ffffff").trim();
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : "#ffffff";
}

export function activeLayer(doc) {
    return doc.layers.find((layer) => layer.id === doc.activeLayerId) || doc.layers[doc.layers.length - 1];
}

export function addLayer(doc, partial = {}) {
    const layer = createLayer({ name: `Layer ${doc.layers.length + 1}`, ...partial });
    return { ...doc, layers: [...doc.layers, layer], activeLayerId: layer.id };
}

export function duplicateLayer(doc, id) {
    const index = doc.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return { document: doc, sourceId: "", layerId: "" };
    const source = doc.layers[index];
    const copy = createLayer({ ...source, id: undefined, name: `${source.name} copy`.slice(0, 80) });
    const layers = doc.layers.slice();
    layers.splice(index + 1, 0, copy);
    return { document: { ...doc, layers, activeLayerId: copy.id }, sourceId: source.id, layerId: copy.id };
}

export function deleteLayer(doc, id) {
    if (doc.layers.length < 2) return doc;
    const index = doc.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return doc;
    const layers = doc.layers.filter((layer) => layer.id !== id);
    const activeLayerId = doc.activeLayerId === id ? layers[Math.max(0, index - 1)].id : doc.activeLayerId;
    return { ...doc, layers, activeLayerId };
}

export function moveLayer(doc, id, direction) {
    const index = doc.layers.findIndex((layer) => layer.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= doc.layers.length) return doc;
    const layers = doc.layers.slice();
    const [layer] = layers.splice(index, 1);
    layers.splice(next, 0, layer);
    return { ...doc, layers };
}

export function updateLayer(doc, id, patch) {
    return {
        ...doc,
        layers: doc.layers.map((layer) => (layer.id === id ? createLayer({ ...layer, ...patch, id: layer.id }) : layer)),
    };
}

export function rgbToHsv(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === rn) h = ((gn - bn) / d) % 6;
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb(h, s, v) {
    const hue = ((h % 360) + 360) % 360;
    const c = v * s;
    const hp = hue / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hp < 1) [r, g, b] = [c, x, 0];
    else if (hp < 2) [r, g, b] = [x, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x];
    else if (hp < 4) [r, g, b] = [0, x, c];
    else if (hp < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = v - c;
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255),
    };
}

export function rgbToHex(r, g, b) {
    const part = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${part(r)}${part(g)}${part(b)}`;
}

export function hexToRgb(hex) {
    const match = String(hex || "").trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (!match) return { r: 0, g: 0, b: 0 };
    const n = Number.parseInt(match[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function adjustRgba(src, { hue = 0, saturation = 0, brightness = 0 } = {}) {
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
        if (src[i + 3] === 0) {
            out[i] = src[i];
            out[i + 1] = src[i + 1];
            out[i + 2] = src[i + 2];
            out[i + 3] = 0;
            continue;
        }
        const hsv = rgbToHsv(src[i], src[i + 1], src[i + 2]);
        const rgb = hsvToRgb(hsv.h + hue, clamp01(hsv.s + saturation), clamp01(hsv.v + brightness));
        out[i] = rgb.r;
        out[i + 1] = rgb.g;
        out[i + 2] = rgb.b;
        out[i + 3] = src[i + 3];
    }
    return out;
}

export function invertRgba(src) {
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
        out[i] = 255 - src[i];
        out[i + 1] = 255 - src[i + 1];
        out[i + 2] = 255 - src[i + 2];
        out[i + 3] = src[i + 3];
    }
    return out;
}

export function noiseRgba(src, amount, random = Math.random) {
    const amp = clamp01(amount) * 255;
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
        const n = (random() - 0.5) * 2 * amp;
        out[i] = clamp255(src[i] + n);
        out[i + 1] = clamp255(src[i + 1] + n);
        out[i + 2] = clamp255(src[i + 2] + n);
        out[i + 3] = src[i + 3];
    }
    return out;
}

export function flipRgba(src, width, height, axis) {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const sx = axis === "h" ? width - 1 - x : x;
            const sy = axis === "v" ? height - 1 - y : y;
            const from = (sy * width + sx) * 4;
            const to = (y * width + x) * 4;
            out[to] = src[from];
            out[to + 1] = src[from + 1];
            out[to + 2] = src[from + 2];
            out[to + 3] = src[from + 3];
        }
    }
    return out;
}

export function boxBlurRgba(src, width, height, radius) {
    const r = Math.max(1, Math.min(40, Math.round(radius)));
    const horizontal = blurAxis(src, width, height, r, true);
    return blurAxis(horizontal, width, height, r, false);
}

export function sharpenRgba(src, width, height, amount) {
    const blur = boxBlurRgba(src, width, height, 1);
    const k = Math.max(0, Math.min(2, Number(amount) || 0));
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
        out[i] = clamp255(src[i] + k * (src[i] - blur[i]));
        out[i + 1] = clamp255(src[i + 1] + k * (src[i + 1] - blur[i + 1]));
        out[i + 2] = clamp255(src[i + 2] + k * (src[i + 2] - blur[i + 2]));
        out[i + 3] = src[i + 3];
    }
    return out;
}

export function contentBounds(src, width, height, step = 1) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const jump = Math.max(1, step);
    for (let y = 0; y < height; y += jump) {
        for (let x = 0; x < width; x += jump) {
            if (src[(y * width + x) * 4 + 3] > 8) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function clamp255(n) {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function blurAxis(src, width, height, radius, horizontal) {
    const out = new Uint8ClampedArray(src.length);
    const div = radius * 2 + 1;
    if (horizontal) {
        for (let y = 0; y < height; y += 1) {
            let r = 0;
            let g = 0;
            let b = 0;
            let a = 0;
            const row = y * width;
            for (let i = -radius; i <= radius; i += 1) {
                const x = Math.min(width - 1, Math.max(0, i));
                const p = (row + x) * 4;
                r += src[p];
                g += src[p + 1];
                b += src[p + 2];
                a += src[p + 3];
            }
            for (let x = 0; x < width; x += 1) {
                const p = (row + x) * 4;
                out[p] = r / div;
                out[p + 1] = g / div;
                out[p + 2] = b / div;
                out[p + 3] = a / div;
                const removeX = Math.min(width - 1, Math.max(0, x - radius));
                const addX = Math.min(width - 1, Math.max(0, x + radius + 1));
                const rp = (row + removeX) * 4;
                const ap = (row + addX) * 4;
                r += src[ap] - src[rp];
                g += src[ap + 1] - src[rp + 1];
                b += src[ap + 2] - src[rp + 2];
                a += src[ap + 3] - src[rp + 3];
            }
        }
        return out;
    }
    for (let x = 0; x < width; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let i = -radius; i <= radius; i += 1) {
            const y = Math.min(height - 1, Math.max(0, i));
            const p = (y * width + x) * 4;
            r += src[p];
            g += src[p + 1];
            b += src[p + 2];
            a += src[p + 3];
        }
        for (let y = 0; y < height; y += 1) {
            const p = (y * width + x) * 4;
            out[p] = r / div;
            out[p + 1] = g / div;
            out[p + 2] = b / div;
            out[p + 3] = a / div;
            const removeY = Math.min(height - 1, Math.max(0, y - radius));
            const addY = Math.min(height - 1, Math.max(0, y + radius + 1));
            const rp = (removeY * width + x) * 4;
            const ap = (addY * width + x) * 4;
            r += src[ap] - src[rp];
            g += src[ap + 1] - src[rp + 1];
            b += src[ap + 2] - src[rp + 2];
            a += src[ap + 3] - src[rp + 3];
        }
    }
    return out;
}

export function symmetryPoints(x, y, width, height, mode, count = 8) {
    const origin = { x, y };
    if (!mode || mode === "off") return [origin];
    const cx = width / 2;
    const cy = height / 2;
    const dx = x - cx;
    const dy = y - cy;
    if (mode === "vertical") return [origin, { x: cx - dx, y }];
    if (mode === "horizontal") return [origin, { x, y: cy - dy }];
    if (mode === "both") {
        return [origin, { x: cx - dx, y }, { x, y: cy - dy }, { x: cx - dx, y: cy - dy }];
    }
    const n = Math.min(12, Math.max(2, Math.round(count) || 8));
    const ang = Math.atan2(dy, dx);
    const rad = Math.hypot(dx, dy);
    const points = [];
    for (let i = 0; i < n; i += 1) {
        const a = ang + (Math.PI * 2 * i) / n;
        points.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
    }
    return points;
}

export function applyStreamline(previous, point, amount) {
    const t = clamp01(amount);
    if (!previous || t <= 0) return { x: point.x, y: point.y };
    const follow = 1 - t * 0.9;
    return {
        x: previous.x + (point.x - previous.x) * follow,
        y: previous.y + (point.y - previous.y) * follow,
    };
}

/** Walk from the last stamp toward (x, y). `carry` is progress toward the next gap. */
export function collectStamps(lastX, lastY, x, y, spacing, carry = 0) {
    const dx = x - lastX;
    const dy = y - lastY;
    const dist = Math.hypot(dx, dy);
    const gap = Math.max(0.4, spacing);
    if (dist === 0) return { points: [], carry, x: lastX, y: lastY };
    const points = [];
    let consumed = 0;
    let acc = carry;
    while (acc + (dist - consumed) >= gap) {
        const need = gap - acc;
        consumed += need;
        acc = 0;
        const t = consumed / dist;
        points.push({ x: lastX + dx * t, y: lastY + dy * t });
    }
    acc += dist - consumed;
    return { points, carry: acc, x, y };
}

export function pointsForShape(shape, spacing) {
    const step = Math.max(0.75, spacing || 2);
    if (!shape) return [];
    if (shape.kind === "line") return sampleSegment(shape.x0, shape.y0, shape.x1, shape.y1, step);
    if (shape.kind === "rect") {
        const x = shape.x;
        const y = shape.y;
        const w = shape.w;
        const h = shape.h;
        return [
            ...sampleSegment(x, y, x + w, y, step),
            ...sampleSegment(x + w, y, x + w, y + h, step),
            ...sampleSegment(x + w, y + h, x, y + h, step),
            ...sampleSegment(x, y + h, x, y, step),
        ];
    }
    if (shape.kind === "ellipse") {
        const points = [];
        const n = Math.max(16, Math.round((Math.PI * (shape.rx + shape.ry)) / step));
        for (let i = 0; i <= n; i += 1) {
            const a = (i / n) * Math.PI * 2;
            points.push({ x: shape.cx + Math.cos(a) * shape.rx, y: shape.cy + Math.sin(a) * shape.ry });
        }
        return points;
    }
    if (shape.kind === "triangle" && shape.points?.length >= 3) {
        const [a, b, c] = shape.points;
        return [
            ...sampleSegment(a.x, a.y, b.x, b.y, step),
            ...sampleSegment(b.x, b.y, c.x, c.y, step),
            ...sampleSegment(c.x, c.y, a.x, a.y, step),
        ];
    }
    return [];
}

function sampleSegment(x0, y0, x1, y1, step) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(dist / step));
    const points = [];
    for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        points.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
    }
    return points;
}

export function fitQuickShape(points) {
    if (!points || points.length < 4) return null;
    const start = points[0];
    const end = points[points.length - 1];
    const length = polylineLength(points);
    if (length < 16) return null;
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    const deviation = maxSegmentDeviation(points, start, end);
    const closed = chord < Math.max(18, length * 0.14);
    if (!closed && chord > 20 && deviation < Math.max(7, chord * 0.08)) {
        return { kind: "line", x0: start.x, y0: start.y, x1: end.x, y1: end.y };
    }
    if (!closed) return null;
    const box = boundsOf(points);
    if (box.w < 10 || box.h < 10) return null;
    const rectErr = rectPerimeterError(points, box);
    const ellErr = ellipseError(points, box);
    if (rectErr < 0.045 && rectErr <= ellErr) {
        return { kind: "rect", x: box.x, y: box.y, w: box.w, h: box.h };
    }
    if (ellErr < 0.09 && ellErr < rectErr) {
        return { kind: "ellipse", cx: box.x + box.w / 2, cy: box.y + box.h / 2, rx: box.w / 2, ry: box.h / 2 };
    }
    const simple = rdp(points, Math.hypot(box.w, box.h) * 0.07);
    if (simple.length >= 3 && simple.length <= 5 && rectErr > 0.06 && ellErr > 0.1) {
        const corners = largestTriangle(convexHull(points));
        if (corners) return { kind: "triangle", points: corners };
    }
    return null;
}

function polylineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    return total;
}

function maxSegmentDeviation(points, a, b) {
    let max = 0;
    for (const point of points) max = Math.max(max, pointLineDistance(point, a, b));
    return max;
}

function pointLineDistance(p, a, b) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x) / len;
}

function boundsOf(points) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function rectPerimeterError(points, box) {
    let sum = 0;
    const scale = Math.max(box.w, box.h, 1);
    for (const point of points) {
        const inside = point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
        const dx = Math.min(Math.abs(point.x - box.x), Math.abs(point.x - (box.x + box.w)));
        const dy = Math.min(Math.abs(point.y - box.y), Math.abs(point.y - (box.y + box.h)));
        const dist = inside
            ? Math.min(dx, dy)
            : Math.hypot(Math.max(box.x - point.x, 0, point.x - (box.x + box.w)), Math.max(box.y - point.y, 0, point.y - (box.y + box.h)));
        sum += dist;
    }
    return sum / points.length / scale;
}

function ellipseError(points, box) {
    const rx = box.w / 2;
    const ry = box.h / 2;
    if (rx < 1 || ry < 1) return 1;
    const cx = box.x + rx;
    const cy = box.y + ry;
    let sum = 0;
    for (const point of points) {
        sum += Math.abs(Math.hypot((point.x - cx) / rx, (point.y - cy) / ry) - 1);
    }
    return sum / points.length;
}

function rdp(points, epsilon) {
    if (points.length < 3) return points.slice();
    let max = 0;
    let index = 0;
    const a = points[0];
    const b = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i += 1) {
        const dist = pointLineDistance(points[i], a, b);
        if (dist > max) {
            max = dist;
            index = i;
        }
    }
    if (max > epsilon) {
        const left = rdp(points.slice(0, index + 1), epsilon);
        const right = rdp(points.slice(index), epsilon);
        return left.slice(0, -1).concat(right);
    }
    return [a, b];
}

function convexHull(points) {
    const sorted = points
        .map((point) => ({ x: point.x, y: point.y }))
        .sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
        lower.push(point);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
        const point = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
        upper.push(point);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

function largestTriangle(hull) {
    if (hull.length < 3) return null;
    let best = null;
    let bestArea = 0;
    for (let i = 0; i < hull.length; i += 1) {
        for (let j = i + 1; j < hull.length; j += 1) {
            for (let k = j + 1; k < hull.length; k += 1) {
                const area = Math.abs(convexArea([hull[i], hull[j], hull[k]]));
                if (area > bestArea) {
                    bestArea = area;
                    best = [hull[i], hull[j], hull[k]];
                }
            }
        }
    }
    return bestArea > 40 ? best : null;
}

function convexArea(pts) {
    let sum = 0;
    for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        sum += a.x * b.y - b.x * a.y;
    }
    return sum / 2;
}
