# Shared excerpt previews

Reading links use `/shared-section/<token>` so link-preview fetchers can receive metadata in the initial HTML. Cloudflare Pages and Vercel use the same server handler. Previews show the saved excerpt title, its provided author, Alysum's existing image/branding, and the first sentence (up to 240 characters). The reading page keeps its existing appearance and displays only the selected snapshot.

The existing anonymous `get_wip_excerpt` RPC checks the token and revocation. No manuscript tables are read directly. Responses disable browser/CDN caching, indexing and referrers. There are no schema migrations or book writes. Sharing platforms may retain their own cached previews.

Older `/shared-section#<token>` links continue to open through the existing reader, with a generic branded preview. The fragment is never sent to link-preview fetchers, so those already-posted links cannot receive excerpt-specific metadata. Copying a saved link again from **Your reading links** produces the new preview-enabled URL without recreating or changing the snapshot.

Run `node --test core/tests/publishing/shared-section.test.js core/tests/publishing/excerpts.test.js` to check first-sentence metadata, HTML escaping, revocation, failure handling, old-link compatibility and hosting routes. Real preview appearance and refresh timing are controlled by the sharing app.

Shared reading pages disable native text selection, mobile copy callouts, and excerpt copy/cut/paste, drag and context-menu actions. The same controls load independently of authentication for both path-based and legacy fragment links. Keyboard scrolling, zoom and assistive reading remain available. This discourages casual copying, but does not prevent screenshots, OCR or extracting text delivered to the browser.

Excerpt text carries a repeating decorative watermark with the provided author name and “Shared excerpt · Alysum”; unnamed excerpts use “Shared excerpt” and “Alysum.” The watermark repeats for the full text height, follows the reader theme, ignores pointer events and is not announced by screen readers. Current links include it in server-rendered HTML; legacy links apply the same local SVG mask after loading. Names are escaped, and no watermark text is sent to another service. It discourages reposting screenshots but does not disable device capture.

Before reading, visitors see a copyright and permitted-use notice naming the provided author (or “the author” when unnamed), including explicit restrictions on AI submission, detectors, training, datasets, rewriting and analysis. “I understand — Read excerpt” reveals the text and focuses its heading. The notice returns on refresh, reopening and browser history restoration; no acknowledgement is stored or sent. Invalid/revoked links do not show a notice. This is a reading acknowledgement, not a technical screenshot barrier.
