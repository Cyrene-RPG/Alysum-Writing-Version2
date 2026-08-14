# Naming Conventions

Follow these rules for everything you create or rename in this repo. Do not invent alternatives case-by-case — if something is not covered, pick the closest matching rule and stay consistent.

Current modules are **legacy**. They will be remade. New and moved names still follow this file.

## Four core rules

1. **Consistency above all** — one convention, followed everywhere, even when a "better" one-off name is tempting.
2. **Readability over brevity** — write the full word out. Editors have autocomplete; do not abbreviate to save keystrokes.
3. **Names must explain purpose on their own** — if a name needs a comment to explain what it does, rename it instead of commenting it.
4. **Context matters** — do not repeat a name's context if the folder or class it lives in already provides that context.

## Folder names

One or two full English words. The name itself says what the folder is for.

Write the word out: `authentication` not `auth`, `collaboration` not `collab`, `applications` not `apps`, `css-styles` not `css`, `documentation` not `docs`, `page-ui` not `ui`, `site-appearance` for the look folder, `database` not `db`, `utilities` not `lib`, `hosting` not `host`.

The only abbreviation we keep is root `api/` — Vercel will only run functions from that path.

## Architecture walls

- `applications/` never import other applications. They share through `core/` and `site-appearance/`.
- `core/` never imports `site-appearance/` or `applications/` (no DOM, no CSS, no HTML).
- `site-appearance/` never imports `core/` (look does not know about books).
- Live code never imports `applications/archive/`.
- Main-site does not absorb new product surfaces — those get their own `applications/<name>/`.
- Supabase returns snake_case. Convert to camelCase at the data-access layer in `core/` so nothing outside that layer touches a snake_case field. Enforce this on the rewrite pass; today's modules still pass snake_case through.

## Names

| Thing | Convention | Example |
| --- | --- | --- |
| Folder | kebab-case, 1–2 full English words | `collaboration-rooms/` |
| Plain file | kebab-case | `conflict-resolver.js` inside `synchronization-engine/` |
| Shared/flat folder | feature prefix | `synchronization-conflict-resolver.js` only if files sit flat in `core/` |
| Per-feature folder | drop redundant prefix | `applications/editor/page-ui/pagination.js`, not `editor-pagination.js` |
| React component | PascalCase | `BoardToolbar.tsx` |
| TS type/interface | PascalCase, no I/T prefix | `type Chapter` (from table `chapters`) |
| React hook | camelCase, `use` prefix | `useSyncStatus` |
| JS variable | camelCase; booleans as yes/no | `isSynced`, `hasPendingChanges` |
| JS function | camelCase, verb-first | `resolveSyncConflict()` |
| Private helper | leading `_` | `_normalizeDraft()` |
| Constant | CONST_CASE | `MAX_SPRINT_SECONDS` |
| Env variable | CONST_CASE; Vite needs `VITE_` | `VITE_SUPABASE_URL` vs `SUPABASE_SERVICE_ROLE_KEY` |
| CSS class | kebab-case; variants `--` | `.chapter-toolbar--collapsed` |
| CSS custom property | `--bg-` `--accent-` `--title-font-` matching Appearance labels | `--accent-inferno` |
| HTML id | kebab-case | `id="sprint-timer"` |
| Custom event | `namespace:action` | `synchronization:conflict-detected` |
| Storage key | `alysum:feature:...` | `alysum:editor:draft-{id}` |
| BroadcastChannel / caches | same namespace | `alysum:synchronization:channel` |
| DB table | snake_case, plural | `chapters` |
| DB column / FK | snake_case | `chapter_id` |
| RPC | snake_case, verb-first | `create_book_version` |
| SQL migration | kebab-case, app-prefixed | `supabase-editor-autosave.sql` |
| URL path | kebab-case | `/encyclopedia/` |
| Import alias | `@alysum/<folder>/` | `@alysum/encyclopedia/` |
| Test file | `.test` before extension | `pagination.test.js` |
| Asset file | kebab-case | `homepage-editor-preview.png` |

Config objects can stay camelCase. CONST_CASE is for individual unchanging values, not every top-level declaration.

Anything new that does not fit a row: extend the closest matching row. Do not start a fifth style.
