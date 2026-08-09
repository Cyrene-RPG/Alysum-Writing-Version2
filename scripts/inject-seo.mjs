#!/usr/bin/env node
/**
 * Idempotent SEO tag injector for Alysum HTML pages.
 *
 * Reads scripts/seo-pages.json and injects a standardized <!-- ALYSUM:SEO --> block
 * into each configured page's <head>. Safe to re-run.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(ROOT, "scripts", "seo-pages.json");

const START = "<!-- ALYSUM:SEO:START -->";
const END = "<!-- ALYSUM:SEO:END -->";

const HEAD_OPEN = /<head(\s[^>]*)?>/i;
const HTML_OPEN = /<html(\s[^>]*)?>/i;
const META_DESC = /<meta\s+name=["']description["'][^>]*>\s*/gi;
const META_CHARSET = /<meta\s+charset=["'][^"']*["']\s*\/?>\s*/gi;

function escHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
}

function buildBlock(page, defaults) {
    const prefix = page.rootPrefix || "";
    const image = escHtml(page.image || defaults.image);
    const title = escHtml(page.title);
    const description = escHtml(page.description || "");
    const type = escHtml(page.type || "website");
    const locale = escHtml(defaults.locale);
    const siteName = escHtml(defaults.siteName);
    const twitterCard = escHtml(defaults.twitterCard);
    const canonicalPath = escHtml(page.path);
    const robots = page.index === false ? "noindex, nofollow" : "index, follow";
    const scriptSrc = `${prefix}js/seo-meta.js`;

    const lines = [
        START,
        `<meta charset="UTF-8">`,
        description ? `<meta name="description" content="${description}">` : "",
        `<meta name="robots" content="${robots}">`,
        `<link rel="canonical" data-seo-path="${canonicalPath}" href="">`,
        `<meta property="og:site_name" content="${siteName}">`,
        `<meta property="og:locale" content="${locale}">`,
        `<meta property="og:type" content="${type}">`,
        `<meta property="og:title" content="${title}">`,
        description ? `<meta property="og:description" content="${description}">` : "",
        `<meta property="og:image" content="${image}">`,
        `<meta name="twitter:card" content="${twitterCard}">`,
        `<meta name="twitter:title" content="${title}">`,
        description ? `<meta name="twitter:description" content="${description}">` : "",
        `<meta name="twitter:image" content="${image}">`,
    ];

    if (page.jsonLd) {
        const blocks = Array.isArray(page.jsonLd) ? page.jsonLd : [page.jsonLd];
        for (const ld of blocks) {
            lines.push(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
        }
    }

    lines.push(`<script src="${scriptSrc}"></script>`, END);

    return lines.filter(Boolean).map((line) => "    " + line).join("\n");
}

function ensureLang(html) {
    if (/lang=["']en["']/i.test(html)) return html;
    return html.replace(HTML_OPEN, (match) => {
        if (/lang=/i.test(match)) return match;
        return match.replace("<html", '<html lang="en"');
    });
}

function removeExistingSeoBlock(html) {
    if (!html.includes(START)) return html;
    const re = new RegExp(`[ \\t]*${START}[\\s\\S]*?${END}\\n?`, "g");
    return html.replace(re, "");
}

function removeDuplicateMeta(html) {
    let updated = html.replace(META_DESC, "");
    const charsetMatches = [...updated.matchAll(META_CHARSET)];
    if (charsetMatches.length > 1) {
        let kept = false;
        updated = updated.replace(META_CHARSET, (match) => {
            if (kept) return "";
            kept = true;
            return match;
        });
    }
    return updated;
}

function insertPoint(html) {
    const analyticsEnd = html.indexOf("<!-- ALYSUM:ANALYTICS:END -->");
    if (analyticsEnd !== -1) {
        return analyticsEnd + "<!-- ALYSUM:ANALYTICS:END -->".length;
    }
    const pwaEnd = html.indexOf("<!-- ALYSUM:PWA:END -->");
    if (pwaEnd !== -1) {
        return pwaEnd + "<!-- ALYSUM:PWA:END -->".length;
    }
    const headMatch = html.match(HEAD_OPEN);
    if (headMatch) return headMatch.index + headMatch[0].length;
    return -1;
}

function ensureTitle(html, title) {
    if (!title) return html;
    const escaped = escHtml(title);
    if (/<title>[^<]*<\/title>/i.test(html)) {
        return html.replace(/<title>[^<]*<\/title>/i, `<title>${escaped}</title>`);
    }
    return html;
}

async function processFile(relPath, page, defaults) {
    const full = path.join(ROOT, relPath);
    let original;
    try {
        original = await readFile(full, "utf8");
    } catch {
        console.warn(`  ! ${relPath}: file not found, skipping`);
        return false;
    }

    let updated = removeExistingSeoBlock(original);
    updated = removeDuplicateMeta(updated);
    updated = ensureLang(updated);

    const block = buildBlock(page, defaults);
    const idx = insertPoint(updated);
    if (idx === -1) {
        console.warn(`  ! ${relPath}: no <head> tag, skipping`);
        return false;
    }

    updated = updated.slice(0, idx) + "\n" + block + updated.slice(idx);
    updated = ensureTitle(updated, page.title);

    if (updated === original) return false;
    await writeFile(full, updated, "utf8");
    return true;
}

async function main() {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const config = JSON.parse(raw);
    const { defaults, pages } = config;

    const entries = Object.entries(pages).sort(([a], [b]) => a.localeCompare(b));
    console.log(`Injecting SEO block into ${entries.length} HTML file(s)...`);

    let touched = 0;
    for (const [relPath, pageConfig] of entries) {
        const changed = await processFile(relPath, pageConfig, defaults);
        console.log(`  ${changed ? "\u2713" : "-"} ${relPath}`);
        if (changed) touched++;
    }

    console.log(`\nDone. ${touched} file(s) updated.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
