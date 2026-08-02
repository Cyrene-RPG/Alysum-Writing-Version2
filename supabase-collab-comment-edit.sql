-- Collab comments: allow authors of a comment to edit their own body.
-- Safe to re-run in Supabase → SQL Editor.

ALTER TABLE public.collab_comments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.list_collab_comments(p_book_id text, p_chapter_id text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_collab_chapter(p_book_id, p_chapter_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', c.id,
    'book_id', c.book_id,
    'chapter_id', c.chapter_id,
    'author_id', c.author_id,
    'commenter_id', c.commenter_id,
    'parent_id', c.parent_id,
    'status', c.status,
    'paragraph_index', c.paragraph_index,
    'quote', c.quote,
    'body', c.body,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'resolved_at', c.resolved_at,
    'commenter_username', coalesce(u.username, ''),
    'commenter_display_name', coalesce(u.display_name, '')
  )
  FROM public.collab_comments c
  LEFT JOIN public.users u ON u.id = c.commenter_id
  WHERE c.book_id = p_book_id
    AND c.chapter_id = p_chapter_id
  ORDER BY c.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_collab_comment(p_comment_id uuid, p_body text)
RETURNS public.collab_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.collab_comments;
BEGIN
  SELECT * INTO v_row FROM public.collab_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_row.commenter_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  IF coalesce(trim(p_body), '') = '' THEN
    RAISE EXCEPTION 'empty_body';
  END IF;

  UPDATE public.collab_comments
  SET body = trim(p_body),
      updated_at = now()
  WHERE id = p_comment_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_collab_comment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_collab_comments(text, text) TO authenticated;
