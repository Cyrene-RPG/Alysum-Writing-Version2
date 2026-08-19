# Supabase SQL

Table blueprints only. Live accounts, books, and editor text stay in the cloud.

Do **not** run `remake/` SQL on the live project. Live `public.books` uses text ids and `created` / `updated` as epoch milliseconds. Remake `supabase-books.sql` uses uuid ids and `created_at` / `updated_at`.

| Folder | What it is |
| --- | --- |
| `live-site/` | SQL from the current production site (users, books, library, versions, beta, collab, encyclopedia, …) |
| `remake/` | Migrations written for this remake (`books`, `users.bio`) |
| `recovery/` | One-off live-site repair (`fix-studio-access.sql`) |

`core/server/database/migrations/supabase-delete-account-code.sql` is not here. Settings still uses that RPC.
