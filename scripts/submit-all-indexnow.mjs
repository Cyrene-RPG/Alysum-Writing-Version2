#!/usr/bin/env node
/**
 * Submit all published Alysum URLs to IndexNow + ping Google/Bing sitemaps.
 * Run after deploy: npm run index:all
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
    createPublicClient,
    fetchPublishedBooks,
    fetchAuthorUsernames,
    siteOrigin,
    absUrl,
} = require(path.join(ROOT, "lib", "seo-public.js"));
const { notifySearchEngines, bookReadUrl, authorPageUrl } = require(path.join(ROOT, "lib", "index-notify.js"));

async function main() {
    const origin = siteOrigin();
    console.log(`Submitting URLs for ${origin} …`);

    const supabase = createPublicClient();
    const books = await fetchPublishedBooks(supabase);
    const urls = [absUrl(origin, "/"), absUrl(origin, "/library.html")];

    for (const book of books) {
        urls.push(bookReadUrl(origin, book.id));
        console.log(`  + ${book.title} by ${book.author}`);
    }

    const authorIds = books.filter((b) => !b.isAnonymous && b.ownerUid).map((b) => b.ownerUid);
    const usernames = await fetchAuthorUsernames(supabase, authorIds);
    for (const username of usernames.values()) {
        urls.push(authorPageUrl(origin, username));
    }

    const result = await notifySearchEngines(urls, origin);
    console.log("\nIndexNow:", result.indexNow);
    console.log("Sitemap ping:", result.sitemapPing);
    console.log(`\nDone. Submitted ${result.urls.length} URL(s).`);
    console.log("Bing/DuckDuckGo often pick these up within hours; Google may take 1–7 days.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
