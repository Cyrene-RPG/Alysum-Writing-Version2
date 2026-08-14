# Identity

Auth client, session, account types, profile display names.

Must not import `design-system/` or `apps/`. `delete-account.js` still imports the main-site prompt widget; that leak is legacy and goes away when login is remade.

| File | Was |
| --- | --- |
| client.js | firebase.js (Supabase browser client) |
| session.js | supabase-session.js |
| studio-session.js | studio-session.js |
| desktop.js | desktop-auth.js |
| account-mode.js | account-mode.js |
| redirect.js | auth-redirect.js |
| logout.js | auth-logout.js |
| delete-account.js | auth-delete-account.js |
| ensure-login-streak.js | ensure-login-streak.js |
| profile-display.js | profile-display.js |
| presence.js | stub (user-presence.js was deleted) |
