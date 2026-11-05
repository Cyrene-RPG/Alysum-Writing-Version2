# Site appearance

The one look for every Alysum application. Same name as Settings → Appearance. Features never pick their own colors.

## Skin contract

Every HTML page loads these **before** application styles, in this order:

1. `/site-appearance/css-styles/theme.css`
2. `/site-appearance/css-styles/gradient-themes/index.css` — classic tokens; `boot.js` injects the saved theme
3. `/site-appearance/css-styles/typography.css` — rules only; `boot.js` injects the saved display font
4. `/site-appearance/css-styles/surface-styles/index.css`
5. `/site-appearance/js-runtime/appearance-sheets.js` then `/site-appearance/js-runtime/boot.js` (no `defer` — prevents flash, loads the saved theme/font sheets)

Settings (main-site) is the theme **picker**. Every other application only **applies** the saved look.

This folder never imports `core/`.

Repo map (conventions, architecture, domain): [documentation/](documentation/STRUCTURE.md).
 Token names (`--accent-inferno`) are a later conventions pass; do not rename them in this layout pass.

`components/` is later shared chrome (buttons, nav). Leave empty until a second application needs the same widget.
