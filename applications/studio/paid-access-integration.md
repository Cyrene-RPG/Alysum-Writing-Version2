# Author payments — production setup

This is the real Stripe Connect implementation. Live purchases charge the author's connected Standard Stripe account directly. Alysum takes no application fee and creates no platform transfers. It provides verified reading access.

## Required setup on main

1. Open the site-owner setup page `/applications/studio/pages/payment-setup` on Alysum. Click **Copy Supabase SQL** and run that exact script in Supabase SQL Editor. It creates private payment tables and upgrades an earlier sandbox schema if present. Existing sandbox rows stay sandbox rows. It does not rewrite books, public Library data or existing publishing policies.
2. Set these in Cloudflare Pages → `alysum-writing-version2` → **Production** environment. Secret values belong there, never in chat or GitHub.

| Setting | Value |
| --- | --- |
| `PAID_ACCESS_ENABLED` | `true` |
| `PAID_ACCESS_MODE` | `live` |
| `PAID_ACCESS_ORIGIN` | Your exact canonical HTTPS site origin, e.g. `https://alysumwriting.com` |
| `STRIPE_SECRET_KEY` | Your Stripe platform's live key, starting `sk_live_` |
| `STRIPE_CONNECT_CLIENT_ID` | Your Stripe Connect live OAuth client ID, starting `ca_` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret for the live connected-account webhook, starting `whsec_` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key for Alysum's Supabase project, if not already configured |

The server uses Alysum's current Supabase URL and publishable key by default. Override `SUPABASE_URL` and `SUPABASE_ANON_KEY` only alongside a matching frontend authentication client.

3. In Stripe Connect, enable the Standard-account OAuth flow supported by your platform. Register this exact redirect using your configured origin:

`https://alysumwriting.com/api/paid-access?action=stripe-callback`

If your Stripe platform does not offer Standard OAuth, its onboarding must be adapted before this connection can activate. Manually entering an author's merchant ID is not a verified connection.

4. Register a **live connected-account** webhook at:

`https://alysumwriting.com/api/paid-access?action=stripe-webhook`

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `account.updated`, and `account.application.deauthorized`. Events must come from connected accounts and use v1 event payloads with `account`, `livemode`, `type` and `data.object`. Store that endpoint's signing secret above.

5. Redeploy main after setting environment values. The author payments page enables **Connect Stripe** only after configuration and database checks succeed. Each author connects their own Stripe account through Stripe; they do not paste payment credentials into Alysum.

## Publishing and reading

In the existing publishing page, **Access & pricing** links to paid editions. Choose an unpublished saved prose draft, included chapters, free samples, a price and currency. Sell individual chapters, a bundle or an entire completed book. Full-book pricing includes every chapter and leaves the first free as a sample.

Publishing creates an immutable private edition with an unlisted reading link. It does not alter the source manuscript or publish chapter text to the public Library. Previously public books are excluded: hiding already-public chapters would not secure copies already delivered to readers. This release presents prose as plain text and does not yet place paid editions into public Library discovery.

Readers can read free samples, sign into Alysum, and pay the author at Stripe-hosted Checkout. The server checks the provider, connected account, buyer, order, amount, currency, payment mode and captured payment before granting access. A browser success redirect or a localStorage flag never grants access. Readers and authors can find their purchases/editions again on Connected payments.

Refunds, partial refunds and disputes conservatively revoke the access supplied by that purchase. Later payment notifications cannot restore reversed access. Disconnecting an author stops new purchases while existing verified reading rights remain. A new price or content set creates a new edition; existing purchases remain tied to the version bought.

## Deployment and validation limits

Code deployment does not create a Stripe account, accept its contracts, configure its live keys/webhook, or run Supabase SQL. Those setup steps remain required. Protocol tests use mocked provider responses; no real charge has been made by Codex and the migration has not been executed by Codex. Complete provider and database validation before inviting buyers. Stripe's account/fee/liability settings still govern the connected accounts; direct payment routing does not remove every platform responsibility.

For development, an explicitly configured `PAID_ACCESS_MODE=test` accepts only `sk_test_` keys and sandbox events. Live and test accounts, states, editions and purchases remain separated in storage and API authorization. Never relabel a test purchase as live.

Provider references:
- https://docs.stripe.com/connect/oauth-reference
- https://docs.stripe.com/connect/direct-charges
- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/webhooks
