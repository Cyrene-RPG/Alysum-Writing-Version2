# Library

Public browse shelf at `/library`. Uses `core/library`, `core/publishing`, and `site-appearance/`.

Authors post from Studio gear → `/publish?book=`. This folder is the reader-facing catalog only.

Public and paid chapter readers discourage casual copying through native text-selection/copy-callout styles and scoped clipboard, selection, dragging and context-menu controls. Keyboard copy/cut/select-all shortcuts are blocked for chapter text. Search, comment editors, links, payment controls, scrolling and zoom remain usable. These browser controls do not prevent screenshots or extraction of text delivered to a browser.

## Chapter emoji reactions

The main Library reader places 24 reactions between the author card and chapter comments. The original six stay visible; “More reactions” opens 18 additional choices grouped into Hearts & feelings, Suspense & surprises, and More feelings. Saved extra reactions reopen the picker and appear in the selection summary. Signed-in readers have one reaction per published chapter; selecting another switches it and selecting their current reaction removes it. Counts are shared across accounts. Signed-out readers see counts and a sign-in link. Saves use confirmed server results; an uncertain save requires reloading counts before another write. Detached chapter views ignore late replies.

Apply `supabase/live-site/supabase-chapter-reactions.sql` in the live Supabase SQL Editor. It depends on the existing public-reading and Moderation Center migrations and is safe to re-run. It adds the separate `library_chapter_reaction_votes` table and a narrow RPC; it does not change books, chapter text, comments or existing reader permissions. The RPC checks released chapters and book visibility, uses the authenticated caller's identity, respects commenting/account restrictions, and exposes only aggregate counts plus the caller's own reaction. Raw rows are inaccessible to browser roles. No schema migration is run by the application. Until installed, readers see a temporary-unavailability message.

Checks: `node --test core/tests/library/chapter-reactions.test.js core/tests/library/reader-author.test.js`. The UI tests use `JSDOM_MODULE` and `node --experimental-vm-modules --test core/tests/library/chapter-reactions-ui.mjs`; the isolated real PostgreSQL migration tests use `PGLITE_MODULE` and `node --test core/tests/library/chapter-reactions-database.mjs`. The Chapter reaction checks workflow installs these test-only dependencies automatically.

To upgrade from the original six reactions, re-run the updated `supabase/live-site/supabase-chapter-reactions.sql`. It expands both the table constraint and RPC allowlist without deleting existing votes.

### Existing reaction table compatibility

The migration supports both the original six-column `chapter_reactions` table (`id`, `book_id`, `chapter_id`, `user_id`, `reaction_type`, `created_at`) from `supabase-sibling-tables.sql` and the newer `reaction` layout. It keeps the original table and records intact and imports each account's latest recognized vote per chapter into `library_chapter_reaction_votes`. Original categories are mapped to the nearest current reaction (for example, funny → laugh and spicy → hot). Orphaned or unsupported records remain in the original table. Re-running the migration never overwrites an existing new vote or restores a vote that the reader removed; a null vote marker preserves that removal. Browser roles cannot read or write the new raw table. No reader UI changes are needed.
