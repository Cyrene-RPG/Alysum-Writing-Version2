-- Allow signed-in users to permanently delete their own account.
-- Run on your Supabase project after supabase-base-schema.sql.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Catalog first: FKs should cascade, but a listing with a wrong user_id still
  -- dies when the manuscript owner's account is removed.
  DELETE FROM public.library
  WHERE user_id = v_uid
     OR id IN (SELECT id FROM public.books WHERE user_id = v_uid);

  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;