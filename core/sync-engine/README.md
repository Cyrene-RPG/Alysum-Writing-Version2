# Sync engine

Persistence adapters. The only modules that should talk to IndexedDB, localStorage, or Supabase tables (after rewrite).

| File | Status |
| --- | --- |
| local-adapter.js | Now (was local-studio-store.js). Still localStorage. |
| realtime-adapter.js | Later |
| conflict-resolver.js | Later |

Do not prefix files with `sync-` — this folder is the prefix.
