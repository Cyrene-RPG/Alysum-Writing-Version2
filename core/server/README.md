# Server

Server-only. Browsers never load this. Feature modules in `core/` (writing-engine, identity, …) never import it.

Lives under `core/` so the repo root stays the three product folders. It is not a domain engine.

| Folder | Purpose |
| --- | --- |
| api/ | HTTP handlers |
| jobs/ | Cron / queue work |
| lib/ | Service-role client, SEO helpers |
| db/ | Migrations, RPCs, RLS |
| storage/ | Bucket rules |
| email/ | Auth templates |
| config/ | Cron notes |

Local preview: `python3 core/server/dev.py`

Service role: env vars only. Never in apps or identity.
