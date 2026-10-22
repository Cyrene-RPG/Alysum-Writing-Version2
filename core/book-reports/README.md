# Book reports
New standalone report flow and staff queue. Earlier reporting code and data were not inspected or modified.

## Deploy
1. Run supabase/live-site/supabase-book-reports-v2.sql in the existing Supabase project's SQL Editor. It is transactional and safe to rerun; it preserves reports and audit history.
2. Review the preview branch, then deploy the frontend when approved.
3. As a reader, open a published book and choose Report book.
4. Authorized members of moderation_staff with admin, moderator or staff roles can open /staff/book-reports. Book pages add a Book Reports entry to their account menu after a server permission check.

The SQL relies on the site's existing public.users accounts, moderation_staff membership and get_published_book API. It does not grant staff membership or depend on an earlier reporting table or reporting RPC. It does not delete earlier records. No production SQL has been executed by this change.

## Behavior
Eight report reasons, explanation, optional published chapter and supporting link; missing-tag reports require tag details. Reporting requires a Supabase sign-in. The backend snapshots the title and chapter name. One open report per reader/book, with private reader follow-ups, idempotent submission keys and serialized per-reader limits. Five new reports per hour / twenty per day; ten follow-ups per hour / thirty per day.

Only authorized staff can read raw report and event rows. Readers receive only their own open-report receipt; staff notes never appear in reader responses. Anonymous users cannot execute reporting RPCs. All writes go through security-definer RPCs with explicit identity/permission checks, bounded fields and a fixed search path. Staff saves require the current version to prevent overwriting concurrent reviews or reader updates.

The staff queue groups reports by book, with reason/status filters, pagination, report details, private notes and a chronological audit trail. Closing requires an outcome note. Status changes do not change book visibility, penalize authors or send author messages. Staff records any separately taken moderation action in the outcome note.

The report dialog uses native modal focus handling, Escape/cancel, scrollable content and persistent footer controls. Failed submissions retain entered text. Account changes clear report forms and private queue content.

## Previews
/report-preview and /report-staff-preview use invented data in memory. They do not load the Supabase client, submit real reports, or preserve input across navigation. Production routes do not import the preview service.

## Validation
The book-report-tests workflow runs model/service tests, PostgreSQL permission, validation, idempotency, rate-limit and rerun checks, concurrent-request tests, and Chromium/Firefox interaction tests. Screenshots are workflow artifacts. Use only the disposable book_reports_test database for the database fixtures.
