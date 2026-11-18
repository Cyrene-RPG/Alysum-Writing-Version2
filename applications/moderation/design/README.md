# Moderation Center design preview

Open /moderation-preview. The Profile entry button demonstrates the proposed private section in a staff member's own profile and a fresh-verification gate. No production profile page is modified.

All accounts, cases, conversations, restrictions, appeals, network addresses and activity counts are invented. Actions update memory only and reset on reload. This preview imports no Supabase client, performs no backend calls and requires no SQL. The permission controls illustrate the planned experience; they are not a production authentication or authorization implementation.

Screens: Dashboard, Reports (book/comment), Users (all/new/active), Books, Conversations, Appeals, Audit Log, and admin-only Staff & Security. The preview supports case assignment, follow-up dates, private case notes, conflict hand-off, account warnings/restrictions/suspensions/bans/restoration, separate book visibility actions, editable message templates, user inbox/reply previews, appeals, and temporary sample network rules.

Shared Alysum fonts, appearance boot and surface tokens are reused. The existing report flow, staff report queue, production pages, identity system and database are unchanged.

Next implementation phases require server-enforced fresh authentication and MFA, authoritative staff capabilities, user/activity pagination and data retention, case/action storage, enforceable feature restrictions and account bans, private conversations with inbox delivery, appeals access during suspension, append-only audit events and trusted-edge network controls. No prototype state should be reused as a security boundary.

Validation: browser checks exercise navigation, user filters/rankings, role presentation, protected staff accounts, conflict hand-off, case changes, sample sanctions and reversals, message separation, user replies, appeals, audit history, verification and mobile overflow. Workflow screenshots document desktop and mobile layouts.
