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
- archive/<feature-name>/pages/
- archive/<feature-name>/scripts/
- archive/<feature-name>/styles/
- archive/<feature-name>/assets/
