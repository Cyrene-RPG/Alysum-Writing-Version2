# Purchase Pass Lab — test version

A fresh payment-independent test implementation. It shares Alysum sign-in, manuscript ownership and appearance, but does not build on the shop/Stripe payment tables, offer models or their entitlement records. No checkout accounts, payment processing, email sending or new paid services are used.

## Open and activate

After deployment to a review environment, open `/applications/studio/pages/pass-test.html` while signed in with a verified Alysum account. Run `supabase/live-site/supabase-purchase-pass-test.sql` in the existing Supabase project, or use Copy test SQL in the lab. The existing server-only Supabase service-role key is required; there are no new secrets. This migration creates only separate test tables and functions. It does not grant or remove access to live Library books.

## Try the complete flow

1. Choose one of your original written books. Create a Whole book or Chapter bundle test pass with a display price. No price is charged.
2. Choose that pass, generate 1–100 codes, and download the CSV immediately. Codes are displayed once and are kept only in the current response/UI memory. The server stores SHA-256 hashes, not recoverable codes.
3. Preview buyer email to see an example delivery message. It shows the first code in the batch; it sends no email. The exported inventory can be used later with a compatible external checkout that delivers unique codes after purchase. No such integration or claim of provider compatibility is included in this test.
4. Open the lab in another browser/account, choose Redeem & read, and paste a code. The actual database transaction claims it and creates account-bound test access. Reload or use a second device/account to check ownership.
5. Try redeeming that same code from a different account: it is rejected. Same-account retries are idempotent. If that account already owns the pass, a different unused code is left unused.
6. Back as author, cancel unused codes in a batch or revoke a redeemed grant. Cancellation preserves redeemed access. Revoked access cannot be restored by reusing the old code or claiming another code for the same pass.
7. For a whole-book pass, edit your manuscript elsewhere and use Publish latest chapters to this test pass. Existing holders gain those newly published test chapters. Draft edits alone do not update the reading copy. Bundles retain their chapter set and snapshot.

## Boundaries and safety

- These are bearer codes until claimed: anyone holding an unused code can redeem it into one verified account. They are not tied to a checkout email or proof of payment. Share only the intended code, never a batch export.
- Random payload is 128 bits with an `ALYTEST` prefix. Redemption locks the code row and serializes grants for the pass/buyer, with a unique pass/buyer constraint. Browser roles cannot read tables or invoke grant functions directly; service-role HTTP checks authenticate and authorize each action.
- Every pass, code and grant lives in new `purchase_pass_test*` tables. The normal reader, existing shop purchases, EPUB downloads and public listings are untouched. Test codes cannot unlock those systems.
- No free-sample requirement or per-chapter pricing model is inherited. Only whole-book passes and fixed chapter bundles are supported.
- Fan fiction, EPUB editions, non-prose formats, hidden/removed books and books owned by someone else are excluded from pass creation. The author can preview their own snapshot without redeeming a code.
- Limits: 20 passes per author, 1,000 lifetime codes per pass, 100 codes per batch, 500 chapters and 2 MB of snapshot text per pass. There is no pass-deletion tool in this test.
- Lost generation response: raw codes cannot be recovered. Reload to inspect the batch, cancel its unused codes, and deliberately generate a new batch. No silent retry creates extra batches.
- Code responses and private reading text use private/no-store headers and bypass the service worker. Account changes clear displayed codes and reading text; they require reloading the lab.
- Actual provider purchase verification, automatic email delivery, refunds and production migration are outside this test. A real rollout would need a compatible unique-code delivery mechanism and a separate review. This architecture adds no payment-service subscription or registration costs for Alysum; it still uses normal website/database resources.

## Verification

`PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test core/tests/purchase-passes/passes.test.mjs`

Chromium/WebKit browser tests run the real handler and PostgreSQL-compatible schema behind the page fixture at 320/390/1440px. They cover author setup, batch export/email preview, another-account redemption, persistence, duplicate rejection, cancellation and revocation. No test simulates an entitlement using a browser payment flag.
