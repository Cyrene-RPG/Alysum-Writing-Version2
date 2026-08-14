# Server

Server-only. Browsers never load this. Feature modules in `core/` (writing-engine, authentication, …) never import it.

Lives under `core/` so the repo root stays the three product folders. It is not a domain engine.

| Folder | Purpose |
| --- | --- |
| http-handlers/ | HTTP handlers |
| jobs/ | Cron / queue work |
| utilities/ | Service-role client, SEO helpers |
| database/ | Migrations, RPCs, RLS |
| storage/ | Bucket rules |
| email/ | Sign-in templates |
| configuration/ | Cron notes |

Local preview: `python3 core/server/dev.py`

Service role: env vars only. Never in applications or browser modules.
