# Book Studio — test edition

Independent page at `/book-studio`, linked from Writing Studio. No source book writes or schema changes. Uses Alysum's skin and native browser modules. Routes are mirrored in Vercel, Firebase, Cloudflare and the local development server.

## Working scope

- Open an Alysum book using the existing session-aware read API; import DOCX, text, HTML, Alysum backups, or version-1 studio projects.
- Separate manuscript snapshot, editable book/author metadata and front/body/back sections, reorder/remove sections, plain-text editing with an explicit formatting-loss notice.
- Four typographic themes, three trim sizes, body fonts, margins/gutter, line spacing, indentation, drop caps, right-hand section starts and page numbers.
- DOM-measured pagination with inline-markup-preserving paragraph splitting. Browser preview and print use the same generated pages.
- Tab-local session recovery and downloadable project JSON. Import confirmation protects the current workspace. Malformed saved data is not overwritten automatically.
- Reflowable EPUB 3 export (uncompressed ZIP, first stored mimetype, navigation, OPF metadata) and browser print/PDF proof.

## Deliberate test-edition limits

This is not complete Petrichor Pages parity or a certified print-production engine. No bleed, uploaded chapter art, background images, custom embedded fonts, cover creator, special text-message blocks, undo/redo, cloud project persistence, source revision refresh, language selector, advanced front-matter numbering, or widow/orphan enforcement yet. EPUB language metadata is currently English; reader fonts can differ from preview. Print uses installed system fonts, so results vary between devices. Review margins, font substitution and all pages before sending output to a printer.

Imports retain text and basic inline markup only. Images and advanced objects are removed with a visible import notice. DOCX conversion loads Mammoth 1.12.0 on demand from the same host/version pattern used by Alysum's existing importer. Manuscript bytes are processed in-browser. File size limit is 10 MB; this does not provide a fully sandboxed decompression budget for untrusted DOCX archives.

Session autosave is scoped to this browser tab, not an account or durable cloud storage. Use downloaded project files for durable recovery. There is no background synchronization.

## Validation

Run `node --test core/tests/book-studio/*.test.js`. Run the browser checks against `python3 core/server/dev.py` with Playwright available: `node applications/book-studio/tests/browser.cjs`. The dedicated workflow installs Playwright outside the repository and runs the same checks on this test branch.

Browser checks cover page loading, trim changes, overflow, long-paragraph text preservation, import sanitization, session recovery and EPUB download. Manual print-proof review and external EPUB validation remain necessary before production release.
