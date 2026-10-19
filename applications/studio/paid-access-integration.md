# Author purchase links

The live publishing flow uses an optional `purchaseUrl` stored in existing book publishing metadata and Library JSON. It requires no new SQL, platform payment account, keys or webhooks.

Authors add their own HTTPS shop or membership URL in Publish. Readers see “Buy from author” on the book page. Payment and paid content delivery happen on the linked service; purchases do not unlock Alysum chapters. Every selected chapter posted to Alysum remains free. Leave paid content unselected.

The earlier Stripe implementation remains inactive backend code for existing records; it is not part of the publishing flow. Do not configure Stripe or run the former paid-access migration for purchase links. The old payment and setup pages now explain the author-link flow.
