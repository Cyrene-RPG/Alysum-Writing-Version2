# Vercel function mount

Vercel only executes files under `/api` at the repo root. Handlers here re-export `core/server/http-handlers/`. Do not put product logic in this folder.
