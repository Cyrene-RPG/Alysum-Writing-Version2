# Publishing content warnings

Publishing requires an explicit core warning decision: Graphic Violence, Major Character Death, Sexual assault / non-consensual sexual activity, Sexual content involving minors, or the mutually exclusive None of these core warnings apply checkbox. There is no author opt-out. Incomplete drafts can be saved; publishing validation runs before cover uploads, access updates, and public writes.

The catalog includes 1,137 canonical labels across 39 groups, including retained legacy labels. Search supports aliases. Consensual adult descriptors are separate from abuse and consent warnings. Identity alone is not a warning. Tags do not change the site's content rules.

The existing warnings string array remains compatible. Additional metadata is saved in warningMeta in existing JSON data: core decision, optional notes, work or chapter scope, depiction, timing, detail and frequency. No SQL migration is needed. Existing labels, including unknown custom labels, are preserved without inferring stronger warnings from broad labels such as Death.

Book pages display the warning details. Chapter readers display work-wide warnings plus applicable chapter-specific warnings. Core warnings apply across the work. Rendering uses text nodes for author-supplied text. Existing published books remain readable.

The /content-warning-preview route uses the real publishing form and warning picker with invented sample chapters. Its save button uses local preview storage and its validation button never publishes.

Run node --test core/tests/publishing/*.test.js core/tests/library/author-profile.test.js. Browser coverage is in applications/studio/tests/content-warnings.mjs and runs in Chromium and Firefox through the content-warning-tests workflow.

Reader exclusion preferences and automatic content classification are outside this release. The core decision is enforced in the publishing application, not by a new database constraint.
