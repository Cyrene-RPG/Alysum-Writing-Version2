# Core

Feature code shared by every app. No HTML, CSS, or `document`.

Apps import these modules. This folder never imports `apps/` or `design-system/`.

Current files are legacy and will be remade. Do not add UI here.

| Folder | Purpose |
| --- | --- |
| writing-engine | Manuscript: chapters, versions, word count, media format |
| sync-engine | Local and remote persistence |
| identity | Auth client, session, account types |
| library | Public catalog and author profiles |
| publishing | Serialization and scheduled chapter releases |
| encyclopedia | World Encyclopedia blob store (story bible, not chapter prose) |
| collab | Beta rooms (live collab rooms later) |
| community | Later: lounge, word wars, badges |
| analysis | Later: writing-aid reports |
| notifications | Later: follows, replies, chapter drops |
| tests | Engine tests (later) |
| server | HTTP, jobs, SQL — browsers never load this |

