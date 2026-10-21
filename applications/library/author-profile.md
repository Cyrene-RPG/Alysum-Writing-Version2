# Author profile links

/author?id=<account ID> opens the full author profile. /author?u=<username> and the legacy /author.html?u=<username> form also work. IDs are preferred so display-name and username changes do not break links.

The page uses the shared large-profile appearance: portrait, display name/handle, bio, author-supplied links, published books, author updates and Follow/Following. The viewer's saved theme and typography still apply. The profile menu remains the viewer's own account.

Only the existing public author field allowlist is fetched. Following/subscription lists, follower identities, email, private stats, drafts, comment management and account settings are not rendered. Anonymous works and names with no verified account ID do not acquire guessed links. Shared excerpt bylines are free-text snapshots without author account IDs and remain plain text.

Library and homepage cards have separate book and author links, avoiding nested anchors. Book pages, reader author cards, verified book-author comments and author-announcement bylines use the same canonical profile destination.

Follow writes reuse the existing account-backed service and confirmation/author-notification triggers. Signing out or changing accounts clears follow state and discards stale reads/writes. Guests are sent to sign-in with an internal return destination. Self-view offers Edit profile instead of Follow.

No new SQL or public relationship lists are required.

Tests: node --test core/tests/library/author-profile.test.js core/tests/library/author-cards.test.js core/tests/library/author-follow.test.js core/tests/library/reader-author.test.js
