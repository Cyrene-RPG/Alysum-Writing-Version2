/** Crawler User-Agent patterns shared by middleware, API routes, and SEO helpers. */

const SEARCH_BOT_UA =
    /Googlebot|Google-InspectionTool|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|facebot|facebookexternalhit|Twitterbot|LinkedInBot|Discordbot|Slackbot|WhatsApp|Applebot|Pinterestbot|Embedly|Quora Link Preview|Showyoubot|outbrain|W3C_Validator|Lighthouse|Chrome-Lighthouse/i;

/** AI training / scraping crawlers — must not receive book text. */
const AI_BOT_UA =
    /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|anthropic-ai|Claude-Web|PerplexityBot|Perplexity-User|Bytespider|CCBot|cohere-ai|Diffbot|Meta-ExternalAgent|Google-Extended|Amazonbot|YouBot|Applebot-Extended|ImagesiftBot|omgili|Webzio-Extended|Ai2Bot|Meta-ExternalFetcher|Timpibot|VelenPublicWebCrawler|IAB-Tech-Lab/i;

function isSearchBotUserAgent(userAgent) {
    return SEARCH_BOT_UA.test(String(userAgent || ""));
}

function isAiBotUserAgent(userAgent) {
    return AI_BOT_UA.test(String(userAgent || ""));
}

function isAnyBotUserAgent(userAgent) {
    return isSearchBotUserAgent(userAgent) || isAiBotUserAgent(userAgent);
}

module.exports = {
    SEARCH_BOT_UA,
    AI_BOT_UA,
    isSearchBotUserAgent,
    isAiBotUserAgent,
    isAnyBotUserAgent,
};
