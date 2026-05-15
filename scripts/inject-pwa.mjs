#!/usr/bin/env node
/**
 * Idempotent PWA tag injector.
 *
 * For every *.html in the project root, ensures the following exists inside <head>:
 *   - <link rel="manifest">
 *   - PWA meta tags (theme-color, color-scheme, mobile-web-app-capable, apple-touch-icon, etc.)
 *   - <script src="js/pwa-register.js" defer>
 *
 * Wrapped in marker comments so re-running just replaces the block in place.
 * Safe to run any number of times.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const START = '<!-- ALYSUM:PWA:START -->';
const END = '<!-- ALYSUM:PWA:END -->';

const BLOCK = [
    START,
    '<link rel="manifest" href="manifest.webmanifest">',
    '<meta name="theme-color" content="#7c3aed" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#020b18" media="(prefers-color-scheme: dark)">',
    '<meta name="color-scheme" content="dark light">',
    '<meta name="application-name" content="Alysum">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="Alysum">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="msapplication-TileColor" content="#7c3aed">',
    '<meta name="msapplication-TileImage" content="Alysum-3.png">',
    '<link rel="icon" type="image/png" sizes="any" href="Alysum-3.png">',
    '<link rel="apple-touch-icon" href="Alysum-3.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="Alysum-3.png">',
    '<script src="js/pwa-register.js" defer></script>',
    END,
].map((line) => '    ' + line).join('\n');

const HEAD_OPEN = /<head(\s[^>]*)?>/i;

async function processFile(file) {
    const full = path.join(ROOT, file);
    const original = await readFile(full, 'utf8');

    let updated = original;

    if (updated.includes(START) && updated.includes(END)) {
        const re = new RegExp(`[ \\t]*${START}[\\s\\S]*?${END}\\n?`, 'g');
        updated = updated.replace(re, '');
    }

    const m = updated.match(HEAD_OPEN);
    if (!m) {
        console.warn(`  ! ${file}: no <head> tag, skipping`);
        return false;
    }
    const idx = m.index + m[0].length;
    updated = updated.slice(0, idx) + '\n' + BLOCK + updated.slice(idx);

    if (updated === original) return false;
    await writeFile(full, updated, 'utf8');
    return true;
}

async function main() {
    const entries = await readdir(ROOT, { withFileTypes: true });
    const htmls = entries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.html'))
        .map((e) => e.name)
        .sort();

    console.log(`Injecting PWA block into ${htmls.length} HTML file(s)...`);
    let touched = 0;
    for (const name of htmls) {
        const changed = await processFile(name);
        console.log(`  ${changed ? '\u2713' : '-'} ${name}`);
        if (changed) touched++;
    }
    console.log(`\nDone. ${touched} file(s) updated.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
