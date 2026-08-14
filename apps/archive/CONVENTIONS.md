# Archive Conventions

This folder stores retired code that is not wired into the live site.

## Naming
- Keep original file names whenever possible.
- Group by feature area first, then by asset type if needed.
- Use kebab-case for new folders.

## Rules
- Do not import or reference files from archive in live apps.
- Keep archived code intact (no behavior rewrites unless documenting a fix).
- Add a short README in each archived feature folder when context is needed.

## Suggested Layout
- apps/archive/<feature-name>/pages/
- apps/archive/<feature-name>/scripts/
- apps/archive/<feature-name>/styles/
- apps/archive/<feature-name>/assets/

