# Stripe payment integration: test branch setup

This release is restricted to Stripe sandbox/test payments and an explicitly configured Cloudflare preview origin. No live key is accepted. Existing support links, `books`, public Library rows and public reading RPCs are not changed. The old Ko-fi/PayPal screen preview remains a simulation.

## What is integrated

- Standard Stripe account connection using OAuth: authenticated Alysum author, browser-bound HTTP-only cookie, expiring one-use state, and test-mode token exchange. Alysum stores the connected account ID, not Stripe access/refresh tokens or passwords.
- Server-created Stripe-hosted Checkout on the author's connected account. No application fee, destination charge, platform balance, or transfer is created.
- Separate private, immutable test editions of unpublished prose drafts. Only the owner can create one. Anyone with its unlisted URL can see its metadata and free sample; paid text requires the author's login or a verified purchase by that reader. Full-book offers require a complete source book and include all chapters; the first stays free.
- Server-side access and purchase checks. Full paid text is absent from public metadata responses, public Library data, local listing caches, and the screen preview's local grants. The private reader never stores chapter bodies for offline use.
- Verified Stripe Connect signatures, replay window, account/session/buyer/amount/currency/order matching, server retrieval of the actual charge, idempotent event processing, terminal access revocation for refunds/disputes, and account deauthorization handling. All responses use private/no-store headers and the service worker bypasses this API.
- Prices are immutable for an edition. Create a new edition for a new price/content set; existing verified purchases remain attached to the old snapshot.

## Set up the server

1. In Supabase SQL Editor, review and run `supabase/live-site/supabase-paid-access-test.sql`. There is a **Copy Supabase SQL** button on Connected payments. It only adds five isolated tables, indexes and two service-only functions. No existing table or RLS policy is rewritten. Prefer a staging project; when using the current project these tables are still shared database resources, even though only the preview API uses them.
2. In Cloudflare Pages for `alysum-writing-version2`, add these **preview environment** values. Never put secret values in GitHub, frontend files, or chat:

| Variable | Value |
| --- | --- |
| `PAID_ACCESS_ENABLED` | `true` |
| `PAID_ACCESS_ORIGIN` | `https://experiment-author-paid-acces.alysum-writing-version2.pages.dev` |
| `STRIPE_SECRET_KEY` | Your platform's Stripe **test** secret key (`sk_test_…`) |
| `STRIPE_CONNECT_CLIENT_ID` | Your Connect **test** client ID (`ca_…`) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret for the connected-account test webhook (`whsec_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key for the configured Supabase project |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Optional if using the current Alysum project; otherwise set both and use the matching staging authentication client |

3. Enable the Standard-account OAuth flow supported by your Stripe Connect platform. Register this exact redirect URI in its OAuth settings:

`https://experiment-author-paid-acces.alysum-writing-version2.pages.dev/api/paid-access?action=stripe-callback`

If Stripe does not offer Standard OAuth for your platform, stop here: its onboarding flow must be adapted before connection. Never substitute a manually pasted merchant ID as proof of account ownership.

4. Create a Stripe **test, connected-account** webhook endpoint:

`https://experiment-author-paid-acces.alysum-writing-version2.pages.dev/api/paid-access?action=stripe-webhook`

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `account.updated`, and `account.application.deauthorized`. Configure it to receive events on connected accounts, not just the platform account. Set the returned signing secret above. It must deliver v1 event payloads with `account`, `livemode`, `type` and `data.object`.

5. Redeploy the test branch after changing preview environment variables. Supabase Auth must allow the preview URL for sign-in returns. The Connected payments page reports missing configuration and whether the tables are reachable.

## Test with actual Stripe sandbox accounts

1. Open `/applications/studio/pages/connected-payments` on the preview, sign into Alysum as an author, and choose **Continue to Stripe**. Authorize your Standard account through Stripe's test flow. Check that the connected account can create test charges.
2. Choose an unpublished novel draft, chapters, free samples and price. Create its private test edition. This intentionally creates a new unlisted reading link; it does not change the source manuscript or publish it to Library. Avoid real/private manuscripts for initial tests; use an invented scratch draft.
3. Open the link as a separate reader account. Free chapters work without purchase. The author has access to their own work and cannot buy it from themselves.
4. Use Stripe's documented test cards at Stripe-hosted Checkout. Confirm the charge is on the connected account, the platform takes no fee, and only the purchased chapter set unlocks after server verification.
5. Refresh and sign back in: purchases are associated with the Alysum account. Test cancellation, declined card, pending verification, retry, two browser tabs, expired checkout, refund, partial refund and dispute. Any refund/dispute conservatively removes all access granted by that purchase. A late payment event cannot undo that revocation.

## Before live release

No provider credentials or migration were applied by Codex. The provider path is covered with mocked protocol tests; it still requires a real Stripe sandbox exercise after setup. The SQL must also be executed and verified in a staging database before use.

This does not retrofit a paywall over existing public chapters. A future Library rollout needs transactional publishing, private replacements for all public text surfaces and scheduled releases, cache cleanup, author refunds/support controls, content-removal and post-purchase revision policy, provider-specific fees/loss responsibility review, and an approved live-mode configuration. Do not enable live charges by changing a key: this server rejects them.

Public provider references:
- https://docs.stripe.com/connect/oauth-reference
- https://docs.stripe.com/connect/direct-charges
- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/testing
