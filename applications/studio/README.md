# Studio

Writer hub: book list, new drafts, and manuscript import (`page-ui/manuscript-import.js` dialog, `page-ui/manuscript-reader.js` file reader). Opens `editor.html`.

Uses `core/writing-engine`, `core/synchronization-engine`, `core/authentication`, `core/desktop`, and `site-appearance/`.


## Individual chapter prices

On the publishing page, select **Locked chapters → How to sell locked chapters → Individual chapter prices**. Each checked chapter gets its own one-time Ko-fi or Payhip product URL and price. Products must be different for each chapter; set the same prices in the connected shop. The existing one-product bundle option remains available. Draft saves preserve these fields.

Before enabling individual pricing in production, rerun `supabase/live-site/supabase-author-chapter-access.sql` in the live Supabase SQL Editor. This script updates purchase matching and public chapter links while preserving existing sales and access. The site's `/applications/studio/pages/payment-setup` page copies the current script and checks readiness. Application code keeps the individual option disabled until the updated SQL is detected; bundle publishing continues to work with the old setup. No new environment variables are required.

The publishing calculator uses selected chapters' current word counts and editable USD chapter estimates. Configured individual USD product prices populate estimates, and the bundle discount and sales inputs update totals immediately. Estimates do not write to external shops. The standalone `/pricing-calculator/` uses the same pricing rules and retains custom prices when word counts change.

Regression checks:

```sh
node --test core/tests/publishing/*.test.js
JSDOM_MODULE=/path/to/jsdom/lib/api.js PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test core/tests/publishing/chapter-pricing-ui.mjs core/tests/publishing/chapter-pricing-database.mjs
```

The second command uses disposable test databases and synthetic manuscript data; it does not connect to production.

The paid-chapter form groups setup into shop, sale type and chapter selection. **Fill prices from calculator** applies suggestions to checked paid chapters, or to their single bundle. It uses word counts and explicit calculator edits, floors paid suggestions at $0.50, and supports USD suggestions. Existing saved prices are preserved until the author clicks the button. Authors must set matching prices in their external shop; this feature does not create products, charge readers or change checkout prices. No additional SQL migration is required for this form change.

## Mixed bundles and single chapters

Select **Bundles + single chapters** in Paid chapters. Each shop product card has one product link, its full product price and a chapter checklist. For example, assign Chapters 1–2 to the first product and Chapter 3 to the second. Add another product for later chapters. A chapter belongs to one product at a time. Existing bundle and individual modes remain available. The calculator fills one price per product and applies the discount only to multi-chapter products.

Rerun `supabase/live-site/supabase-author-chapter-access.sql` after deploying this update. Pricing capability version 2 counts a bundled product's price once, rather than once per chapter. Mixed mode stays disabled on older SQL; existing bundle and individual modes continue working. Existing purchases retain their original chapter IDs even when product contents change or later chapters are added.
