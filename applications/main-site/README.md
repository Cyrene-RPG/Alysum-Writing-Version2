# Main site

Isolated shell. Not the platform home.

**This application owns:** landing, login, signup, reset-password, settings, legal.

**This application does not own:** editor, library reader, encyclopedia, collaboration rooms, plot-studio.

Layout:

- `pages/` — HTML
- `page-ui/` — glue for these pages only
- `css-styles/` — layout for these pages only (look comes from `site-appearance/`)
- `assets/` — images for these pages
- `public/` — `sw.js`, manifest, robots, favicon (served at `/` via rewrite)

Public URLs stay `/login.html`, `/settings.html`, `/js/…`, `/css/…`. Only file paths moved.
