# Design system

The one look for every Alysum app. Features never pick their own colors.

## Skin contract

Every HTML page loads these **before** app CSS, in this order:

1. `/design-system/css/theme.css`
2. `/design-system/css/gradient-themes.css`
3. `/design-system/css/typography.css`
4. `/design-system/appearance/boot.js` (no `defer` — prevents flash)

Settings (main-site) is the theme **picker**. Every other app only **applies** the saved look.

This folder never imports `core/`.

Repo map (conventions, architecture, domain): [docs/](docs/STRUCTURE.md).
 Token names (`--accent-inferno`) are a later conventions pass; do not rename them in this layout pass.

`components/` is later shared chrome (buttons, nav). Leave empty until a second app needs the same widget.
