# Publishing flow

Publish uses the active Alysum appearance settings. Desktop uses the viewport
width with 32px gutters; phones use stacked fields and 16px gutters.

The existing controls are grouped into Story details, Tags & reader information,
Chapters & reader access, Listing appearance, and Preview. Only tags opens
initially. Validation opens the sections that contain the existing controls.
Cover/crop tools, manuscript selection, warning details and per-chapter warning
scope, calculator, mixed products, purchase links, draft saves and updates remain
available. Core-warning review is still required before publication.

Original work / Fan fiction is saved in existing book `publish_meta` and public
listing JSON. Switching preserves fandom, character and relationship entries in
the draft; original listings do not expose inactive fan-fiction fields. Legacy
Fan Fiction genres default to fan fiction unless an explicit work type is saved.
No database migration is needed.

Tag fields show at most eight suggestions plus an optional custom choice. Use
arrows and Enter, tap a suggestion, or enter custom text and press Enter/comma.
Uncommitted custom text is included on save. Genres retain the existing
three-genre limit and require a catalog choice. Selected tags can be removed.

The 504 fandom suggestions and small per-fandom character/relationship starters
come from The Pudding's October 2024 public AO3 dataset linked at
https://pudding.cool/2024/10/fanfic/. They are historical display names, not a
current popularity ranking or a complete/current AO3 canonical-tag database.
Authors can add fandoms, characters, relationships and themes that are missing.

Validation includes native publishing tests and the real Publish entry point
in Chromium/WebKit at 320, 390 and 1440px with local book/auth/storage fixtures.
Browser checks exercise metadata selection, work-type switching, save/reopen,
publication, updates, required-fandom validation and existing price controls.
Fixtures never call production or create real purchases.
