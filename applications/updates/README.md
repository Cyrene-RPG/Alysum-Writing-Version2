# Updates

Public changelog and author announcements. This phase publishes posts; notification inboxes, new-follower alerts, subscriptions, and email delivery are a later phase.

## Setup

1. Apply `supabase/live-site/supabase-updates-announcements.sql` in the **live** Supabase project, not the remake schema. The transaction can be rerun and preserves existing posts.
2. Deploy the matching application changes.
3. Visit `/updates` for the public changelog and `/write-update` to manage your own drafts and posts.

Author posts require an existing `public.users.account_type` of `author` or `both`. If the existing moderation status table is present, suspended, terminated, and publishing-revoked accounts cannot publish author updates.

Site changelogs require an existing `public.moderation_staff` entry with role `admin`. Missing staff configuration denies site publishing; the migration does not create staff or grant anyone a new role.

## Behavior

- Site categories: New, Improved, Fixed, Announcement.
- `/updates?author=<user UUID>` lists public author posts.
- `/updates?post=<post UUID>` opens a permanent post link.
- Drafts are visible only to their owner. Published author posts are public, not follower-exclusive.
- Posts use plain text, with a title up to 160 characters and body up to 12,000 characters.
- Author posts can optionally link an owned, publicly listed, non-anonymous book. The picker loads up to 200 listings.
- The audience is fixed at the first save. Existing published posts remain published when edited and retain their original publication time.
- The client keeps the same post id on retry. Saves require the exact previous server revision to reject stale edits.
- There are no client table writes: `save_announcement` checks identity, role, ownership, audience, book ownership, and content bounds on the server.
- No email addresses are exposed or subscribed. Old follows are unchanged.

## Verification

Run in the normal development environment:

```sh
node --test core/tests/publishing/announcements.test.js core/tests/publishing/announcement-composer.test.js
python3 core/server/dev.py
```

Check signed-out public viewing, empty feeds, category filtering, detail links, author/book links, and narrow/mobile layouts. As an author, save a draft, preview, reopen it, publish, and edit the published post. In another account, verify that drafts are inaccessible, another author's posts cannot be edited, and non-admin users cannot publish site updates. Verify stale saves from two tabs are rejected and an unavailable database shows an error without losing entered text.

The development environment was unavailable while preparing this change. The 12 test callbacks were run in a V8 compatibility harness with mocked dependencies; JavaScript parsing, route mappings, and source references were also checked. Native Node test execution, PostgreSQL migration/RLS integration, and authenticated browser/layout verification remain outstanding.
