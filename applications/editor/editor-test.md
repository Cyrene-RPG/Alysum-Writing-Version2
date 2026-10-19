# Editor test branch

Branch: `test/editor-manuscript`. This is a test implementation, not a production release.

## Isolation and book preservation

- `core/desktop/test-mode.js` hard-enables local-only mode. The Supabase SDK is not initialized; the shared test client rejects table, RPC, storage and realtime access. Existing authentication storage is not inspected or purged.
- Test books and version history use separate `alysum:editor-test:*` local storage keys. Original local books, versions, authentication tokens, and cloud book rows are not migrated or rewritten.
- The editor also restricts network connections using a branch-only CSP. It does not permit connections to Supabase.
- There are no SQL changes or changes to cloud book payloads, chapter IDs, or the existing ZIP export. Do not run SQL or use production account data for these tests.
- Manuscript export parses detached HTML and creates a new DOCX. Its normalization never writes back to a book. It excludes chapter notes. Media causes an explicit error rather than a silently incomplete manuscript.
- Do not merge this branch as-is. The test guard, separate storage keys, banner, and branch CSP are intentionally enabled. Production integration needs its own reviewed change; do not import test storage into production.

## Try the editor

Run `python3 core/server/dev.py` from the repository root. Open:

`http://127.0.0.1:3000/applications/editor/tests/editor.html`

Choose **Open sample book**. The sample contains synthetic chapters, nested lists, italics, scene breaks, Unicode, front/back matter, and a private note. Opening it again keeps your previous test edits instead of resetting it.

The Spacing menu adds exact 1.0, 1.5 and 2.0 line heights, quarter-inch and half-inch first-line indents, and 0/6/12 pt paragraph gaps. These are writing-view preferences. The existing auto-indent switch still controls whether new paragraphs are indented. Export has separate formatting settings.

Under Book → Settings → Export, choose **Manuscript .docx…**. Pick novel or short-story layout, Courier New or Times New Roman, and optional submission details. Contact details are used for this download only. Headers use the surname, short title and a live Word page-number field. The first-page header can be hidden. Front/back matter are opt-in; chapter notes are excluded. This preset retains italics and does not claim to cover every recipient's submission rules.

## Verification

Dependency-free regression tests:

```sh
node --test 'core/tests/**/*.test.js'
```

Optional real DOCX integration tests need test dependencies installed outside the application. There is no production build or package manager requirement:

```sh
npm install --prefix /tmp/alysum-editor-qa docx@9.6.1 jszip@3.10.1 jsdom@30.1.3
NODE_PATH=/tmp/alysum-editor-qa/node_modules node --test applications/editor/tests/manuscript-export.test.js
```

The DOCX tests open the actual ZIP package and inspect text, styles, half-inch indents, double spacing, page margins, scene-break alignment, italics, chapter breaks, header fields, and first-page behavior. They also compare the complete source book before and after export.

Browser checks, after starting the local server:

`http://127.0.0.1:3000/applications/editor/tests/formatting.html`

Choose **Run checks** for selection restoration, lists, undo/redo, heading toggles, save/reopen, spacing, and detached conversion. Choose **Download test DOCX** to exercise the pinned browser dependency and download path.

Also manually check mobile touch, keyboard-only toolbar navigation, typing after list creation, list exit with Enter, chapter switching, refresh, failed saves and retries, and reopening the downloaded file in Word or LibreOffice.

## Current validation limits

The automated storage regression and DOCX archive checks passed in the implementation environment. Interactive browser checks remain pending: the test browser could not reach the local server, and its URL policy does not allow opening a local file. Therefore list behavior across browsers, touch selection, the complete settings dialog flow, and visual pagination in Word/LibreOffice have not been verified here. Keep this branch in testing until those checks pass.

The existing browser editing engine still uses `execCommand`, preserving native undo/redo while this incremental change is evaluated. The screenshots' reported toolbar failures are not all reproduced or claimed resolved. Replacing the editor engine is a separate decision after browser testing.
