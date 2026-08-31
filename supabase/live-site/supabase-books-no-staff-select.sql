-- Repair: writer lists (Studio, Word Wars) must not see other people's manuscripts.
-- Staff review stays on staff_list_user_books — do not add a books SELECT for staff.
-- Safe to re-run.

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
