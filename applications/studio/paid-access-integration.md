# Author-owned chapter access

Ko-fi Shop and Payhip one-time products can unlock chapters inside Alysum. Authors receive payments through their own service; Alysum does not create charges or require a Stripe platform account.

## Activation

Run `supabase/live-site/supabase-author-chapter-access.sql` in the existing live Supabase SQL Editor. The `/applications/studio/pages/payment-setup` page has a copy button and readiness check. The existing server-only `SUPABASE_SERVICE_ROLE_KEY` is required; no provider secrets are added by the site owner.

Authors open `/applications/studio/pages/connected-payments`, choose a service, paste their own Ko-fi verification token or Payhip API key, and copy their unique webhook address back into their service. Only the SHA-256 verifier is stored in service-only tables. Raw tokens, API keys and receipt bodies are not logged or persisted. For Payhip enable Paid and Refunded events. Replacing a connection verifier requires updating the provider token and does not remove prior grants.

In Publish, select chapters to post, choose Locked chapters, the connected shop, its exact product URL, price and currency. One product unlocks the selected locked chapter bundle. Every chapter can be locked for a completed book. Other selected chapters remain free. The separate optional purchase-link field remains an external link, not an automatic unlock setting.

Readers must sign in using a verified Alysum account and use that email at checkout. After notification, reading claims purchases to that account; later verified account-email changes retain claimed access. Purchases before signup can be claimed after email verification. Use Check my access on the locked reader screen after returning from checkout. Gifts, tips, memberships, unsupported providers, zero-price orders and explicit test events do not grant access. A discounted cart below the configured minimum will not unlock.

## Security and delivery

The server verifies the author's provider verifier before processing any receipt and matches its exact product, currency and minimum total. Ko-fi reports the cart total, so the configured minimum is a cart minimum, not a proof of each line item's price. Normal provider checkout remains authoritative for product pricing. The connection+transaction ledger prevents duplicate grants and makes refunds terminal even when a later payment event arrives. Each purchase grants the chapter IDs configured at that time, not all future chapters. Unmatched products do not grant access.

Private snapshots are read from an owned cloud manuscript on the server. Library receives locked placeholders with empty content. A database trigger strips locked bodies even for older publishing clients. Changes to chapter locks sanitize the existing listing in the same database transaction. A failed later public save can leave the previous listing newly locked; retry publishing after fixing the error. Already-downloaded copies of formerly free chapters cannot be recalled.

Private text is delivered through `/api/author-access?action=read` after verified Supabase authentication and an owner/grant check. Reads return only currently published locked chapters and respect Library moderation. Responses are private/no-store and bypass the service worker. Private replies stay in memory, not local listing storage. The reader renders paid prose with textContent. Anonymous clients receive no private text; editing a button, URL or local progress never grants access.

Payhip refund events revoke the entire matching order's grant, including partial refunds. Ko-fi's webhook reports payments only; refunds must be revoked by the author under Recent unlocks. Membership expiry and cancellations are deliberately not supported yet. Existing Stripe prototype code is inactive and not used by this flow.

## Verification

Run `node --test core/tests/publishing/*.test.js core/tests/writing-engine/draft-revisions.test.js core/tests/writing-engine/draft-switcher.test.js core/tests/writing-engine/promote-draft.test.js`.

A real provider sale and actual database migration must be verified after activation. Local protocol tests do not move money or apply production SQL.
