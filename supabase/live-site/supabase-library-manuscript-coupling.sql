-- Couple public.library to public.books.
-- A catalog row is a listing of one manuscript: same id, same owner.
-- Deleting the manuscript (or the account) must delete the listing.
--
-- This file is DIAGNOSTIC-FIRST. Run sections 1-4, read the output, then run
-- sections 5-10. Nothing is written before section 5.
-- Safe to re-run after the first successful pass (writes become no-ops).
--
-- Do not run supabase-library-rls.sql (it drops every library policy).
-- Repair rule: books.user_id wins. Do not backfill from data.ownerUid.

-- ---------------------------------------------------------------------------
-- 1. Books SELECT policies that dump every manuscript (staff / USING true)
-- ---------------------------------------------------------------------------
--   Own / collab / editor policies are expected. Anything matching staff or
--   `true` is why Studio / Word Wars can show other people's books.
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'books'
  AND cmd = 'SELECT'
  AND (
    COALESCE(qual, '') ~* 'is_moderation_staff'
    OR COALESCE(qual, '') ~* '^\s*true\s*$'
    OR policyname ILIKE '%staff%'
    OR policyname ILIKE '%all%'
  )
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- 2. Catalog owner ≠ manuscript owner
-- ---------------------------------------------------------------------------
SELECT lib.id,
       lib.data->>'title' AS title,
       lib.user_id AS catalog_owner,
       b.user_id AS manuscript_owner,
       lib.data->>'ownerUid' AS json_owner
FROM public.library lib
JOIN public.books b ON b.id::text = lib.id::text
WHERE lib.user_id IS DISTINCT FROM b.user_id
ORDER BY lib.data->>'title';

-- ---------------------------------------------------------------------------
-- 3. Published catalog with no manuscript (Studio-deleted ghosts)
-- ---------------------------------------------------------------------------
SELECT lib.id,
       lib.user_id,
       lib.data->>'title' AS title
FROM public.library lib
LEFT JOIN public.books b ON b.id::text = lib.id::text
WHERE b.id IS NULL
  AND COALESCE((lib.data->>'isPublished')::boolean, true) = true
ORDER BY lib.data->>'title';

-- ---------------------------------------------------------------------------
-- 4. Published rows with library.user_id null (account-delete leftovers)
-- ---------------------------------------------------------------------------
SELECT lib.id,
       lib.data->>'title' AS title,
       lib.data->>'ownerUid' AS json_owner
FROM public.library lib
WHERE lib.user_id IS NULL
  AND COALESCE((lib.data->>'isPublished')::boolean, true) = true
ORDER BY lib.data->>'title';

-- ===========================================================================
-- WRITES — run only after you have read sections 1-4
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 5. Point catalog owner at the manuscript owner
-- ---------------------------------------------------------------------------
--   No ownerUid backfill. Rows without a books match are left for section 6.
UPDATE public.library
SET user_id = b.user_id
FROM public.books b
WHERE b.id::text = library.id::text
  AND library.user_id IS DISTINCT FROM b.user_id;

-- ---------------------------------------------------------------------------
-- 6. Delete catalog rows that have no manuscript
-- ---------------------------------------------------------------------------
--   Orphans only. Does not touch a live books row.
DELETE FROM public.library
WHERE NOT EXISTS (
  SELECT 1 FROM public.books b WHERE b.id::text = library.id::text
);

-- ---------------------------------------------------------------------------
-- 7. Drop leftover staff / USING (true) SELECT policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, COALESCE(qual, '') AS qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'books'
      AND cmd = 'SELECT'
  LOOP
    IF r.qual ~* 'is_moderation_staff'
      OR r.qual ~* '^\s*true\s*$'
    THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.books', r.policyname);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "books_select_staff" ON public.books;
DROP POLICY IF EXISTS "books_select_all" ON public.books;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.books;

-- ---------------------------------------------------------------------------
-- 8. library.id → books.id ON DELETE CASCADE
-- ---------------------------------------------------------------------------
--   Fails if section 6 left orphans — that is intentional.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'library'
      AND c.conname = 'library_id_fkey'
  ) THEN
    ALTER TABLE public.library
      ADD CONSTRAINT library_id_fkey
      FOREIGN KEY (id) REFERENCES public.books (id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. library.user_id ON DELETE CASCADE (was SET NULL)
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'library'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ~* 'user_id.*auth\.users'
  LOOP
    EXECUTE format('ALTER TABLE public.library DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.library
  ADD CONSTRAINT library_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 10. Keep library.user_id locked to books.user_id
-- ---------------------------------------------------------------------------
--   books_keep_owner already blocks editor theft of books.user_id — leave it.

CREATE OR REPLACE FUNCTION public.library_match_book_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT b.user_id INTO v_owner
  FROM public.books b
  WHERE b.id::text = NEW.id::text;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'library row requires a manuscript'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'library owner must match manuscript owner'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS library_match_book_owner ON public.library;
CREATE TRIGGER library_match_book_owner
  BEFORE INSERT OR UPDATE ON public.library
  FOR EACH ROW
  EXECUTE FUNCTION public.library_match_book_owner();

CREATE OR REPLACE FUNCTION public.books_copy_owner_to_library()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    UPDATE public.library
    SET user_id = NEW.user_id
    WHERE id::text = NEW.id::text
      AND user_id IS DISTINCT FROM NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS books_copy_owner_to_library ON public.books;
CREATE TRIGGER books_copy_owner_to_library
  AFTER UPDATE OF user_id ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION public.books_copy_owner_to_library();
