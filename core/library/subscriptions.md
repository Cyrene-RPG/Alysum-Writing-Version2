# Free book subscriptions

Book pages offer Subscribe/Unsubscribe for signed-in cloud readers. Subscriptions only deliver on-site inbox alerts and never change chapter purchase/access rules. Owners cannot subscribe to their own books.

Run supabase/live-site/supabase-book-subscriptions.sql after the inbox and Library moderation setup, before deploying this UI. It is transactional and safe to rerun. Existing books and released chapters are baselined without notifications.

A new chapter alert goes to current book subscribers with new_chapters enabled (default true). A new book alert goes to current author followers with new_books enabled (default true). Following an author does not automatically subscribe to all of their books. There is no email delivery.

Database triggers detect new released chapter IDs, excluding unselected/scheduled IDs. Edits, reordering, removal/readdition and republishing do not resend alerts. Dedupe ledgers survive listing deletion. Subscribing or turning preferences back on never replays past releases. Global preferences and book subscriptions are separate.

Hidden/removed books cannot accept new subscriptions or resolve inbox destinations. Unsubscribing remains possible through the authenticated RPC even when hidden. Anonymous publications do not notify author followers, and chapter notifications for anonymous books omit the actor ID.

Subscription rows are private to their recipient; writes go through a caller-scoped RPC. Notification destinations resolve against the caller's inbox entry and current publication/moderation status. The legacy three-preference RPC remains compatible and preserves the two new settings.

Tests: node --test core/tests/notifications/*.test.js. CI also runs the existing inbox SQL suite and reading.sql in disposable PostgreSQL. Never run SQL test fixtures in production. subscription-layout.html is a sample-data-only phone/desktop UI fixture.
