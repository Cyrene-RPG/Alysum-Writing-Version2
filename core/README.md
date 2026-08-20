# Core

Feature code shared by every application. No HTML, CSS, or `document`.

Applications import these modules. This folder never imports `applications/` or `site-appearance/`.

Current files are legacy and will be remade. Do not add screens here.

| Folder | Purpose |
| --- | --- |
| writing-engine | Manuscript: chapters, versions, word count, media format |
| synchronization-engine | Local and remote persistence |
| authentication | Sign-in, session, logout, delete account |
| account | Who the user is: mode, profile, login streak |
| desktop | Desktop shell vs local guest |
| library | Public catalog and author profiles |
| publishing | Serialization and scheduled chapter releases |
| encyclopedia | World Encyclopedia blob store (story bible, not chapter prose) |
| collaboration | Beta rooms (live collaboration rooms later) |
| statistics | XP, reputation, Word Wars writing XP, comment/review engagement |
| community | Word Wars RPCs; lounge and badges later |
| analysis | Later: writing-aid reports |
| notifications | Later: follows, replies, chapter drops |
| moderation | Later: staff / reports (not an application) |
| tests | Engine tests (later) |
| server | HTTP, jobs, SQL — browsers never load this |
