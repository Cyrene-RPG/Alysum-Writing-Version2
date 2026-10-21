# Draft revisions — editor integration

Developed on `experiment/side-by-side-drafts`. The optional database migration is a separate setup step and is not run by deploying the editor.

The editor now has a **Drafts / Reference** button. It can reference a saved version, another current draft or another owned book; keep the current writing target; switch to an existing writing target; or create a blank revision under the same book or as a separate book. Blank revisions can retain chapter/folder names with new IDs or start with one empty chapter. Reference chapters scroll independently. On phones, Write and Reference tabs preserve the existing editor DOM. Closing reference mode restores the single editor.

## Save boundaries

- The existing document editor, formatting toolbar, chapter navigation and autosave are reused.
- Reference data is a detached snapshot. Its renderer copies only text-formatting nodes, never scripts, forms, external media, navigation links or event attributes. No editor or save hook is attached to the reference.
- Each editable revision is an independent `books` record. Switching writing targets flushes the existing save queue, blocks on failure, then navigates to another editor session. The active book variable is never repointed while autosave is running.
- Blank revision creation inserts a new record. It copies no manuscript text, notes, publication metadata, covers, published chapters or permissions. Cloud creation fails explicitly instead of silently creating a pending fallback if the schema is missing.
- Nullable `draft_parent_id` and `draft_label` fields group independent rows in the Studio. Existing records remain valid without either field. Orphan revisions stay visible; deleting a root detaches child drafts instead of deleting their writing.
- Reference mode closes when entering listing/settings preview. Typewriter mode retains the reference, its selected chapter and scroll position, and the split width. The existing editor remains the only editable pane; phones retain Write and Reference tabs.

## Database setup

`supabase/live-site/supabase-draft-revisions.sql` is an additive migration prepared for a **test database**. It has not been executed. It adds the two nullable grouping fields, a parent foreign key with `ON DELETE SET NULL`, a label length check and an owner/parent validation trigger. It does not change manuscript sections, existing rows or RLS policies. Existing-book comparison, saved-version references, separate-book creation and local sample testing do not need this migration. Cloud same-book creation requires it and reports a clear error when unavailable.

## Testing

On the test branch, `applications/editor/tests/draft-revisions.html` seeds invented local sample books without overwriting existing samples, then opens the real editor. The standalone mockup and sample launcher are excluded from the main release. The hosted isolated preview packages this page as its landing page and uses a local-only cloud-client stub so testing cannot read or modify live Supabase data. That stub is confined to the hosted preview build; the repository's production authentication client is unchanged.

Run `node --test core/tests/writing-engine/draft-revisions.test.js core/tests/publishing/*.test.js`. Regression coverage checks separate writing IDs, original content preservation, local reloads, version history isolation, blank nested chapter creation, orphan visibility, cloud grouping persistence, missing-schema failures and save-before-navigation ordering. Browser layout and interactive formatting still need hands-on test coverage; no live account was used to test this feature.

## Direct draft switching

The editor always shows an Editing label and a Switch draft button above the document. The switcher lists the main/original draft and sibling revisions for that book, marks the current draft, saves before navigating and returns to the normal single-pane editor. It does not require opening reference mode or creating a snapshot.

## Switching performance

The switcher renders cached draft names immediately and refreshes only the current family’s ID/title/grouping metadata. It no longer fetches every manuscript to open the menu or overwrites manuscript caches with partial rows. Uncached target drafts can prefetch when pointed at or focused. A pending refresh cannot replace controls during saving. Identical chapter HTML skips redundant save scheduling; changed content and formatting still flush before navigation.

## Make main draft

In Switch draft, a non-main revision offers Make this draft main. A confirmation explains that the current main becomes a separate Previous main draft, the source revision stays saved, and public content does not change until publishing. Pending edits save before promotion.

Promotion reuses the original main book ID so its existing library listing, cover, followers and other ID-based associations stay attached to that book. It copies the selected revision's title and manuscript into that record, preserving unambiguously matching chapter IDs. The previous main is inserted as a private sibling draft first. Cloud updates compare the main record's updated timestamp and stop on concurrent changes. Backup failure stops before replacement; a conflict may leave an extra safe backup but does not overwrite newer main content. The selected source revision is unchanged. Local mode commits promotion and backup in one storage write. No new migration is required beyond the already installed draft grouping fields.

The operation never writes the public library table. Publishing remains an explicit action on the main book ID. If promotion leaves no valid selected chapters, the publish form requires chapter selection instead of accidentally taking the existing listing down. A private publishing-settings save preserves this guard until a successful publication.
