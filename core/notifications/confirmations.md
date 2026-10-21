# Follow and subscription confirmations

Apply supabase/live-site/supabase-notification-confirmations.sql after book subscriptions, before deploying the new inbox UI. Safe to rerun; existing follows and subscriptions are not backfilled.

A successful new follow creates an unread Follow confirmation in the follower's own inbox. The existing author-facing new-follower notification remains independent.

A successful new book subscription creates an unread Subscription confirmation in the subscriber's own inbox. It links to the book if it is still published and visible.

These are action receipts and are delivered even when future content notification preferences are off. Their wording does not promise delivery of muted notifications. No external email is sent. Unfollow/unsubscribe creates no receipt.

INSERT triggers send a receipt only when a new relationship row is created. Repeated requests use ON CONFLICT DO NOTHING and create no duplicates. Unfollowing then following again, or unsubscribing then subscribing again, is a fresh action and gets one fresh confirmation.

Both receipt kinds share the existing recipient-isolated inbox, read controls, bell, and category filters. Hidden/unpublished/deleted books cannot be opened through confirmation receipts.

The book subscription setup script also accepts the expanded notification kinds so rerunning it after installing confirmations preserves existing receipts. Integration checks rerun both scripts after test receipts exist.
