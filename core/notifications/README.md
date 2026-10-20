# Notifications

Private on-site notification data and account-scoped synchronization.

- `client.js`: Supabase queries/RPCs and camelCase data shapes.
- `service.js`: one shared service per Supabase client, auth clearing, Realtime and polling.
- `applications/notifications/`: inbox UI.
- `site-appearance/js-runtime/notification-bell.js`: shared bell UI with an injected service; imports no core modules.

Requires `supabase/live-site/supabase-notifications-inbox.sql`. The legacy `public.notifications` beta-reader table is intentionally untouched. New records live in `public.inbox_notifications`.
