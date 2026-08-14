# Database

Numbered SQL, one change per file.

- `migrations/` — schema changes, kebab-case, app-prefixed: `supabase-editor-autosave.sql`
- `functions/` — RPCs (`create_book_version`)
- `policies/` — RLS. This is the real permission layer.
- `seeds/` — optional local/dev data

Source of truth is the live Supabase project until migrations are exported. Do not invent new schema in this layout pass.
