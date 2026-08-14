# Authentication

Sign-in and sign-out. Session, OAuth redirect, logout, delete account, presence.

Who the user *is* lives in `core/account/`. Desktop vs local guest lives in `core/desktop/`.

| File | Purpose |
| --- | --- |
| client.js | Supabase browser client |
| session.js | Wire current session + sign-in changes |
| redirect.js | OAuth return URLs |
| logout.js | Sign out and go home |
| delete-account.js | Remove the signed-in account |
| presence.js | Online presence stub |
