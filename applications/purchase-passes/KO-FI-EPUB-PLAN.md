# Ko-fi and EPUB integration — staged implementation

This branch is a safe **foundation**, not a complete payment-to-email pipeline. Never enable live sales until the remaining items are implemented and tested.

## Existing Alysum features
- Purchase Passes already provide book/bundle snapshots, code hashing, redemption, grants and protected chapter reading.
- The existing EPUB download route only supports whole-book passes with matching chapter IDs.
- A single chapter is already representable as a bundle with one chapter ID.

## Implemented in this branch
- Cloudflare Pages webhook adapter at /api/kofi-webhook.
- Verification-token checking and strict product mapping through a new additive live-schema migration.
- Idempotent registration of Ko-fi transactions, with a pending order record.
- No code is issued and no book is unlocked from an unverified browser request.

## Still required before production
1. Confirm Ko-fi Shop payload product identifier and payment completion fields against real sandbox/test deliveries. Verify total/currency and quantity against configured product prices.
2. Add a durable delivery worker with an atomic order-claim/outbox mechanism, one unique ALYPASS code per purchased copy, Resend email sending, retry/backoff, and manual recovery.
3. Extend EPUB ingestion to parse navigation/spine into safe chapter text and stable IDs, and create matching chapter/bundle snapshots without leaking source EPUB files.
4. Add an author UI to map Ko-fi product IDs to pass IDs, and a buyer redemption flow linked from the email.
5. Add tests for duplicate webhook deliveries, invalid token, refund/reversal, partial email failure, chapter-only access, full-book access and unauthorized EPUB download.
6. Confirm the production database uses the live schema, back up the database, then apply the SQL manually. Never commit service-role keys, webhook tokens or Resend API keys.

## Environment
KOFI_VERIFICATION_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
