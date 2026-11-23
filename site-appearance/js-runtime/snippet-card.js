/** Canvas presentation only. Inputs are plain text and explicit style options. */
export const SNIPPET_PALETTES = Object.freeze({
    alysum: { background: "#191526", wash: "#312243", text: "#f5eedf", muted: "#c2b6c8", accent: "#cfb579", border: "#665374" },
    paper: { background: "#f5efe2", wash: "#ede3d0", text: "#332c30", muted: "#74645e", accent: "#8d6946", border: "#cfbfa5" },
    rose: { background: "#f2e5e6", wash: "#e4ced8", text: "#402d3c", muted: "#816776", accent: "#965b78", border: "#cfafb9" },
    midnight: { background: "#0d1524", wash: "#1a2740", text: "#e8eef8", muted: "#9aabc4", accent: "#7a9ec8", border: "#3a4d6a" },
    fog: { background: "#e8eaef", wash: "#d5dae3", text: "#2a303c", muted: "#6a7384", accent: "#5a6b84", border: "#b8c0ce" },
    moss: { background: "#1a2218", wash: "#2a3526", text: "#e8efe0", muted: "#a0b098", accent: "#8aab6e", border: "#4a5a42" },
    ink: { background: "#0c0c0e", wash: "#1a1a20", text: "#f2f0ea", muted: "#a8a49a", accent: "#c4b48a", border: "#3a3840" },
    parchment: { background: "#f0e6d0", wash: "#e4d4b4", text: "#3a3020", muted: "#7a6a50", accent: "#9a7040", border: "#c8b890" },
    dusk: { background: "#241820", wash: "#3a2432", text: "#f5e8e0", muted: "#c0a098", accent: "#d09070", border: "#5a4048" },
    slate: { background: "#1e2834", wash: "#2c3a4c", text: "#e6edf4", muted: "#9aabbc", accent: "#7a9ab0", border: "#4a5c70" },
});
const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function splitCharacters(text) {
    if (typeof Intl.Segmenter === "function") return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (item) => item.segment);
    return Array.from(text);
}

function paletteLuminance(hex) {
    const value = String(hex || "#000000").replace("#", "");
    const raw = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
    const r = Number.parseInt(raw.slice(0, 2), 16) / 255;
    const g = Number.parseInt(raw.slice(2, 4), 16) / 255;
    const b = Number.parseInt(raw.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function drawCoverImage(context, image, width, height) {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function paintCardSurface(context, palette, width, height, backgroundImage = null) {
    context.fillStyle = palette.background;
    context.fillRect(0, 0, width, height);
    if (backgroundImage) {
        drawCoverImage(context, backgroundImage, width, height);
        const dark = paletteLuminance(palette.background) < 0.45;
        context.fillStyle = dark ? "rgba(8, 10, 16, 0.58)" : "rgba(248, 244, 236, 0.62)";
        context.fillRect(0, 0, width, height);
        context.globalAlpha = dark ? 0.42 : 0.38;
        context.fillStyle = palette.wash;
        context.fillRect(0, 0, width, height);
        context.globalAlpha = 1;
        return;
    }
    const wash = context.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, palette.wash);
    wash.addColorStop(.7, palette.background);
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);
}

export function wrapCardText(context, text, maxWidth) {
    const lines = [];
    for (const paragraph of String(text).split("\n")) {
        if (!paragraph.trim()) { lines.push(""); continue; }
        let line = "";
        for (const word of paragraph.trim().split(/\s+/u)) {
            const candidate = line ? `${line} ${word}` : word;
            if (context.measureText(candidate).width <= maxWidth) { line = candidate; continue; }
            if (line) { lines.push(line); line = ""; }
            if (context.measureText(word).width <= maxWidth) { line = word; continue; }
            for (const character of splitCharacters(word)) {
                if (line && context.measureText(line + character).width > maxWidth) { lines.push(line); line = ""; }
                line += character;
            }
        }
        if (line) lines.push(line);
    }
    return lines;
}

export function fitCardText(context, text, maxWidth, maxHeight, { maximum = 62, minimum = 26, spacing = 1.5 } = {}) {
    for (let size = maximum; size >= minimum; size--) {
        context.font = `600 ${size}px ${SERIF}`;
        const lines = wrapCardText(context, text, maxWidth);
        const lineHeight = size * spacing;
        if (lines.length * lineHeight <= maxHeight && lines.every((line) => context.measureText(line).width <= maxWidth + .5)) {
            return { lines, size, lineHeight, height: lines.length * lineHeight };
        }
    }
    throw new Error("This excerpt does not fit at a readable size. Shorten it or choose a taller card.");
}

function wrapStyledLines(context, data, width, size) {
    const lines = [];
    let line = [], used = 0, space = false;
    function flush() {
        lines.push(line);
        line = [];
        used = 0;
        space = false;
    }
    function run(text, italic) {
        const font = `${italic ? "italic " : ""}600 ${size}px ${SERIF}`;
        context.font = font;
        return { text, font, width: context.measureText(text).width };
    }
    function add(part) {
        line.push(part);
        used += part.width;
    }
    for (const token of data.excerpt.matchAll(/\n|[^\S\n]+|\S+/gu)) {
        const word = token[0];
        if (word === "\n") { flush(); continue; }
        if (!word.trim()) { space = true; continue; }
        const parts = [];
        for (const match of data.italicMask.slice(token.index, token.index + word.length).matchAll(/0+|1+/g)) {
            parts.push(run(word.slice(match.index, match.index + match[0].length), match[0][0] === "1"));
        }
        const wordWidth = parts.reduce((sum, part) => sum + part.width, 0);
        const gap = space && line.length ? run(" ", false) : null;
        if (line.length && used + (gap?.width || 0) + wordWidth > width) flush();
        if (gap && line.length) add(gap);
        space = false;
        for (const part of parts) {
            if (wordWidth <= width) { add(part); continue; }
            for (const character of splitCharacters(part.text)) {
                const glyph = run(character, part.font.startsWith("italic"));
                if (line.length && used + glyph.width > width) flush();
                add(glyph);
            }
        }
    }
    flush();
    return lines;
}

/** Keep shared images at their chosen aspect ratio, without shrinking long excerpts. */
export function layoutSnippetPages(context, data, dimensions) {
    const size = 44;
    const lineHeight = size * 1.5;
    const footerSpace = data.title || data.author ? 260 : 150;
    const availableHeight = dimensions.height - 200 - footerSpace;
    const linesPerPage = Math.floor(availableHeight / lineHeight);
    if (linesPerPage < 1) throw new Error("Choose a larger card size.");
    context.font = `600 ${size}px ${SERIF}`;
    let styledLines = null;
    if (data.italicMask?.includes("1")) {
        const width = dimensions.width - 176;
        styledLines = wrapStyledLines(context, data, width, size);
        if (styledLines.length <= linesPerPage) {
            for (let candidate = data.excerpt.length < 100 ? 82 : 62; candidate > size; candidate--) {
                const rows = wrapStyledLines(context, data, width, candidate);
                if (rows.length * candidate * 1.5 <= availableHeight) {
                    return [{ lines: rows.map(row => row.map(run => run.text).join("")), styledLines: rows, size: candidate, lineHeight: candidate * 1.5 }];
                }
            }
        }
    }
    const lines = styledLines ? styledLines.map(row => row.map(run => run.text).join("")) : wrapCardText(context, data.excerpt, dimensions.width - 176);
    const pages = [];
    for (let start = 0; start < lines.length; start += linesPerPage) {
        pages.push({ styledLines: styledLines?.slice(start, start + linesPerPage), lines: lines.slice(start, start + linesPerPage), size, lineHeight });
    }
    return pages;
}

export function drawSnippetPage(canvas, data, dimensions, pages, pageIndex) {
    const page = pages[pageIndex];
    if (!page) throw new Error("That card page is unavailable.");
    return drawSnippetCard(canvas, data, dimensions, { ...page, pageNumber: pageIndex + 1, pageCount: pages.length });
}

export function drawSnippetCard(canvas, data, dimensions, page = null) {
    canvas.width = dimensions.width;
    const measuring = canvas.getContext("2d");
    if (!measuring) throw new Error("This browser could not create the image. Try an updated browser.");
    const footer = data.title || data.author ? 260 : 150;
    measuring.font = `600 36px ${SERIF}`;
    const readableHeight = wrapCardText(measuring, data.excerpt, dimensions.width - 176).length * 54 + 200 + footer;
    canvas.height = page ? dimensions.height : Math.max(dimensions.height, Math.min(16000, Math.ceil(readableHeight)));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not create the image. Try an updated browser.");
    const palette = SNIPPET_PALETTES[data.style] || SNIPPET_PALETTES.alysum;
    const width = canvas.width;
    const height = canvas.height;
    const padding = 88;
    const textWidth = width - padding * 2;
    const footerSpace = data.title || data.author ? 260 : 150;
    const top = 200;
    const availableHeight = height - top - footerSpace;
    const fit = page && (page.styledLines || page.pageCount > 1)
        ? { ...page, height: page.lines.length * page.lineHeight }
        : fitCardText(context, data.excerpt, textWidth, availableHeight, { maximum: data.excerpt.length < 100 ? 82 : 62, minimum: page ? 44 : 26 });
    const titleFit = data.title ? fitCardText(context, data.title, textWidth, 70, { maximum: 36, minimum: 20, spacing: 1.1 }) : null;
    const authorFit = data.author ? fitCardText(context, data.author, textWidth, 44, { maximum: 25, minimum: 18, spacing: 1.1 }) : null;
    paintCardSurface(context, palette, width, height, data.backgroundImage || null);
    context.strokeStyle = palette.border;
    context.lineWidth = 1.3;
    context.strokeRect(38, 38, width - 76, height - 76);
    context.fillStyle = palette.accent;
    context.fillRect(padding, 96, 52, 2);
    context.font = `19px ${SANS}`;
    context.textBaseline = "top";
    context.fillText(page?.pageCount > 1 ? `WIP EXCERPT · ${page.pageNumber} / ${page.pageCount}` : "WIP EXCERPT", padding, 118);
    context.fillStyle = palette.text;
    context.font = `600 ${fit.size}px ${SERIF}`;
    const quoteTop = page?.pageCount > 1 ? top : top + Math.max(0, (availableHeight - fit.height) / 2);
    fit.lines.forEach((line, index) => {
        const y = quoteTop + index * fit.lineHeight;
        if (!page?.styledLines) { context.fillText(line, padding, y); return; }
        let x = padding;
        for (const run of page.styledLines[index]) {
            context.font = run.font;
            context.fillText(run.text, x, y);
            x += run.width;
        }
    });
    let footerTop = height - footerSpace + 32;
    if (titleFit) {
        context.font = `600 ${titleFit.size}px ${SERIF}`;
        context.fillStyle = palette.text;
        titleFit.lines.forEach((line, index) => context.fillText(line, padding, footerTop + index * titleFit.lineHeight));
        footerTop += titleFit.height + 14;
    }
    if (authorFit) {
        context.font = `600 ${authorFit.size}px ${SERIF}`;
        context.fillStyle = palette.muted;
        authorFit.lines.forEach((line, index) => context.fillText(line, padding, footerTop + index * authorFit.lineHeight));
    }
    if (data.showBrand) {
        context.font = `16px ${SANS}`;
        context.fillStyle = palette.muted;
        context.textAlign = "right";
        context.fillText("ALYSUM", width - padding, height - 82);
        context.textAlign = "left";
    }
    return { width, height, fontSize: fit.size, lines: fit.lines, quoteBounds: { top: quoteTop, bottom: quoteTop + fit.height, right: width - padding }, contentBottom: height - footerSpace };
}
