-- Repair: a writer (often a staff account) authored manuscripts under an older
-- auth id and now signs in under a newer one, so public.books.user_id no longer
-- matches auth.uid(). While a permissive staff/`true` SELECT policy existed the
-- mismatch was invisible; owner-only RLS (supabase-books-no-staff-select.sql)
-- now hides those books from Studio / Word Wars / the editor.
--
-- This file is DIAGNOSTIC-FIRST. Run sections 1-3, read the output, fill in the
-- ids in section 4, then run section 4. Nothing is written before section 4.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Every auth account tied to the writer's email
-- ---------------------------------------------------------------------------
--   Replace the address. If more than one row comes back, the account she logs
--   in with today is the one with the most recent last_sign_in_at.
SELECT id, email, created_at, last_sign_in_at
FROM auth.users
WHERE lower(email) = lower('REPLACE_WITH_ADMIN_EMAIL')
ORDER BY created_at;

-- ---------------------------------------------------------------------------
-- 2. Who actually owns the manuscripts she wrote
-- ---------------------------------------------------------------------------
--   Match on her titles (repeat the ILIKE per title, or widen the pattern).
SELECT b.id,
       b.title,
       b.user_id                         AS owner_id,
       u.email                           AS owner_email,
       b.firebase_uid,
       to_timestamp(b.created / 1000)     AS created,
       to_timestamp(b.updated / 1000)     AS updated
FROM public.books b
LEFT JOIN auth.users u ON u.id = b.user_id
WHERE b.title ILIKE '%archangel%'
ORDER BY b.updated DESC;

-- ---------------------------------------------------------------------------
-- 3. Book counts grouped by owner id, across every account on that email
-- ---------------------------------------------------------------------------
SELECT b.user_id                          AS owner_id,
       u.email                            AS owner_email,
       count(*)                           AS book_count,
       max(to_timestamp(b.updated / 1000)) AS last_updated
FROM public.books b
LEFT JOIN auth.users u ON u.id = b.user_id
WHERE b.user_id IN (
  SELECT id FROM auth.users WHERE lower(email) = lower('REPLACE_WITH_ADMIN_EMAIL')
)
GROUP BY b.user_id, u.email
ORDER BY last_updated DESC;

-- ---------------------------------------------------------------------------
-- 4. Repoint the manuscripts (and their catalog rows) to the current auth id
-- ---------------------------------------------------------------------------
--   OLD_AUTH_ID  = the stale owner_id from section 2/3
--   NEW_AUTH_ID  = the id she signs in with today (section 1)
--   Both must be real auth.users ids. Run inside the transaction so a wrong
--   pair can be rolled back after the SELECT count check.

BEGIN;

WITH moved AS (
  UPDATE public.books
  SET user_id = 'NEW_AUTH_ID'
  WHERE user_id = 'OLD_AUTH_ID'
  RETURNING id
)
SELECT count(*) AS books_repointed FROM moved;

UPDATE public.library
SET user_id = 'NEW_AUTH_ID'
WHERE user_id = 'OLD_AUTH_ID';

-- Inspect books_repointed above. If it matches section 3, COMMIT; else ROLLBACK.
-- COMMIT;
-- ROLLBACK;
