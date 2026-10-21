# Audiobook drafts — feature branch

This first increment adds the Written book/Audiobook choice to both Studio entry buttons. Written books retain their existing blank-draft and manuscript import behavior. Audiobooks are independent private records; an author can leave an audiobook standalone or link it to a written book they own.

The audio workspace saves a title, description, narrator, production credits, and distribution-permission confirmation. Owners can upload named recordings, preview them through expiring private playback links, and remove recordings. Uploaded files stay private. This increment does not publish audio, send notifications, take payments, record microphone audio, add public Listen buttons, or give collaborators access to recordings. Public editions, listener progress, artwork, playlist reordering, and collaborator permissions are subsequent increments.

## Data and storage

- No existing written-book columns, manuscripts, editor permissions, or publication records are changed. Audio metadata and track records use separate tables.
- Prepared migration: `supabase/live-site/supabase-audiobooks.sql`. It has not been applied to the live project. Do not run it or merge this branch until the owner requests rollout.
- Private bucket: `audiobook-recordings`. Paths are `{owner uuid}/{audiobook uuid}/{random uuid}.{extension}`. Maximum file size is 50 MiB, with MP3, M4A, OGG, WAV, and WebM containers. Browser decoding must confirm a duration before upload; MP3/M4A are the most portable formats.
- Row-level rules and checked functions authorize owners only. Linking a written book checks its actual owner in the database. Anonymous users and other authors cannot read audiobook metadata or files, create signed playback links through storage authorization, or mutate the audiobook. Files cannot be overwritten by the client.
- Storage upload and metadata insertion are separate operations. After an uncertain insert response, the client checks whether the path is already registered before cleaning up. It keeps files on uncertain status and asks the author to reload. An unused file may need administrative cleanup after a network interruption or failed cleanup. There is no background uploader or resumable upload in this increment.
- File MIME headers and browser validation improve error reporting; they do not prove that a narrator has granted distribution rights. The uploader must have those rights.
- Local guest accounts retain written-book creation/import. Cloud sign-in is required for audio storage. Missing audio setup produces a retryable audio-only error; it does not stop Studio from opening written books.

## Validation

`node --test core/tests/audiobooks/*.test.js` exercises metadata/file validation, ownership prerequisites, lost responses, cleanup boundaries, and private preview URLs. PostgreSQL fixtures under that directory are for a disposable `audiobook_test` database only. The workflow applies the migration repeatedly and checks owner/other-account/anonymous access, file authorization, and preservation of written-book records.

`applications/studio/tests/audiobooks.mjs` uses the real UI modules with invented data and a generated WAV recording. Chromium checks the written-book delegates, both audio entry flows, linked/standalone choices, credits, upload failure/retry, playback controls, removal, local-account messaging, and horizontal overflow at 1440px, 390px, and 320px. It never connects to the live backend. Screenshots are attached to the workflow run.
