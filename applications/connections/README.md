# Private connections

The signed-in /connections page has Following, Book subscriptions and Followers tabs. Entry points are the profile-image menu, the private Profile navigation and Studio's Followers shortcut.

Run supabase/live-site/supabase-private-connections.sql in the production Supabase SQL Editor after book subscriptions, before deploying this UI. It is safe to rerun and sends no historical or new notifications.

The migration replaces public reads of individual author_follows rows with a participant-only policy. Only the follower or followed author can read a relationship. get_author_follower_count returns an aggregate count without identities, preserving existing public count displays. The updated foundational author-follow script uses the same private policy so rerunning it does not reopen lists.

list_my_connections and get_my_connections_summary always use auth.uid() and accept no target-account parameter. Results include only display names, handles, pictures, dates, and appropriate public author/book destinations. They return no email. Reader followers are shown privately without invented public author-profile links. Hidden/unpublished subscriptions appear as Unavailable book and can still be removed.

Unfollow/Unsubscribe use remove_my_connection, which verifies the expected account as well as auth.uid(). This prevents actions started before an account switch from mutating the next account. Deletes send no notification. Page state clears synchronously on sign-out/account change and discards stale list/action responses.

Lists use stable keyset pagination, 50 entries at a time. Refresh reloads counts and the selected list. No lists are saved in localStorage or made public.

Validation: node --test core/tests/notifications/connections*.test.js core/tests/library/author-follow.test.js. The Notification inbox checks workflow also runs existing notification tests and PostgreSQL suites, including connection privacy and safe reruns. SQL fixtures require the disposable notifications_test database and must never be run in production.
