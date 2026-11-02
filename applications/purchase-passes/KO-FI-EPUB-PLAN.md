# Ko-fi integration deployment checklist

**Status: development only. Do not enable live payments until all checks pass.**

## Code present
- Cloudflare Pages Ko-fi webhook: /api/kofi-webhook
- Product mapping: /api/kofi-products (Supabase authenticated)
- Refund revocation: /api/kofi-refund (server-secret authenticated; call from trusted administrative tooling after a confirmed refund)
- License delivery: /api/kofi-delivery (server-secret authenticated)
- Purchase Pass grants and chapter reading: existing /api/purchase-passes
- EPUB chapter selection: core/purchase-access/epub-chapters.js

## Required configuration
- Apply supabase/live-site/supabase-purchase-passes.sql first, then supabase/live-site/supabase-kofi-orders.sql to a backed-up LIVE Supabase database.
- Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, KOFI_VERIFICATION_TOKEN.
- Set RESEND_API_KEY and KOFI_FROM_EMAIL (verified sender), SITE_URL.
- Set KOFI_CODE_ENCRYPTION_KEY (64 hex digits generated securely, held server-side only), KOFI_DELIVERY_SECRET and KOFI_REFUND_SECRET.
- Configure Ko-fi webhook to https://alysumwriting.com/api/kofi-webhook.
- Create an enabled Ko-fi product mapping to each pass; verify pass.sale_enabled is true and prices match exactly.
- Configure an external scheduled POST to /api/kofi-delivery with Authorization: Bearer <KOFI_DELIVERY_SECRET>. The Cloudflare Pages scheduled module is not automatically a deployed cron trigger.

## Blocking production verification
- Run node --test core/purchase-access/tests/*.test.mjs in an environment that supports ES modules.
- Run database migration in a disposable clone and verify RPC signatures and permissions.
- Verify the exact live Ko-fi payload fields and transaction semantics; the verification token is a shared secret, not cryptographic signing.
- Test a real small-value payment with a verified Resend sender and observe the delivered key.
- Test duplicate webhook deliveries, multi-quantity purchases, worker crashes, refunds, revoked grants, chapter-only access and full-book access.
- Implement raw EPUB ZIP parsing and stable chapter import into the existing book manuscript schema; epub-chapters.js only validates already-extracted XHTML.
- Add a visible author configuration UI (the authenticated endpoint exists, but there is no form yet).
- Set up automatic refund event reconciliation; currently refunds must be submitted by trusted administrative tooling.
- Verify buyer redemption page route. Do not expose full EPUB downloads to chapter-only purchasers.
- Validate scheduled delivery retries and Resend idempotency after network failures.

## Security notes
Never commit secrets, plaintext license codes, raw EPUB files, or service role keys. Keep the PR in draft until the above tests pass.
