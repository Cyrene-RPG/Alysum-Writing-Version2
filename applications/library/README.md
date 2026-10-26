# Library

Discover, Browse, and My Library at `/library`. Uses `core/library`, `core/publishing`, and `site-appearance/`.

Authors post from Studio gear → `/publish?book=`. This folder is the reader-facing catalog only.

Public and paid chapter readers discourage casual copying through native text-selection/copy-callout styles and scoped clipboard, selection, dragging and context-menu controls. Keyboard copy/cut/select-all shortcuts are blocked for chapter text. Search, comment editors, links, payment controls, scrolling and zoom remain usable. These browser controls do not prevent screenshots or extraction of text delivered to a browser.

## Chapter emoji reactions

The main Library reader places 24 reactions between the author card and chapter comments. The original six stay visible; “More reactions” opens 18 additional choices grouped into Hearts & feelings, Suspense & surprises, and More feelings. Saved extra reactions reopen the picker and appear in the selection summary. Signed-in readers have one reaction per published chapter; selecting another switches it and selecting their current reaction removes it. Counts are shared across accounts. Signed-out readers see counts and a sign-in link. Saves use confirmed server results; an uncertain save requires reloading counts before another write. Detached chapter views ignore late replies.

Apply `supabase/live-site/supabase-chapter-reactions.sql` in the live Supabase SQL Editor. It depends on the existing public-reading and Moderation Center migrations and is safe to re-run. It adds the separate `library_chapter_reaction_votes` table and a narrow RPC; it does not change books, chapter text, comments or existing reader permissions. The RPC checks released chapters and book visibility, uses the authenticated caller's identity, respects commenting/account restrictions, and exposes only aggregate counts plus the caller's own reaction. Raw rows are inaccessible to browser roles. No schema migration is run by the application. Until installed, readers see a temporary-unavailability message.

Checks: `node --test core/tests/library/chapter-reactions.test.js core/tests/library/reader-author.test.js`. The UI tests use `JSDOM_MODULE` and `node --experimental-vm-modules --test core/tests/library/chapter-reactions-ui.mjs`; the isolated real PostgreSQL migration tests use `PGLITE_MODULE` and `node --test core/tests/library/chapter-reactions-database.mjs`. The Chapter reaction checks workflow installs these test-only dependencies automatically.

To upgrade from the original six reactions, re-run the updated `supabase/live-site/supabase-chapter-reactions.sql`. It expands both the table constraint and RPC allowlist without deleting existing votes.

### Existing reaction table compatibility

The migration supports both the original six-column `chapter_reactions` table (`id`, `book_id`, `chapter_id`, `user_id`, `reaction_type`, `created_at`) from `supabase-sibling-tables.sql` and the newer `reaction` layout. It keeps the original table and records intact and imports each account's latest recognized vote per chapter into `library_chapter_reaction_votes`. Original categories are mapped to the nearest current reaction (for example, funny → laugh and spicy → hot). Orphaned or unsupported records remain in the original table. Re-running the migration never overwrites an existing new vote or restores a vote that the reader removed; a null vote marker preserves that removal. Browser roles cannot read or write the new raw table. No reader UI changes are needed.

## Author replies to chapter comments

The book owner can choose Reply on an individual reader comment. The composer identifies its target and can return to a normal comment with Cancel reply without discarding the draft. Confirmed replies are displayed beneath the original thread with an Author badge. Everyone can read the thread. Existing comments.parent_id links and existing comment RLS are used; this does not grant additional database permissions and needs no new SQL when the existing sibling/comment schema is installed. The UI offers the reply control to the book owner; author badges are based on account IDs, not display names.

Reply chains are grouped beneath their original root with context for the actual parent. Existing drafts survive loading, deleting another comment, cancellation and failed posts. Deleting a root removes its cascading reply branch. Late responses to a detached chapter are ignored. A missing profile name falls back to the public author name or Reader, never the account email.

## Library discovery overhaul

Apply `supabase/live-site/supabase-library-hub.sql` once in the live Supabase SQL Editor. Existing public-reading, book subscriptions, and Moderation Center migrations must already be installed (`library`, `reads`, `users`, `book_subscriptions`, `library_book_moderation`, `mc_visible`, `mc_allowed`). The transaction is additive and rerunnable. It never edits manuscript text. Until installed, browsing uses the existing metadata catalog and personal reading state stays on the device; cloud shelves and custom/public lists require this migration.

Discover provides continuing books, genre-based recommendations, new releases, recently released chapters, completed stories, rotating lesser-read books, and opt-in public lists. Browse supports paginated title/author/genre/tag search and combinable genre, tag, warning, length, format, status, rating, and availability filters. Historical books are not shown as freshly updated unless an actual release timestamp exists; description edits do not bump release order. Popularity counts distinct signed-in readers, excluding author reads.

My Library has Reading, Want to read, Finished, Following, and custom shelves. Account-scoped legacy progress is merged into cloud state after sign-in. Pending offline changes remain account-scoped and retry on reopening; remote removals use tombstones so stale devices do not restore them. Public lists require an explicit publishing checkbox. Public responses expose only available book metadata and curator display names, never private shelves or manuscript bodies. Recommendations use selected genres or currently read genres and have visible explanations; no external AI service is involved.

`/library?preview=1` uses invented local sample books and never initializes Supabase. Add `&guest=1` to inspect the signed-out flow. Production boot lives in `page-ui/hub-boot.js`; presentation in `page-ui/hub.js`; metadata APIs and cloud state in `core/library/hub.js` and `cloud-reading.js`.

Validation: `node --test core/tests/library/*.test.js`; `PGLITE_MODULE=... node --test core/tests/library/library-hub-database.mjs`; `PLAYWRIGHT_MODULE_PATH=... node applications/library/tests/library-hub-browser.mjs`. The Library hub checks workflow runs PostgreSQL rules and Chromium/Firefox flows, including 320px and 390px layouts.

### Restored Library layout

The homepage follows four sections: weekly spotlight, Currently Reading, Top Picks for You, then a paginated Browse area. Browse cards restore the original horizontal cover/description layout and per-book shelf dropdown. Personal rows retain the original smaller portrait covers. Desktop browsing uses two card columns; phones use one horizontal card per row.

Home loading uses one metadata-only `library_catalog_rows` request. Recommendations compare genres across previously read and finished books, exclude those books, and never send manuscripts to external services. The UTC-week spotlight uses the same deterministic selection for the same public catalog across readers. Search and advanced Browse retain the hub RPC with public-catalog fallback. Read requests have an eight-second deadline; transient catalog fetch failures retry once and failed promises clear so Retry works. Writes are never retried by this read recovery. No extra SQL is needed for this layout.
