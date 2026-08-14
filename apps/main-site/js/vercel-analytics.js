/**
 * Vercel Web Analytics Initialization
 *
 * This file initializes Vercel Web Analytics using the @vercel/analytics package.
 * It should be included in all HTML pages that need analytics tracking.
 *
 * Usage: Add this script to your HTML with type="module":
 * <script type="module" src="/js/vercel-analytics.js"></script>
 */

import { inject } from "https://esm.sh/@vercel/analytics@1";

const host = typeof location !== "undefined" ? location.hostname : "";
const isLocalDev =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local");

// Vercel serves /_vercel/insights/script.js only on deployed projects with Web Analytics enabled.
if (!isLocalDev) {
    inject();
}
