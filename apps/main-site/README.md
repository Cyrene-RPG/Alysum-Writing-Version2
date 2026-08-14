# Main site

Isolated shell. Not the platform home.

**This app owns:** landing, login, signup, reset-password, settings, legal.

**This app does not own:** editor, library reader, encyclopedia, collab, plot-studio.

Layout:

- `pages/` — HTML
- `ui/` — glue for these pages only
- `css/` — layout for these pages only (look comes from `design-system/`)
- `assets/` — images for these pages
- `public/` — `sw.js`, manifest, robots, favicon (served at `/` via rewrite)

Public URLs stay `/login.html`, `/settings.html`, and so on. Only file paths moved.
