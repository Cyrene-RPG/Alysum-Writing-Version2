# Story Bible

New cloud Story Bible at `/story-bible?book=<book-id>`. Built independently of the legacy Bible/worksheet/blob features. No legacy imports or automatic data migration.

The book owner creates a Bible explicitly. Related drafts resolve to the root book’s Bible. Additional members need an explicit Bible grant; manuscript collaborators and public readers do not inherit access. Members can open `/story-bible?bible=<bible-id>` independently of manuscript access.

Features: character/location/faction/item pages; custom category templates with permanent field IDs, typed fields, reorderable fields and sections; per-profile text fields and sections; search, aliases, tags; wiki links, reverse relationships and backlinks; private portraits; cloud autosave with optimistic revision checks and account-scoped recovery; archive/restore; entry history; manual canon facts and editor reference/mention integration.

`?preview=1` opens an explicitly labeled, memory-only sample world using the real screen code. No authentication, Supabase requests, or account writes occur. Refresh resets the preview.

## Setup

1. Apply `supabase/live-site/supabase-encyclopedia-story-bible.sql` to staging. It requires the live `books` shape, `draft_parent_id`, and `book_editors`. Do not run the remake book schema.
2. Deploy the branch with the matching Vercel/Firebase route. The migration and frontend must ship together; missing tables/functions produce a visible setup error.
3. Open a book’s Studio menu → Story Bible, or Editor → Story Bible → Open full Story Bible. The owner creates a fresh Bible.
4. Verify two real test accounts on staging, including private portrait uploads, sharing/revocation, and cross-device conflicts, before production rollout.

All new table writes use transactional, checked RPCs. Public manuscript publication and chapter ZIP export remove private mention metadata. DOCX conversion traverses readable text and does not export profile contents. Old portraits remain retained for version recovery; do not run orphan cleanup against version-referenced objects.

## Validation

- `node --test 'core/tests/**/*.test.js'`
- External `@electric-sql/pglite`: `PGLITE_MODULE=<absolute-module-path> node --test core/tests/encyclopedia/database.mjs`
- External `jsdom`: `JSDOM_MODULE=<absolute-package-directory> node --experimental-vm-modules --test core/tests/encyclopedia/workspace.mjs`
- Local preview: `python3 core/server/dev.py`, then `/story-bible?preview=1`.

No production migration has been run. A real-browser pass is still required for visual layout, native undo/redo around mentions, mobile keyboard/IME behavior, and authenticated cloud/storage integration. Sample-DOM tests do not substitute for those checks.

## Boundaries

Boards/graph visualization, series-management controls, public Bible publishing, custom fantasy calendar arithmetic, and rich-text styling inside profile sections are not included. Profiles use safe text sections with linked entry references. Full-text search currently runs over loaded Bible entries; very large Bibles will need server search/pagination. Entry history snapshots every successful profile update; retention and storage cleanup should be agreed before adding automatic pruning.
