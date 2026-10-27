# Separate account tabs

Use **Open another account in a separate tab** on Login or Settings → Security. The account menu in the main-site navigation also has **Open another account**. The new tab starts signed out and can use a test account while normal tabs keep the primary account.

Normal sign-ins retain the existing Supabase localStorage key and behavior. An opt-in tab stores its tokens in sessionStorage and uses a random, tab-specific Supabase storageKey, isolating auth broadcasts and token-refresh locks as well as storage. Refreshing and same-tab navigation preserve the session; closing the tab normally ends its browser persistence. Browsers may restore sessionStorage when restoring closed tabs. The launch link uses noopener so it does not inherit a copy of the opener's storage. Open each additional account through this link, rather than duplicating an already isolated tab.

The offline session hint uses the selected account storage too. Separate-tab sign-out uses Supabase's local scope and does not revoke the primary login. OAuth, email-confirmation and recovery return URLs carry only `separateAccount=1`, allowing a callback opened in a new tab to establish an isolated session instead of replacing the normal saved login. Tab identifiers and tokens are never placed in return query parameters. The provider may still have its own saved account; choose the intended Google/Discord identity, or sign in with the test account's email and password.

No database migration is needed. This separates authentication sessions; it does not create a private/incognito browser container. Device appearance preferences and already account-scoped local caches retain existing behavior. This feature is for browser tabs, not separate desktop windows.

Tests use mock identities only and never contact the live Supabase project. Run:

- `node --experimental-vm-modules --test core/tests/authentication/*.test.js core/tests/authentication/transport.mjs core/tests/authentication/session-hint.mjs core/tests/authentication/tab-redirect.mjs`
- `PLAYWRIGHT_MODULE_PATH=/path/to/playwright/index.mjs SUPABASE_BROWSER_BUNDLE=/path/to/@supabase/supabase-js/dist/umd/supabase.js node core/tests/authentication/tab-browser.mjs`
