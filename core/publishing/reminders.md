# Studio book reminders

Studio → a book's gear menu → Reminders opens private author settings for that manuscript. There are no reminder settings on Publish, Library, the reader, or account Settings. The opt-in popup mounts only from the Studio dashboard entry point, not the shared workspace shell or notification bell. The author can still read private reminder history in their inbox on any screen.

Each book starts with reminders off. Authors choose writing edits or posted updates as the goal, weekly/every-two-weeks/monthly/every-N-days recurrence, a first local date and time, timezone, and whether to show a Studio popup. These settings do not publish a book. Both unpublished manuscript drafts and Library books are supported. Local/guest books do not offer reminders; cloud collaborators cannot change the owner's reminders.

A minute-based database job checks due schedules even when the author is offline. A qualifying authenticated author save/post since the prior check suppresses that period's reminder. Reader counters, background publishing jobs, and collaborator edits do not fulfil a period. Completed books and books on hiatus are skipped, as are hidden Library listings. The next check always advances, including skipped periods; downtime produces at most one alert per due book, not a backlog. Monthly dates are anchored (January 31 → February 28 → March 31), and local wall times are preserved across daylight saving. Nonexistent first local times are rejected.

Inbox alerts are private to the book owner. The new reminder_book_id column references manuscripts so unpublished drafts do not need a public listing. Ownership transfers do not opt the new author in. Reminder settings and popup claims are accessed only through authenticated, owner-checked RPCs. A popup claim is atomic and remembered on the server so refreshes/other tabs cannot show the same notification again. Studio shows at most one reminder popup per account per visit. Dismissing leaves the inbox entry unread; opening the book marks it read. Popups are suppressed if the book has since been updated, completed, hidden or paused, and when another dialog is open. No email, Discord, phone/push, scheduled chapter publishing, or changes to the existing 30-day hiatus reminders are included.

## Deployment

Run supabase/live-site/supabase-book-reminders.sql after the already installed inbox and book-hiatus migrations, before deploying the frontend. The script registers one per-book-reminders pg_cron job, using the extension already enabled for hiatus reminders. It is safe to rerun, preserves schedules and history, and extends inbox kinds without removing earlier categories. Confirm the active cron.job entry for per-book-reminders. No schedules are created for authors automatically.

The SQL has not been executed against the live project by this code change. The repository connection does not provide live Supabase database access. Deploy after the site owner has applied the migration. Existing notification screens remain readable before installation; Studio reminder settings report that setup is unavailable.

## Verification

- node --test core/tests/reminders/*.test.js core/tests/notifications/*.test.js
- PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test core/tests/reminders/database.mjs
- JSDOM_MODULE=/path/to/jsdom/lib/api.js node --test core/tests/reminders/popup.mjs
- PLAYWRIGHT_MODULE_PATH=/path/to/playwright/index.mjs node core/tests/reminders/browser.mjs

Tests use disposable identities and never contact production. Calendar/permissions tests cover recurrence, opt-in, activity, completion/hiatus, ownership transfers, hidden listings, deduplication, popup privacy and cleanup. Browser checks use the actual Studio markup, book menu, settings controller and popup component at desktop/mobile sizes, including failed writes and account changes. Static boundary checks ensure the settings and popup are mounted only in Studio.
