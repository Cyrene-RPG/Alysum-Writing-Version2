import { rewrite } from "@vercel/functions";

const SEARCH_BOT_UA =
    /Googlebot|Google-InspectionTool|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|facebot|facebookexternalhit|Twitterbot|LinkedInBot|Discordbot|Slackbot|WhatsApp|Applebot|Pinterestbot|Embedly|Quora Link Preview|Showyoubot|outbrain|W3C_Validator|Lighthouse|Chrome-Lighthouse/i;

const AI_BOT_UA =
    /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|anthropic-ai|Claude-Web|PerplexityBot|Perplexity-User|Bytespider|CCBot|cohere-ai|Diffbot|Meta-ExternalAgent|Google-Extended|Amazonbot|YouBot|Applebot-Extended|ImagesiftBot|omgili|Webzio-Extended|Ai2Bot|Meta-ExternalFetcher|Timpibot|VelenPublicWebCrawler|IAB-Tech-Lab/i;

const LIBRARY_PATHS = new Set([]);

export default function middleware(request) {
    const userAgent = request.headers.get("user-agent") || "";
    const isAiBot = AI_BOT_UA.test(userAgent);
    const isSearchBot = SEARCH_BOT_UA.test(userAgent);
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
    matcher: [],
};
