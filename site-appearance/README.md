# Site appearance

The one look for every Alysum application. Same name as Settings → Appearance. Features never pick their own colors.

## Skin contract

Every HTML page loads these **before** application styles, in this order:

1. `/site-appearance/css-styles/theme.css`
2. `/site-appearance/css-styles/gradient-themes.css`
3. `/site-appearance/css-styles/typography.css`
4. `/site-appearance/boot.js` (no `defer` — prevents flash)

Settings (main-site) is the theme **picker**. Every other application only **applies** the saved look.

This folder never imports `core/`.

Repo map (conventions, architecture, domain): [documentation/](documentation/STRUCTURE.md).
 Token names (`--accent-inferno`) are a later conventions pass; do not rename them in this layout pass.

`components/` is later shared chrome (buttons, nav). Leave empty until a second application needs the same widget.
