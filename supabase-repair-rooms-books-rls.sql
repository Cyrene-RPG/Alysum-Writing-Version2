-- Repair: restore collab collaborator SELECT on books after library RLS wipes.
-- Safe to re-run. Requires collab_memberships (from supabase-collab-rooms.sql).

DO $$
BEGIN
  IF to_regclass('public.collab_memberships') IS NULL THEN
    RAISE NOTICE 'collab_memberships missing — run supabase-collab-rooms.sql first';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "books_select_collab_member" ON public.books;
  CREATE POLICY "books_select_collab_member" ON public.books
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.collab_memberships m
        WHERE m.book_id = books.id::text
          AND m.collaborator_id = auth.uid()
          AND m.status = 'active'
      )
    );
END $$;
