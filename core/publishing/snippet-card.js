/** Only the text and attribution explicitly confirmed for an exported image. */
export const MAX_CARD_CHARACTERS = 30000;
export const CARD_FORMATS = Object.freeze({ portrait: { width: 1080, height: 1350 }, square: { width: 1080, height: 1080 }, story: { width: 1080, height: 1920 } });
export const CARD_STYLES = Object.freeze(["alysum", "paper", "rose"]);

export function normalizeSnippetCard(value) {
    if (!value || typeof value !== "object") throw new Error("Add an excerpt to create a card.");
    const excerpt = typeof value.excerpt === "string" ? value.excerpt.replace(/\r\n?/g, "\n").trim() : "";
    if (!excerpt) throw new Error("Select text in your WIP, or paste an excerpt below.");
    if (excerpt.length > MAX_CARD_CHARACTERS) throw new Error(`Choose an excerpt of ${MAX_CARD_CHARACTERS.toLocaleString()} characters or fewer.`);
    const title = typeof value.title === "string" ? value.title.trim() : "";
    const author = typeof value.author === "string" ? value.author.trim() : "";
    if (title.length > 80 || author.length > 80) throw new Error("Title and author must each be 80 characters or fewer.");
    return { excerpt, title, author, style: CARD_STYLES.includes(value.style) ? value.style : "alysum", format: Object.hasOwn(CARD_FORMATS, value.format) ? value.format : "portrait", showBrand: value.showBrand !== false };
}

export function cardFileName(title, pageNumber = 0) {
    const name = String(title || "snippet").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/g, "").toLowerCase();
    return `${name || "snippet"}-card${pageNumber ? `-page-${String(pageNumber).padStart(2, "0")}` : ""}.png`;
}
