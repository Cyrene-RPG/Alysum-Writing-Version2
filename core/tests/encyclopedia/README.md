# Story Bible checks

- `model.test.js`: dependency-free domain, adapter mapping, safe export boundary.
- `database.mjs`: executes the actual additive migration twice in disposable PGlite/PostgreSQL. Checks owner/viewer/editor access, revocation, direct-write denial, cross-Bible reference rejection, version conflicts, atomic updates, draft grouping, portraits, custom fields, and retry-safe creation. Never connects to production.
- `workspace.mjs`: actual workspace and sample adapter modules executed in an isolated jsdom context. Exercises editing, safe text rendering, profiles, categories, relationships, facts, archive/restore, and history. Requires Node VM modules and an externally installed jsdom. No production auth/network calls.

Commands and staging browser requirements are in `applications/encyclopedia/README.md`.
