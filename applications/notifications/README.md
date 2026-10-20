# Private notification inbox

Visit /inbox, or use the bell beside the profile image. Uses the existing site appearance settings and workspace navigation.

## Production setup

Run `supabase/live-site/supabase-notifications-inbox.sql` in the Supabase SQL Editor before deploying the UI. The existing author-follow and announcement migrations must already be installed. Setup is safe to rerun: it preserves preferences and messages, and does not replay historical activity.

The new private table is `public.inbox_notifications`. The older beta-reading `public.notifications` table is untouched. Recipients can select only their own inbox; writes use authenticated, recipient-scoped RPCs. Delivery runs in database triggers, so it does not depend on a browser being open.

Only activity after initial installation generates messages. Existing follower pairs and published announcements are recorded as already seen. Each follower pair can notify once, including after unfollow/re-follow. Publication edits and republishing do not send another notification. Unfollowing stops future author announcements; previous inbox messages remain.

New follower and followed-author notifications default on. Site updates default off and require an explicit saved preference. Email delivery is not part of this release.

Mark all read takes the current highest notification ID as a cutoff, preserving later arrivals as unread. Opening the bell does not mark anything as read. Deleted/unpublished announcement destinations are unavailable; the recipient can still mark their message read.

## Validation

`node --test core/tests/notifications/*.test.js` checks recipient scoping, preferences, account changes, read actions and safe rendering.

The Notification inbox checks GitHub Actions workflow also creates a disposable PostgreSQL database and tests installation twice, future-only delivery, deduplication, preferences, recipient RLS and denied direct writes. Its fixtures must never be run in a production database.

`/core/tests/notifications/layout.html` provides phone and desktop previews using sample data only. It does not contact Supabase or send notifications.

Delivery fan-out currently runs within the publishing transaction. Large follower counts may warrant a queued worker in a later release.
