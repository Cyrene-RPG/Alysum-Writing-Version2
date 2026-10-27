# Book inactivity reminders and hiatus

A published Library book that has gone more than 30 days without an author save receives one private author inbox reminder per inactive period. Completed, unpublished, hidden/removed, and already paused books are excluded. The author opens the reminder to the book page and chooses **Put book on hiatus**. The same control becomes **Resume book**. Hiatus stays author-controlled when a new save occurs.

Reader **Start reading** and **Continue reading** actions on the book detail page fetch the current status. Paused books show a keyboard-accessible dialog with the last author update date, time and local timezone, plus **Back to book** and **Read anyway**. Checking the book or changing its hiatus status never changes the author update timestamp. This does not gate direct reader/chapter links or alter chapter access.

## Deployment

1. Install the existing inbox, book subscription, and Moderation Center migrations first.
2. Enable Supabase's `pg_cron` extension and apply `supabase/live-site/supabase-book-hiatus.sql` to the live database **before deploying the UI**. Do not use the remake migrations.
3. Confirm the single active `book-inactivity-reminders` job in `cron.job`. It runs hourly, including when authors are offline. If pg_cron was absent during installation, the migration emits a notice; enable it and rerun the migration to register the job.
4. Deploy the frontend changes. Existing stale books qualify on the next hourly run. No email or external messages are sent.

The new private `book_inactivity` table is seeded from the latest existing manuscript/listing update. Subsequent owner-authenticated manuscript saves and listing publications use server time. Reader counters, background releases, moderation edits, and hiatus choices do not reset inactivity. Collaborator saves do not count as author activity. Completed status is checked against both the published listing and the manuscript's publish metadata. Reapplying the migration preserves saved activity, hiatus and reminder state, and extends notification kinds without losing other categories.

Only recipient-scoped notification resolution and owner-checked status mutations are exposed. Anonymous readers can retrieve only public books' minimal hiatus status. No manuscript data is returned. The reminder job is not callable by browser roles.

## Verification

- `node --test core/tests/library/*.test.js core/tests/notifications/*.test.js`
- `JSDOM_MODULE=/path/to/jsdom/lib/api.js node --test core/tests/library/hiatus-ui.mjs`
- `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test core/tests/library/hiatus-database.mjs`
- `PLAYWRIGHT_MODULE_PATH=/path/to/playwright/index.mjs node applications/library/tests/hiatus-browser.mjs`

The database suite uses a disposable PGlite database and covers the strict 30-day cutoff, deduplication, repeated installation, completion, hidden/unpublished exclusions, ownership, anonymous privacy, author saves, unchanged timestamps on hiatus and reader metrics, renewed inactivity, and deletion cleanup. Browser tests exercise the actual book-page markup and hiatus module using an in-memory RPC fixture, including mobile and desktop dialog layout, keyboard focus/Escape, continuing to the correct chapter, status refresh at click time and failed saves/reads. No tests connect to production.
