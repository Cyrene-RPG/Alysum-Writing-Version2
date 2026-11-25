# WIP quote cards

Select text inside the manuscript and press **Share quote card**. The dialog captures only that selection; it never reads or exports the full manuscript. An empty selection returns to the WIP for highlighting. Oversized selections are rejected without silently truncating them.

The live canvas preview offers Alysum, Paper, Rose, Midnight, Fog, Moss, Ink, Parchment, Dusk, and Slate paper styles. Card sizes keep the same shapes at two resolutions: portrait 1080×1350 or large 1620×2025 (4:5), square 1080×1080 or large 1620×1620 (1:1), story 1080×1920 or large 1440×2560 (9:16), plus landscape 1920×1080 (16:9). The Size menu lists pixel dimensions so “large” reads as sharper export, not a different crop. An optional background image upload covers the card under a readable paper wash; the image stays on-device and is never uploaded unless you choose the alternate server download. Book title, author, and the Alysum mark are optional. Excerpts support up to 30,000 characters. Long excerpts split into numbered cards at the selected dimensions, with a minimum 44 px body font. Previous and Next preview the pages; Save and Share act on the current page, with numbered filenames. Every selected line is retained in order across the cards.

**Save PNG** downloads the current card’s full-resolution PNG directly from the browser. If the download fails, **Use alternate download** prepares a same-origin HTTP attachment. That option verifies WIP ownership and uploads the PNG to Cloudflare’s edge cache for up to five minutes. **Share image** uses native file sharing where supported; otherwise users can download the file or copy a reading link.

The canvas renderer is in `site-appearance/js-runtime/snippet-card.js`; payload validation is in `core/publishing/snippet-card.js`. The editor mounts the dialog from `page-ui/snippets.js`.

Run checks with `node --test core/tests/publishing/snippet-card.test.js`.

## Longer reading links

The share dialog now has **Reading link** and **Image card** modes. Reading links accept up to 500,000 whitespace-separated words and 3,000,000 characters across all selected passages, whichever comes first. All selected text is preserved. Image cards have a separate 30,000-character limit. Switching modes never truncates the selection.

A reading link saves a separate, immutable plain-text snapshot containing only the selected section, title, and author. It never makes the manuscript or other chapters public and is not listed in the Library. Owner-only link management lists saved links and can disable future access. Previously copied or already displayed text cannot be taken back. Public reader responses expose no manuscript identifiers, owner identifiers, or editor credentials.

### Activation

Apply `supabase/live-site/supabase-wip-excerpts.sql` to the Supabase project used by the site before using reading links. The site owner applies this migration through the Supabase SQL Editor. It adds a separate RLS-protected table and narrowly granted RPCs; it does not broaden book/library permissions. Creating a link requires a signed-in book owner. Up to 100 active links are allowed per owner. Anonymous readers can fetch only a known 192-bit token for an active snapshot. Revoked links return no content.

The isolated hosted preview uses a separate private R2 store and its own signed-in owner identity. It does not connect this feature to the live manuscript database. Existing private preview access restrictions still apply to all preview reader pages.

Checks: `node --test core/tests/publishing/excerpts.test.js core/tests/publishing/snippet-card.test.js`.
