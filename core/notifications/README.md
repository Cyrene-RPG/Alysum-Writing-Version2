# Notifications

Private on-site notification data and account-scoped synchronization.

- `client.js`: Supabase queries/RPCs and camelCase data shapes.
- `service.js`: one shared service per Supabase client, auth clearing, Realtime and polling.
- `applications/notifications/`: inbox UI.
- `site-appearance/js-runtime/notification-bell.js`: shared bell UI with an injected service; imports no core modules.

Requires `supabase/live-site/supabase-notifications-inbox.sql`. The legacy `public.notifications` beta-reader table is intentionally untouched. New records live in `public.inbox_notifications`.

## Comments and author replies

Run `supabase/live-site/supabase-comment-notifications.sql` after the existing inbox, book-subscription/confirmation, comment and moderation migrations. It adds private comment destinations and preferences, then attaches an AFTER INSERT trigger. New reader comments notify the book owner; author replies notify the parent comment's writer. Self-notifications, unrelated chapter parents, restricted actors and hidden/unreleased targets are skipped. Notification text contains no comment body or account email. Delivery is opt-out per category and deduplicated per recipient/comment; it does not backfill historical comments or notify on edits. Re-running it preserves existing notifications and other kind constraints.

Links resolve through the caller's inbox ID and validate the comment, chapter and book at open time. Removed comments remain readable as inbox entries but have no active destination. The reader highlights and focuses the target comment. Readers can opt out of Comments on your books and Author replies in Inbox preferences. Existing preference reads/saves remain usable before setup, but changing the new preferences requires the migration.
