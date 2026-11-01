# Official Purchase Passes

This version adds account-bound purchased reading editions at `/purchase-passes`, linked from Studio, publishing, Library and original book pages. It is independent of PR #106's lab, legacy shop entitlements and the paused Stripe experiment. Only whole-book passes and fixed chapter bundles are supported, for original prose stories.

## Before release

Run `supabase/live-site/supabase-purchase-passes.sql` in the existing Supabase SQL Editor. This is a new migration: the earlier test SQL does not activate production. It is transactional and rerunnable, creates only new production objects, enables RLS and restricts tables/RPCs to the existing server-only service-role key. It does not copy test codes/grants or change earlier purchases. Confirm the existing `SUPABASE_SERVICE_ROLE_KEY` server environment variable is present. No new checkout accounts or secrets are required by Alysum. Merge/deploy only after review and approval.

## Author workflow

1. Save the original story to the cloud. Open Purchase Passes from Studio, or Manage passes & codes from publishing. Fan fiction cannot be monetized; audiobook, script and EPUB delivery remain separate flows.
2. Choose Whole book or Chapter bundle, a name and a display price/currency. Bundles explicitly select chapters; Whole book includes all current body chapters. Confirm they are ready for pass holders before creating the edition. This snapshots plain text into the private edition; it never makes those chapters public. Chapters separately posted to the free Library remain free.
3. Create a matching product with the author's own permitted external shop. Configure delivery of individual unused codes there, or send them manually after confirming payment. Alysum does not collect or verify payments, send email or automate refunds. The author remains responsible for shop rules, price accuracy and delivery.
4. Generate up to 100 codes, save the CSV immediately and keep it private. Each code is displayed once; only its SHA-256 hash persists. Use the buyer email template to select the particular buyer's code. Never send an entire inventory. A compatible shop's unique-code delivery is optional and must be configured separately; this change does not integrate a provider.
5. Add the external HTTPS product link and press Show purchase link once delivery is ready. Offers start hidden. Hide purchase link stops advertising it without disabling codes or revoking prior access. Lost generation responses cannot be recovered: inspect batches, cancel unused codes and generate a new batch deliberately.
6. Whole-book editions receive later chapters only after Publish latest chapters to this pass. Drafting alone does not update them. Bundles keep their original chapter snapshot; create a separate bundle for later chapters. Existing whole-book holders get the updated edition without a new purchase.
7. Review code batches and reader grants. Cancel unused batch codes without affecting claimed codes. Revoke access intentionally: revocation is terminal for that account/pass, and neither the old code nor a fresh code can restore it. Revocation is not a payment refund.

## Reader workflow

Use Purchased books & redeem code in the Library, or Purchase passes / redeem code on an original book page. Sign in with a verified account, choose an advertised pass and buy in the author's external shop. After receiving its ALYPASS code, redeem it to claim the purchased edition permanently to that account, accessible from other devices with the same account. Sign-in return links preserve the requested book/reader view. Test ALYTEST codes are refused.

Codes are bearer tokens before claim, not proof of payer identity. The first verified account to redeem a code claims it. Same-account retries are idempotent; another account cannot reuse it. Already owning an active pass does not consume another unused code. Contact the author/shop for payment or delivery problems.

## Security and operational boundaries

- 128-bit random codes, SHA-256 hashes, service-role-only tables and RPCs, SQL row/advisory locks and unique pass/buyer grants.
- Verified authentication and owner checks for every mutation. Cross-origin requests rejected. Hidden/removed books and fan fiction fail closed. External links are HTTPS without embedded credentials and are never fetched by the server.
- Redemption limited to 60 attempts per account per ten minutes, including invalid/test codes. Request bodies capped at 32 KB; source snapshots capped at 500 chapters/2 MB text.
- Resource limits currently 20 passes per author, 1,000 lifetime codes per pass and 100 per batch. They are explicit operational caps, not a claim of unlimited free hosting. Ordinary website/database resources and the author's own payment fees still apply.
- No-store API responses and service-worker bypass for codes/private reading. Account changes and page exit clear rendered private content and raw codes. Interrupted reads cannot repopulate the cleared screen.
- Existing free reading, old paid chapter access and EPUB downloads are not migrated or revoked. New passes are read in the dedicated purchased reader. Purchased grants sync across accounts' devices; chapter position is not currently synced by this reader.
- Moderation remains authoritative. Removing the source manuscript or changing its format/work type can make the paid edition unavailable; authors should not delete source books with customers. No production purge or source-deletion tool is included here.

## Verification

`PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test core/tests/purchase-access/passes.test.mjs`

The Purchase Passes CI workflow runs real-handler/PGlite browser fixtures in Chromium and WebKit at 320/390/1440px. Browser identity is synthetic; purchase access is granted by the real SQL transaction, not a browser entitlement flag. It covers offer publication, code CSV/email template, redemption, reload persistence, replay denial, cancellation, revocation and interrupted-read clearing. The suite includes separate model/SQL tests for ownership, moderation, production/test separation and throttling.
