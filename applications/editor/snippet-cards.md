# WIP quote cards

Select text inside the manuscript and press **Share quote card**. The dialog captures only that selection; it never reads or exports the full manuscript. An empty selection returns to the WIP for highlighting. Oversized selections are rejected without silently truncating them.

The live canvas preview offers Alysum, Paper, and Rose styles, with portrait (1080 × 1350), square (1080 × 1080), and story (1080 × 1920) formats. Book title, author, and the Alysum mark are optional. Excerpts support up to 30,000 characters. Images grow vertically for longer text, up to 16,000 pixels tall; the preview scrolls without shrinking the image to a thin strip. Text size adjusts to fit; if the full text cannot fit at the minimum readable size, saving is disabled until the excerpt or format changes.

**Save PNG** downloads the image. **Share image** uses the device's native file-sharing sheet when supported. Otherwise saving remains available. Rendering and exporting happen in the browser. No manuscript data is uploaded, no read links are created, and no database setup is needed. The application never chooses a recipient or sends an image automatically.

The canvas renderer is in `site-appearance/js-runtime/snippet-card.js`; payload validation is in `core/publishing/snippet-card.js`. The editor mounts the dialog from `page-ui/snippets.js`.

Run checks with `node --test core/tests/publishing/snippet-card.test.js`.
