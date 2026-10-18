# Read-only snippets

In the editor, select an excerpt and choose **Share snippet**, or paste text into the dialog. Review the reader preview, then create and copy a link. Title, author, and a short note are editable before sharing.

The link opens `/snippet#...` without an account. It carries an immutable plain-text snapshot in its fragment: only the excerpt, title, byline, note, and format version. No book identifiers, editor access tokens, chapter arrays, or other draft data are included. The full manuscript is never read or exported by this feature. The snippet does not become a Library listing, and subsequent draft edits do not update it.

This first version has no server-side snippet records. Anyone holding the complete link can read and copy the excerpt. Links cannot expire or be revoked. Clearing browser storage does not invalidate a link. URL compression is not encryption. The composer states these limits before link creation.

Excerpts are limited to 6,000 characters; links above 16,000 characters are rejected. Native gzip compression is used when supported, otherwise links use plain UTF-8 encoding. Recipients need a browser with `DecompressionStream` support for compressed links. The decoder bounds both encoded input and decompressed output and validates the exact payload shape. The reader renders every supplied field with `textContent` and does not load draft or authentication modules.

No database migration or new service credential is required. The usual Vercel/Firebase/local rewrites serve the reader page. The test preview's existing hosting access rules still apply to its reader URL; the production code itself does not require reader authentication.

Run transport and privacy checks:

```sh
node --test core/tests/publishing/snippets.test.js
```
