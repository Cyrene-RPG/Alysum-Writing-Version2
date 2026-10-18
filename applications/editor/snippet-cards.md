# WIP quote cards

Select text inside the manuscript and press **Share quote card**. The dialog captures only that selection; it never reads or exports the full manuscript. An empty selection returns to the WIP for highlighting. Oversized selections are rejected without silently truncating them.

The live canvas preview offers Alysum, Paper, and Rose styles, with portrait (1080 × 1350), square (1080 × 1080), and story (1080 × 1920) formats. Book title, author, and the Alysum mark are optional. Excerpts support up to 30,000 characters. Images grow vertically for longer text, up to 16,000 pixels tall; the preview scrolls without shrinking the image to a thin strip. Text size adjusts to fit; if the full text cannot fit at the minimum readable size, saving is disabled until the excerpt or format changes.

**Save PNG** downloads the image. **Share image** uses the device's native file-sharing sheet when supported. Otherwise saving remains available. Rendering and exporting happen in the browser. For image cards, no manuscript data is uploaded, no reading links are created, and no database setup is needed. The application never chooses a recipient or sends an image automatically.

The canvas renderer is in `site-appearance/js-runtime/snippet-card.js`; payload validation is in `core/publishing/snippet-card.js`. The editor mounts the dialog from `page-ui/snippets.js`.

Run checks with `node --test core/tests/publishing/snippet-card.test.js`.

## Longer reading links

The share dialog now has **Reading link** and **Image card** modes. Reading links accept up to 20,000 whitespace-separated words and 150,000 characters, whichever comes first. All selected text is preserved. Image cards retain their separate 1,800-character limit. Switching modes never truncates the selection.

A reading link saves a separate, immutable plain-text snapshot containing only the selected section, title, and author. It never makes the manuscript or other chapters public and is not listed in the Library. Owner-only link management lists saved links and can disable future access. Previously copied or already displayed text cannot be taken back. Public reader responses expose no manuscript identifiers, owner identifiers, or editor credentials.

### Activation

Apply `supabase/live-site/supabase-wip-excerpts.sql` to the chosen **test** Supabase project before testing the repository's Supabase adapter. This migration is included on the branch and has not been applied to the live database. It adds a separate RLS-protected table and narrowly granted RPCs; it does not broaden book/library permissions. Creating a link requires a signed-in book owner. Up to 100 active links are allowed per owner. Anonymous readers can fetch only a known 192-bit token for an active snapshot. Revoked links return no content.

The isolated hosted preview uses a separate private R2 store and its own signed-in owner identity. It does not connect this feature to the live manuscript database. Existing private preview access restrictions still apply to all preview reader pages.

Checks: `node --test core/tests/publishing/excerpts.test.js core/tests/publishing/snippet-card.test.js`.
