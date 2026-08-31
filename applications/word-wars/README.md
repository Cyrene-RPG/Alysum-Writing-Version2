# Word Wars

Friendly writing sprints: create or join a lobby, then write in your real book.

Uses `core/community`, `core/writing-engine`, `core/synchronization-engine`, `core/authentication`, `core/desktop`, and `site-appearance/`. Live share is chapter HTML over HTTPS — no voice, no WebRTC.

Cloud: apply `supabase/live-site/supabase-word-wars.sql`, then `supabase-word-wars-share-required.sql`.

## Demo mode (offline)

`page-ui/demo.js` holds an offline bot walkthrough (a lobby that fills with bots,
a running sprint room, `?demo=1` / `?bots=N` / `demo-ww-` room ids). It is
**disabled** — `DEMO_ENABLED = false` in `demo.js` short-circuits `demoRequested()`
so `?demo=1` just loads the normal login-gated page. Flip that flag to bring it back.
