# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Alysum** — a web platform for writers (drafting, publishing serialized fiction, a world encyclopedia, collaboration/beta rooms, writing sprints "Word Wars"). Vanilla HTML + browser-native ESM. **No build step, no bundler, no `package.json`, no npm.** Dependencies are loaded from URLs (e.g. `https://esm.sh/@supabase/supabase-js@2`). Backend is Supabase (Postgres + Auth + Realtime); serverless functions run on Vercel; Firebase Hosting is a secondary target.

The current codebase is explicitly treated as **legacy and mid-rewrite**. `site-appearance/documentation/ARCHITECTURE.md` opens with "Assume every current file is bad." New/moved code must follow the conventions below even though existing modules violate them.

## Commands

Local preview (use this, not `serve .` or a generic static server — it reproduces production URL rewrites):

```bash
python3 core/server/dev.py
```

Then open http://127.0.0.1:3000/ . Override the port with `PORT=xxxx`.

There is no lint, no test runner, and no CI test step yet. `core/tests/` is a placeholder — engine tests start with `writing-engine/` once it is storage-free. When tests arrive they use the `.test` suffix (`pagination.test.js`).

Deploy contracts live in `vercel.json` (primary) and `firebase.json` (secondary). `python3 core/server/dev.py`'s `public_to_file()` mirror of the rewrites is the quickest reference for "which file does URL X serve".

## Architecture: three product folders

Read `site-appearance/documentation/STRUCTURE.md` and `ARCHITECTURE.md` in full before moving code. The layered rule, top to bottom:

1. **`applications/`** — screens only. HTML + thin glue JS. Import `site-appearance/` for look and `core/` for behavior. **Applications never import other applications.** Each product surface is its own `applications/<name>/`. `main-site/` is an isolated shell (landing, login, signup, settings, legal) and must not absorb new surfaces. `applications/archive/` is retired code — live code never imports it. Staff tools are not applications.
2. **`site-appearance/`** — the single visual system: colors, gradient themes, fonts, backgrounds, display type. Same name as Settings → Appearance. Settings on main-site is the *picker*; every other app only *applies* the saved theme. **Never imports `core/`.**
3. **`core/`** — what the product *is*: features/data/logic. **No HTML, CSS, or `document`.** Never imports `site-appearance/` or `applications/`. `core/server/` is HTTP handlers and jobs that browsers never load.

Same folder name under `applications/` and `core/` = screen vs. data (e.g. `applications/encyclopedia/` is the shelf UI, `core/encyclopedia/blob-store.js` is the store).

### Skin contract

Every application page (except the marketing homepage, which intentionally skips the gradient theme) loads these in order, with `boot.js` **not** deferred:

1. `/site-appearance/css-styles/theme.css`
2. `/site-appearance/css-styles/gradient-themes/index.css`
3. `/site-appearance/css-styles/typography.css`
4. `/site-appearance/css-styles/surface-styles/index.css`
5. `/site-appearance/js-runtime/boot.js`

### Hosting layout constraints

- The deploy root **is** the git root, so `/core/` and `/site-appearance/` are real public URLs. Do **not** add a catch-all rewrite to `index.html` — it would swallow engine files.
- A handful of non-secret files are pinned at the git root because Git/Vercel/Firebase only read them there: `.gitignore`, `.gitattributes`, `vercel.json`, `firebase.json`, `.firebaserc`, `middleware.js` (a one-line re-export of `hosting/middleware.js`).
- `api/` at the root exists only because Vercel mounts functions from there; its files re-export `core/server/http-handlers/`. No product logic in `api/`.

## Data & domain

- Supabase returns **snake_case**. Convert to camelCase at the data-access layer inside `core/` so nothing outside that layer sees a snake_case field. Legacy modules still leak snake_case through — fix on the rewrite pass, don't extend the leak.
- Shared shapes (Book, Chapter, Version, User, Encyclopedia blob) are defined in `site-appearance/documentation/DOMAIN.md`. Editor and library must agree on these or data corrupts.
- `supabase/live-site/*.sql` = SQL from the current production DB. `supabase/remake/*.sql` = migrations for the rewrite. **Never run `remake/` SQL against the live project** — live `public.books` uses text ids and epoch-ms `created`/`updated`; remake uses uuid ids and `created_at`/`updated_at`.
- Manuscript snapshots currently live in `core/writing-engine/version-api.js` (still mixed with storage). Guest/local data uses `core/synchronization-engine/local-adapter.js` (localStorage). The rewrite goal: `writing-engine` becomes storage-free and adapters own all I/O.

## Secrets

- Publishable/anon Supabase key: in the browser, hardcoded in `core/authentication/client.js` (legacy; to be fixed in the remake).
- Service role / LiveKit / IndexNow keys: host dashboard or a gitignored root `.env` only. Names (not values) are in `hosting/env.example`. Never in `applications/`, `site-appearance/`, or browser `core/` modules.

## Naming conventions (`site-appearance/documentation/CONVENTIONS.md` is authoritative)

Consistency over cleverness; spell words out (`authentication` not `auth`, `utilities` not `lib`, `database` not `db`). Highlights:

- Folders: kebab-case, 1–2 full English words. Per-feature files drop the redundant prefix (`applications/editor/page-ui/pagination.js`, not `editor-pagination.js`).
- JS: camelCase vars, verb-first camelCase functions, booleans as `isX`/`hasX`, `_leadingUnderscore` privates, `CONST_CASE` for individual constants.
- Storage keys / BroadcastChannel / caches: `alysum:feature:...` namespace. Custom events: `namespace:action`.
- DB: snake_case plural tables, snake_case columns, verb-first snake_case RPCs. SQL migrations: `supabase-<app>-<thing>.sql`.
- Import alias (where used): `@alysum/<folder>/`. Some legacy imports carry cache-busting query strings (`./outline.js?v=4`) — keep them consistent when editing that module.
- Anything not covered: extend the closest existing rule, don't invent a new style.
