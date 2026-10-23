# Live moderation
The real routes are /moderation (separate staff sign-in + email code) and /moderation-inbox (normal account sign-in, including restricted users). The earlier design remains a clearly labeled sample at /moderation-preview.

Apply supabase/live-site/supabase-moderation-center.sql after the installed inbox and book-reports-v2 migrations. The migration is transactional and rerunnable. It preserves existing reports and audit history.

## Staff identity
A separate Supabase client uses per-tab sessionStorage under alysum-moderation-auth. Existing normal-site sessions are not copied into it. A new staff lease requires current staff membership, a real auth.sessions entry created within five minutes, and signed OTP authentication proof in the JWT. Every staff read or write checks membership, email-code verification and a server lease (15-minute idle / eight-hour absolute limit). No self-grants or self-role changes. Email codes are generated, delivered and checked by Supabase Auth. The database checks signed OTP method/timestamp claims; form payloads cannot grant access.

Add production /moderation URLs to Supabase's allowed redirect URLs for Google/Discord sign-in if not already covered by an allowed URL. Email/password sign-in does not require redirect configuration. No service-role key is exposed or required.

## Real actions
User directory uses auth.users joined to a selected set of profile fields. Staff never receive private manuscript data. New/active views use real dates and daily aggregates; activity history starts on deployment and is not fabricated. Presence records distinct active/reading days; committed book changes record writing days and comments/published announcements record community counts.

Warnings, feature restrictions, suspensions, bans and reversals are database records with expiry and audit. Database triggers guard public-table writes, including calls through existing security-definer functions. Bans block normal account actions; authentication remains available specifically for moderation conversations and appeals. Public anonymous reading remains possible after sign-out. Publishing restrictions preserve private drafting; suspensions/bans block private cloud writes.

Book visibility is independent of account status. Published-reading and catalog wrappers filter hidden/removed books; original implementations are kept private and retain existing publication, paid-access and legacy visibility checks. The manuscript is never deleted.

Staff-only case notes stay in v2 report events. Official conversations use separate private tables, recipient-checked RPCs and on-site inbox notifications. Recipients never receive staff identity IDs, private notes or reporter identities. Request keys deduplicate writes. Appeal decisions require a different reviewer from the original sanction author; permanent-ban reversals require admins.

Audit rows cannot be edited or deleted through browser-facing permissions. Staff changes invalidate target leases. Existing non-staff roles are not granted anything by this migration.

## Network controls
Admin-only, expiring, single-address IP blocks are enforced by functions/_middleware.js on Cloudflare website traffic. The address comes from trusted Cloudflare metadata, never form/request JSON. Decisions cache for at most five seconds. Database outages fail open for public availability; account restrictions remain database-enforced. This does not block direct access to Supabase or replace upstream DDoS/rate-limiting defenses. Challenge/rate-limit buttons are not offered without real enforcement.

## Rollout
No production migration or staff action is executed by source changes. Run the SQL in the live editor, then publish the frontend. Test with a staff account, a normal account and a separate non-staff browser. Never use sample rows to test live bans.

## Switch existing installations to email codes
Run supabase/live-site/supabase-moderation-email-codes.sql. It changes only staff verification functions and clears old staff leases; reports, messages and sanctions are preserved. In Supabase Auth > Email Templates > Magic Link, include `<p>Your sign-in code: <strong>{{ .Token }}</strong></p>`; retain existing sign-in links for normal account flows. Set the email OTP length to six digits and expiry to 300 seconds. The app does not create accounts when requesting codes, and uses the signed-in staff account email only. Resend requests have a 60-second UI cooldown plus Supabase rate limits. Browser values are never trusted as proof. No authenticator app is required by the moderation flow; existing enrolled factors are not deleted from user accounts.

## Moderator chat
Run `supabase/live-site/supabase-moderator-chat.sql` after the Moderation Center/email-code migrations. Rerun the chat migration after reinstalling the base Center migration, which deliberately revokes browser access to all internal `mc_` functions. No live SQL is executed by source deployment.

Open `/moderation?view=chat` or choose Moderator Chat in the verified staff sidebar. One private room is shared by admins and moderators. History is paginated in batches of 50; messages update every five seconds while the room is visible. New pages catch up immediately. Messages are plain text, 1–4,000 characters, with server-set identity, role and time. Ctrl/Command+Enter sends; Enter adds a line. Failed sends preserve the draft and the retry identifier. There is a per-user limit of 30 messages per minute. Messages cannot be edited or deleted through browser-facing permissions.

Every history read and send checks current staff membership, signed email-code proof and the existing staff lease through the separate moderation client. Normal users and unverified, expired or revoked staff cannot read/send, including through direct RPC calls. Reads/polling never extend the idle lease. Lock, account changes, navigation and access-loss clear the room; drafts/history are not persisted in browser storage. This room is separate from author conversations and sends no user inbox notifications.

`/moderation-preview?view=chat` is an isolated sample with invented staff and messages; nothing is transmitted. Validation uses `core/tests/moderation/chat-security.sql`, service tests, and `chat-ui.mjs` with external jsdom. An optional disposable runner uses `PGLITE_MODULE=... node --test core/tests/moderation/chat-database.mjs`.
