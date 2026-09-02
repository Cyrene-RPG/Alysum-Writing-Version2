# Word Wars

Friendly writing sprints: create or join a lobby, then write in your real book.

Uses `core/community`, `core/writing-engine`, `core/synchronization-engine`, `core/authentication`, `core/desktop`, and `site-appearance/`. Live share is chapter HTML over HTTPS — no voice, no WebRTC.

Cloud: every path below is relative to the repo root. Apply in this order:

1. `supabase/live-site/supabase-word-wars.sql`
2. `supabase/live-site/supabase-word-wars-share-required.sql`
3. `supabase/live-site/supabase-word-wars-instant-join.sql`
4. `supabase/live-site/supabase-word-wars-waiting-lobby.sql` — **last.** It drops
   the old "every writer must be ready" gate from `start_word_war` (the lobby has
   no ready control), so re-run it after any re-run of an earlier file or Begin
   will wedge.

Then, as needed, the standalone hotfixes in `supabase/live-site/`:
`supabase-word-wars-open-lobby-hotfix.sql` (open-list / join-by-code fixes),
`supabase-word-wars-kick.sql` (host kick), `supabase-word-wars-comms.sql` (room
chat — only for envs on an older schema; a fresh `supabase-word-wars.sql` already
includes it).

## Demo mode (offline)

`page-ui/demo.js` holds an offline bot walkthrough (a lobby that fills with bots,
a running sprint room, `?demo=1` / `?bots=N` / `demo-ww-` room ids). It is
**disabled** — `DEMO_ENABLED = false` in `demo.js` short-circuits `demoRequested()`
so `?demo=1` just loads the normal login-gated page. Flip that flag to bring it back.
