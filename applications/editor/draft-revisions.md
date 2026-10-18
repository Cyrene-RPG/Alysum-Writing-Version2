# Draft revisions — editor integration

Developed on `experiment/side-by-side-drafts`. The optional database migration is a separate setup step and is not run by deploying the editor.

The editor now has a **Drafts / Reference** button. It can reference a saved version, another current draft or another owned book; keep the current writing target; switch to an existing writing target; or create a blank revision under the same book or as a separate book. Blank revisions can retain chapter/folder names with new IDs or start with one empty chapter. Reference chapters scroll independently. On phones, Write and Reference tabs preserve the existing editor DOM. Closing reference mode restores the single editor.

## Save boundaries

- The existing document editor, formatting toolbar, chapter navigation and autosave are reused.
- Reference data is a detached snapshot. Its renderer copies only text-formatting nodes, never scripts, forms, external media, navigation links or event attributes. No editor or save hook is attached to the reference.
- Each editable revision is an independent `books` record. Switching writing targets flushes the existing save queue, blocks on failure, then navigates to another editor session. The active book variable is never repointed while autosave is running.
- Blank revision creation inserts a new record. It copies no manuscript text, notes, publication metadata, covers, published chapters or permissions. Cloud creation fails explicitly instead of silently creating a pending fallback if the schema is missing.
- Nullable `draft_parent_id` and `draft_label` fields group independent rows in the Studio. Existing records remain valid without either field. Orphan revisions stay visible; deleting a root detaches child drafts instead of deleting their writing.
- Reference mode closes when entering listing/settings preview or typewriter mode, preserving those existing layouts.

## Database setup

`supabase/live-site/supabase-draft-revisions.sql` is an additive migration prepared for a **test database**. It has not been executed. It adds the two nullable grouping fields, a parent foreign key with `ON DELETE SET NULL`, a label length check and an owner/parent validation trigger. It does not change manuscript sections, existing rows or RLS policies. Existing-book comparison, saved-version references, separate-book creation and local sample testing do not need this migration. Cloud same-book creation requires it and reports a clear error when unavailable.

## Testing

On the test branch, `applications/editor/tests/draft-revisions.html` seeds invented local sample books without overwriting existing samples, then opens the real editor. The standalone mockup and sample launcher are excluded from the main release. The hosted isolated preview packages this page as its landing page and uses a local-only cloud-client stub so testing cannot read or modify live Supabase data. That stub is confined to the hosted preview build; the repository's production authentication client is unchanged.

Run `node --test core/tests/writing-engine/draft-revisions.test.js core/tests/publishing/*.test.js`. Regression coverage checks separate writing IDs, original content preservation, local reloads, version history isolation, blank nested chapter creation, orphan visibility, cloud grouping persistence, missing-schema failures and save-before-navigation ordering. Browser layout and interactive formatting still need hands-on test coverage; no live account was used to test this feature.

## Direct draft switching

The editor always shows an Editing label and a Switch draft button above the document. The switcher lists the main/original draft and sibling revisions for that book, marks the current draft, saves before navigating and returns to the normal single-pane editor. It does not require opening reference mode or creating a snapshot.
