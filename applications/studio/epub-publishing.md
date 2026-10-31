# Complete EPUB editions

Studio → New book / Upload book → EPUB book opens a dedicated complete-book publishing page. It imports reflowable EPUB text in spine order, creates an owned private manuscript, and saves the original EPUB in the private `book-epubs` bucket. EPUB source files and storage paths are not included in public Library data. Images/styles remain in the original download; on-site reading uses sanitized text. DRM/fixed-layout books are rejected. Archive limits: 30 MB compressed, 60 MB expanded, 8 MB per resource, 3,000 resources, 500 readable spine sections, 1.8 million imported JSON characters.

## Activation

Run `supabase/live-site/supabase-epub-editions.sql` against the LIVE project after the existing `supabase-author-chapter-access.sql` setup. This is a new migration; do not run remake SQL. It creates the private bucket, immutable edition records, and owner-only upload/read policies. No new hosting secret is needed: the existing Supabase service-role key signs downloads.

EPUBs use the author's existing Ko-fi / Payhip connection, webhook and product verification. Alysum does not collect or route the payment. Each EPUB requires one paid product for all sections. There is no free or chapter-price selector, and the rights confirmation is explicitly for original works. Publishing configures all sections before writing a public locked listing. A failed access save never publishes content. Short front matter is allowed only for a registered EPUB when every imported section is protected by the bundle. Existing written-book minimums and product choices remain unchanged.

The Library book page offers normal on-site reading plus Download EPUB. The server verifies a signed-in, verified account and requires access to *every* recorded section through `read_author_access` before signing a 60-second download URL. That RPC preserves refund, buyer-account claim, listing visibility and moderation rules. A refund stops future downloads; downloaded files cannot be recalled, and an already signed link remains valid for up to 60 seconds. No private replies enter service-worker caches. An upload is immutable; publish a new EPUB as a new book rather than silently replacing what readers bought.

Draft settings use the existing publication conflict/version protection and do not change the public listing until Publish/Update. Existing EPUBs route back to the dedicated flow from Studio/Publish. Failed upload registration can be resumed with the same EPUB. Unused draft manuscripts/files may remain after interrupted or abandoned uploads; avoid deleting uncertain writes automatically.

Validation includes importer/security tests, payment/whole-book/download authorization tests, PostgreSQL storage/RLS checks and Chromium/WebKit mobile/desktop tests. Real provider checkout and storage delivery require activation and a live account; fixture tests do not move money.
