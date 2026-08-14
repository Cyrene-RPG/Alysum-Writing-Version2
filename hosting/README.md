# Hosting

Deploy and environment contracts. **Not product code.** Not secrets.

Real secrets (service role, LiveKit, IndexNow) live in the host dashboard / a local `.env` that is gitignored. They never go in this folder or in `applications/` / `site-appearance/` / browser `core/` modules.

## In this folder

| File | Why it lives here |
| --- | --- |
| env.example | Names of env vars only. Copy to a local `.env` at the repo root (tools look there). |
| middleware.js | Bot-preview logic. The file at the git root re-exports this — Vercel only loads middleware from the root. |

## Pinned at the git root (tools will not look in a subfolder)

These are not secret. Git, Vercel, and Firebase only read them from the repository root. Leave them there.

| File | Who requires it at root |
| --- | --- |
| `.gitignore` / `.gitattributes` | Git |
| `vercel.json` | Vercel |
| `middleware.js` | Vercel (one-line re-export of `hosting/middleware.js`) |
| `firebase.json` / `.firebaserc` | Firebase CLI |
| `api/` | Vercel functions mount → `core/server/http-handlers/` |

`.env` (real keys) may appear at the repo root on your machine. It is gitignored. Never commit it.
