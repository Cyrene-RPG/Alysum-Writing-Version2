# Shared excerpt previews

Reading links use `/shared-section/<token>` so link-preview fetchers can receive metadata in the initial HTML. Cloudflare Pages and Vercel use the same server handler. Previews show the saved excerpt title, its provided author, Alysum's existing image/branding, and the first sentence (up to 240 characters). The reading page keeps its existing appearance and displays only the selected snapshot.

The existing anonymous `get_wip_excerpt` RPC checks the token and revocation. No manuscript tables are read directly. Responses disable browser/CDN caching, indexing and referrers. There are no schema migrations or book writes. Sharing platforms may retain their own cached previews.

Older `/shared-section#<token>` links continue to open through the existing reader, with a generic branded preview. The fragment is never sent to link-preview fetchers, so those already-posted links cannot receive excerpt-specific metadata. Copying a saved link again from **Your reading links** produces the new preview-enabled URL without recreating or changing the snapshot.

Run `node --test core/tests/publishing/shared-section.test.js core/tests/publishing/excerpts.test.js` to check first-sentence metadata, HTML escaping, revocation, failure handling, old-link compatibility and hosting routes. Real preview appearance and refresh timing are controlled by the sharing app.
