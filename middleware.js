import { createRequire } from "node:module";
import { rewrite } from "@vercel/functions";

const require = createRequire(import.meta.url);
const { isSearchBotUserAgent, isAiBotUserAgent } = require("./lib/bot-agents.js");

const LIBRARY_PATHS = new Set(["/read.html", "/author.html", "/library.html"]);

export default function middleware(request) {
    const userAgent = request.headers.get("user-agent") || "";
    const isAiBot = isAiBotUserAgent(userAgent);
    const isSearchBot = isSearchBotUserAgent(userAgent);
    if (!isAiBot && !isSearchBot) return;

    const url = new URL(request.url);
    if (!LIBRARY_PATHS.has(url.pathname)) return;

    const preview = new URL("/api/bot-preview", url.origin);
    preview.search = url.search;
    preview.searchParams.set("_path", url.pathname);
    if (isAiBot) preview.searchParams.set("_ai", "1");
    return rewrite(preview);
}

export const config = {
    matcher: ["/read.html", "/author.html", "/library.html"],
};
