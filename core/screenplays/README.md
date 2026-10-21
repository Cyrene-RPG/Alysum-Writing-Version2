# Screenplay drafting foundation

Private screenplay documents are separate from books and audiobooks. `model.js`
defines versioned paragraphs and text runs with bold/italic/underline. Only the
Studio application reads or writes DOM. Core modules do not depend on screens.

## Available in the preview

- Existing Studio → New book / Upload book → Script; standard shelf cards.
- Scene, action, character, dialogue, parenthetical, transition and shot elements.
- Smart Enter/Tab, Ctrl/Command+B/I/U, undo/redo, scene navigation/reordering,
  character/location completions, find, title details and Letter/A4 setup.
- Outline cards and list view, scene summaries, free-form act/sequence labels,
  status and card colors. Reorder whole scenes using drag handles, position
  selectors or earlier/later buttons; moves are undoable. Introductory material
  remains before the first scene. New scenes include a heading and action block.
- Read-only draft comparisons from cloud revisions, device copies or imported
  JSON/FDX/Fountain files. Stable IDs distinguish edits from moves; uniquely
  identical paragraphs can match across imports with regenerated IDs. Duplicate
  imported paragraphs with new IDs are conservatively shown as additions/removals.
  Text, emphasis/type, title details and outline edits are compared. Large text
  replacements have bounded highlighting and results render 50 elements at a time.
- A continuous responsive drafting surface and separate physical page preview.
- Shared measured Courier 12 pagination for preview and browser Print / PDF,
  with title pages, numbering from screenplay page two, dialogue continuation,
  scene-heading keep-with-next rules and dual dialogue. Print at 100% with browser
  headers/footers disabled; choose Save as PDF in the browser dialog.
- Full Alysum JSON backups and drafting-level FDX/Fountain exchange. Preserve
  original FDX production files; proprietary extensions, notes, revision sets,
  page locks and custom headers are not round-tripped. Imported unsupported FDX
  content produces a warning. Fountain notes/sections/comments are rejected
  rather than silently discarded.
- Scene planning metadata is retained in the full Alysum JSON backup and cloud
  document. FDX/Fountain export is screenplay text only, with a confirmation when
  planning data is present. Summaries never enter the screenplay PDF. This step
  needs no SQL changes beyond the existing prepared screenplay migration.
- Account-scoped device caches and up to five recent editor recovery copies,
  explicit save errors, serialized saves, version conflicts and idempotent retry.
- Owner-only cloud drafts and history after the SQL migration is applied.
  Recent 100 automatic versions and named revisions are retained. The history
  browser includes up to 1,000 named revisions plus recent versions.

## Rollout

Do not merge until the owner approves. The preview at `/screenplay-preview`
substitutes sample-only APIs into the real Studio and saves scripts under the
`screenplay-preview-only` device namespace. No live credentials or data are used.

For cloud release, apply `supabase/live-site/supabase-screenplays.sql` to the live
Supabase project. It is additive and rerunnable; it creates no public read or
write policy and changes no existing book/audio tables. Cloud saves use a row
version, owner checks and a unique operation ID. Local drafts continue to work
if the migration is absent, with an explicit cloud-storage message. Do not claim
cloud rollout until that migration is applied and verified.

## Verification

`node --test core/tests/screenplays/*.test.js`

The screenplay workflow checks PostgreSQL 17 setup twice, owner/anonymous access,
version conflicts and retries. Browser fixtures exercise real editor modules and
the native Studio preview in Chromium and Firefox. Chromium also emits a PDF
artifact. Tests use invented data and never open live author books.

Layout reference: Academy Nicholl screenwriting resources and format sample,
https://www.oscars.org/nicholl/screenwriting-resources and
https://www.oscars.org/sites/oscars/files/scriptsample.pdf . Page geometry follows
the approximate screenplay margins described by Final Draft:
https://www.finaldraft.com/blog/what-are-the-margins-for-a-screenplay .

## Further milestones before production-readiness claims

Configurable shortcuts; shared-script
permissions, comments/suggestions and concurrency-aware live collaboration;
revision-color sets and marks; locked pages, A/B pages,
scene numbering/omitted scenes, production reports; external Final Draft
compatibility checks and working-screenwriter acceptance tests on full scripts.

The continuous editor is not a live editable print-page canvas. The page preview
is the authoritative print layout. There is no native PDF-to-script import.
