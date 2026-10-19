# Access and pricing prototype

Branch: `experiment/author-paid-access`. Main is unchanged.

Open `/publish?book=paid-access-sample&paidAccessTest=1` on the branch's Cloudflare Pages preview. No sign-in is required. The feature only activates on preview subdomains and localhost with this exact sample book and query parameter. The production domain and the main Pages domain cannot activate it.

The existing publishing page shows a six-chapter invented sample book and an Access & pricing section. Choose free reading, paid individual chapters, a chapter bundle, or a complete-book purchase (requires marking the work complete). The first chapter is a free sample for whole-book purchases. Prices accept 0.50–1,000.00 in USD, GBP, EUR, CAD or AUD. The provider connection is a clearly labelled simulation. No payment account URLs or credentials are collected.

Preview as reader opens Alysum's existing reader with free/paid/purchased chapter labels and a test checkout. Complete, cancel, retry after failure, refresh, switch chapters and return to pricing. Individual purchases unlock one chapter; bundles unlock their included chapters; book purchases unlock the selected book. Purchases persist on this device when settings are unchanged. Changing the plan or posted chapter set starts a fresh test. Reset test purchases clears only simulated grants.

All state is stored under `alysum:paid-access-test:v1` on this preview origin. Nothing is written to Supabase, no live listings are updated and no charges are made. Sample chapters are short so the flow can be tested quickly; normal publication word minimums are unchanged. Existing production publishing and reading continue to use their original paths. Test checkout is never an actual provider redirect.

## Required before accepting payments

This is a UI prototype, not a secure paywall. The demo texts are public sample fixtures. Local test grants must never become production authorization.

1. Decide the first provider and its supported account linking flow. Verify ownership of each connected creator account. Payments go to that creator, without a platform balance or revenue share.
2. Add private chapter storage and server-side entitlement checks. Existing public `library.data.chapters`, catalog/RPC responses, SEO previews, feeds, previous caches and any direct book routes must not expose paid text. Existing full-text public listings cannot be secured by hiding text in the reader.
3. Create server-owned offers and purchase references bound to the authenticated reader, author, book/chapter set, amount and currency. Verify provider notifications server-side. Make retries idempotent; never trust a browser success redirect or email alone as proof.
4. Support delayed verification, pending transactions, duplicate notifications, refunds, chargebacks and author disconnects. Settle the treatment of chapter changes and removal after purchase. Preserve valid purchases when authors change future prices.
5. Ko-fi's webhook reports payments but not membership cancellations. Confirm item-to-purchase mapping and a secure reader claim process before implementing one-time purchases; membership access needs a separate expiry/reconciliation design.
6. Test with provider sandbox/test notifications and isolated backend data before enabling real purchases. No SQL or provider setup is required for this prototype.
