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

// Initialize Vercel Analytics
inject();
