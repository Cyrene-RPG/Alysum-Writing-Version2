# Live moderation
The real routes are /moderation (separate staff sign-in + TOTP) and /moderation-inbox (normal account sign-in, including restricted users). The earlier design remains a clearly labeled sample at /moderation-preview.

Apply supabase/live-site/supabase-moderation-center.sql after the installed inbox and book-reports-v2 migrations. The migration is transactional and rerunnable. It preserves existing reports and audit history.

## Staff identity
A separate Supabase client uses per-tab sessionStorage under alysum-moderation-auth. Existing normal-site sessions are not copied into it. A new staff lease requires current staff membership, a real auth.sessions entry created within five minutes, and a signed aal2 JWT. Every staff read or write checks membership, MFA and a server lease (15-minute idle / eight-hour absolute limit). No self-grants or self-role changes. Authenticator enrollment uses Supabase's normal MFA flow and never sends codes to the site's database.

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
