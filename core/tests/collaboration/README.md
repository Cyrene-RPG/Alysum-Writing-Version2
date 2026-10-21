# Book collaborator regression checks

Run JavaScript checks with `node --test core/tests/collaboration/*.test.js core/tests/writing-engine/*.test.js`.

The workflow runs PostgreSQL checks against a disposable database named `collaboration_test`. Never run `setup.sql` or `database.sql` against the live site. The fixture starts with a legacy invite table and an existing editor membership, applies the live upgrade twice, then checks access, removal, verified email restrictions, expired/consumed links, cover storage permissions, and manuscript preservation. A separate test races two recipients against one link.

For the live site, run only `supabase/live-site/supabase-book-editors.sql` in the Supabase SQL Editor before deploying this branch. It is transactional and rerunnable; existing manuscripts and editor memberships remain intact. Existing active links expire seven days after their original creation. New links also expire after seven days and admit one account. Reopening a consumed link works for its original recipient while they still have access; removing them invalidates their consumed links.

Owners create and share invitation links manually. No email is sent. The optional email field restricts acceptance to the matching verified Supabase account. Only owners manage editors, publishing settings, ownership, and version snapshots. Editors can update titles and manuscript content and export the book.

Studio lists owned books and explicit editor memberships. Shared manuscripts require an online authorization check when reopening. Revoked books disappear from Studio; unsynced text remains in the device cache and is never inserted as an editor-owned copy. This change does not add simultaneous live text merging.
