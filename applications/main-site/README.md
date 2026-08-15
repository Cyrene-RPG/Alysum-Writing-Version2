# Main site

Isolated shell. Not the platform home.

**This application owns:** landing, login, signup, reset-password, settings, legal.

**This application does not own:** editor, library reader, encyclopedia, collaboration rooms, plot-studio.

Layout:

- `pages/` — HTML
- `homepage/` — landing JS + `homepage-css/`
- `login/` — login JS + `login-css/`
- `signup/` — signup JS + `signup-css/`
- `settings/` — settings JS + `settings-css/`
- `page-ui/` — shared glue used by more than one page
- `pages-css/` — shared layout (`site-responsive`, `workspace-nav`)
- `assets/` — images for these pages
- `public/` — `sw.js`, manifest, robots, favicon (served at `/` via rewrite)

Public URLs stay `/login.html`, `/settings.html`, `/js/…`, `/css/…`. Only file paths moved.
