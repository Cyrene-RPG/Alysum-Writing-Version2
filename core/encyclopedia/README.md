# Encyclopedia

`model.js` defines the new Story Bible domain: templates, entry validation, wiki link extraction, search, roles, and publication/export metadata stripping. It is independent of the old Bible implementation.

Data access lives in `core/synchronization-engine/story-bible.js`; screens in `applications/encyclopedia/`. Cloud is authoritative. SQL enforces membership, revisions, collection-scoped references, and atomic profile/link updates. See the application README for deployment and tests.

`blob-store.js` remains untouched for legacy worldbuilding consumers. The new Story Bible never imports or reads it.
