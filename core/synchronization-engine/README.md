# Synchronization engine

Persistence adapters. The only modules that should talk to IndexedDB, localStorage, or Supabase tables (after rewrite).

| File | Status |
| --- | --- |
| local-adapter.js | Now (was local-studio-store.js). Still localStorage. |
| cloud-adapter.js | Now. Owner-only `books` drafts on Supabase. |
| books.js | Now. Picks local vs cloud from the studio session. Device cache + pending upload. |
| network.js | Now. Online hint, reconnect, short cloud timeouts. |
| conflict-resolver.js | Now. Recency vs blank-cache: newer real copy wins; empty cache does not upload. |
| realtime-adapter.js | Later |

Do not prefix files with `synchronization-` — this folder is the prefix.
