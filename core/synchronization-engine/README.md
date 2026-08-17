# Synchronization engine

Persistence adapters. The only modules that should talk to IndexedDB, localStorage, or Supabase tables (after rewrite).

| File | Status |
| --- | --- |
| local-adapter.js | Now (was local-studio-store.js). Still localStorage. |
| cloud-adapter.js | Now. Owner-only `books` drafts on Supabase. |
| books.js | Now. Picks local vs cloud from the studio session. |
| realtime-adapter.js | Later |
| conflict-resolver.js | Later |

Do not prefix files with `synchronization-` — this folder is the prefix.
