# Editor

Writing screen: chapter tree, rich-text page, formatting bar, word counts, autosave.

Behavior is adapted from [Wavemaker Cards v4](https://github.com/wavemakercards/wavemaker-v4) Writer (MIT License). This app is vanilla HTML and ESM — it does not copy Vue, Vite, TipTap, Dexie, or Google Drive.

Uses `core/writing-engine`, `core/synchronization-engine`, `core/authentication`, `core/desktop`, and `site-appearance/`.

The Spacing menu includes exact line heights, first-line indent sizes and paragraph gaps. These are writing-view preferences; they do not rewrite stored chapter HTML.

Book settings offer a separate manuscript DOCX export alongside the existing chapter ZIP. DOCX export uses a pinned, lazily loaded docx 9.6.1 browser module and detached text conversion. Optional contact details are used only for the download. It preserves italics, exports chapter text in order, excludes private notes, and rejects unsupported embedded media explicitly. It does not migrate or modify saved book data.

Run the dependency-free regression suite with `node --test 'core/tests/**/*.test.js'`. Optional DOCX integration tests require `docx@9.6.1`, `jszip@3.10.1`, and `jsdom@30.1.3` installed outside the application. Expose that directory using `NODE_PATH`, then run `node --test applications/editor/tests/manuscript-export.test.js`.
