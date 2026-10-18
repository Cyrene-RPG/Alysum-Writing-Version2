/** Canvas presentation only. Inputs are plain text and explicit style options. */
export const SNIPPET_PALETTES = Object.freeze({
    alysum: { background: "#191526", wash: "#312243", text: "#f5eedf", muted: "#c2b6c8", accent: "#cfb579", border: "#665374" },
    paper: { background: "#f5efe2", wash: "#ede3d0", text: "#332c30", muted: "#74645e", accent: "#8d6946", border: "#cfbfa5" },
    rose: { background: "#f2e5e6", wash: "#e4ced8", text: "#402d3c", muted: "#816776", accent: "#965b78", border: "#cfafb9" },
});
const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function splitCharacters(text) {
    if (typeof Intl.Segmenter === "function") return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (item) => item.segment);
    return Array.from(text);
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

export function drawSnippetCard(canvas, data, dimensions) {
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
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
    const fit = fitCardText(context, data.excerpt, textWidth, availableHeight, { maximum: data.excerpt.length < 100 ? 82 : 62, minimum: 26 });
    const titleFit = data.title ? fitCardText(context, data.title, textWidth, 70, { maximum: 36, minimum: 20, spacing: 1.1 }) : null;
    const authorFit = data.author ? fitCardText(context, data.author, textWidth, 44, { maximum: 25, minimum: 18, spacing: 1.1 }) : null;
    context.fillStyle = palette.background;
    context.fillRect(0, 0, width, height);
    const wash = context.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, palette.wash);
    wash.addColorStop(.7, palette.background);
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = palette.border;
    context.lineWidth = 1.3;
    context.strokeRect(38, 38, width - 76, height - 76);
    context.fillStyle = palette.accent;
    context.fillRect(padding, 96, 52, 2);
    context.font = `19px ${SANS}`;
    context.textBaseline = "top";
    context.fillText("WIP EXCERPT", padding, 118);
    context.fillStyle = palette.text;
    context.font = `600 ${fit.size}px ${SERIF}`;
    const quoteTop = top + Math.max(0, (availableHeight - fit.height) / 2);
    fit.lines.forEach((line, index) => context.fillText(line, padding, quoteTop + index * fit.lineHeight));
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
