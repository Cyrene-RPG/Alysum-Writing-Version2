# Side-by-side drafts — interactive mockup

Test branch: `experiment/side-by-side-drafts`. This is a standalone prototype; the production editor, database and manuscripts are untouched. All book content is invented sample text.

Open `index.html` through a static HTTP server. Start with Draft 1 as a read-only reference and Draft 2 as the editable draft of The Glass Harbor. Choose versions to compare another draft/book, or create a blank revision under the same book or as a separate book. Blank revisions can keep only the reference chapter names or start as one empty document.

Desktop panes scroll and select chapters independently. Drag the divider or use its arrow keys. On phones, use Write and Reference tabs. Text size, hiding the reference, and resetting the sample data are functional. Edits and created sample drafts save in this browser's localStorage, not an Alysum account. Changing browsers or devices does not sync this data. Each preview starts with its own sample data.

Run `node --test prototypes/draft-revisions/model.test.mjs` from the repository root. No new dependencies, APIs, database schema, authentication changes or live-editor wiring are included. This prototype does not implement tracked changes or automatic text comparison.

## Editor shell alignment

The preview reuses the production welcome/navigation, chapter tree, editor shell, main panel and document CSS in `editor-shell.css`. That file is an unmodified concatenation of the five source CSS files identified in its comments. `styles.css` adds only prototype layout/theme overrides and revision controls. The regular book/chapter title bar, chapter sidebar and toolbar frame the two draft panes. The chapter list, Book tab, chapter creation, sidebar toggles, font, spacing and preview theme are functional. The prototype toolbar provides document view controls; full rich-text formatting remains in the production editor.
