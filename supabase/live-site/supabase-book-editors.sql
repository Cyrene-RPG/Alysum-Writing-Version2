-- Secure book collaboration. LIVE database, transactional and safe to rerun.
-- Run before deploying the collaborator fixes. Preserves manuscripts and editor memberships.
BEGIN;
DO $$ BEGIN
    IF to_regclass('public.books') IS NULL OR to_regclass('public.users') IS NULL THEN
        RAISE EXCEPTION 'Install the live base schema first.';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.book_share_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),book_id text NOT NULL,
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_email text NOT NULL DEFAULT '',
    invite_token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
    status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','accepted')),
    created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,
    expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
    accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.book_share_invites ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.book_share_invites ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
UPDATE public.book_share_invites SET expires_at=created_at+interval '7 days' WHERE expires_at IS NULL;
ALTER TABLE public.book_share_invites ALTER COLUMN expires_at SET DEFAULT (now()+interval '7 days');
ALTER TABLE public.book_share_invites ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE public.book_share_invites ALTER COLUMN invite_token SET DEFAULT
    (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''));
CREATE TABLE IF NOT EXISTS public.book_editors (
    book_id text NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_email text NOT NULL DEFAULT '',accepted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(book_id,user_id)
);
CREATE INDEX IF NOT EXISTS book_share_invites_book_idx ON public.book_share_invites(book_id,created_at DESC);
CREATE INDEX IF NOT EXISTS book_share_invites_owner_idx ON public.book_share_invites(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS book_editors_user_idx ON public.book_editors(user_id);
ALTER TABLE public.book_share_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_editors ENABLE ROW LEVEL SECURITY;
-- Membership and invitations can only be changed through checked functions.
REVOKE ALL ON public.book_share_invites,public.book_editors FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.book_share_invites,public.book_editors TO authenticated;

CREATE OR REPLACE FUNCTION public.is_book_owner(p_book_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT EXISTS(SELECT 1 FROM public.books WHERE id=p_book_id AND user_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.is_book_owner_or_editor(p_book_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT EXISTS(SELECT 1 FROM public.books b WHERE b.id=p_book_id
        AND (b.user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.book_editors e WHERE e.book_id=b.id AND e.user_id=auth.uid())));
$$;
REVOKE ALL ON FUNCTION public.is_book_owner(text),public.is_book_owner_or_editor(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_book_owner(text),public.is_book_owner_or_editor(text) TO authenticated;

DROP POLICY IF EXISTS book_share_invites_owner ON public.book_share_invites;
CREATE POLICY book_share_invites_owner ON public.book_share_invites FOR SELECT TO authenticated
    USING(owner_id=auth.uid() AND public.is_book_owner(book_id));
DROP POLICY IF EXISTS book_editors_select_member ON public.book_editors;
CREATE POLICY book_editors_select_member ON public.book_editors FOR SELECT TO authenticated
    USING(user_id=auth.uid() OR public.is_book_owner(book_id));
-- No policy on book_editors reads books through RLS: helper functions avoid recursion.
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS books_select_editor ON public.books;
CREATE POLICY books_select_editor ON public.books FOR SELECT TO authenticated
    USING(public.is_book_owner_or_editor(id));
DROP POLICY IF EXISTS books_update_editor ON public.books;
CREATE POLICY books_update_editor ON public.books FOR UPDATE TO authenticated
    USING(public.is_book_owner_or_editor(id)) WITH CHECK(public.is_book_owner_or_editor(id));

CREATE OR REPLACE FUNCTION public.books_keep_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM OLD.user_id THEN
        IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Only the owner can transfer this book.'; END IF;
        IF (to_jsonb(NEW)-ARRAY['title','sections','words','updated','updated_at'])
            IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['title','sections','words','updated','updated_at']) THEN
            RAISE EXCEPTION 'Editors can change manuscript text and titles, not publishing or ownership settings.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.books_keep_owner() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS books_keep_owner ON public.books;
CREATE TRIGGER books_keep_owner BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.books_keep_owner();

CREATE OR REPLACE FUNCTION public.create_book_editor_invite(p_book_id text,p_email text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_email text:=lower(trim(COALESCE(p_email,'')));v_token text;v_expires timestamptz;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to invite an editor.'; END IF;
    PERFORM 1 FROM public.books WHERE id=p_book_id AND user_id=v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only the book owner can invite editors.'; END IF;
    IF length(v_email)>254 OR (v_email<>'' AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN
        RAISE EXCEPTION 'Enter a valid email address or leave it blank.';
    END IF;
    INSERT INTO public.book_share_invites(book_id,owner_id,invited_email)
        VALUES(p_book_id,v_uid,v_email) RETURNING invite_token,expires_at INTO v_token,v_expires;
    RETURN jsonb_build_object('token',v_token,'expires_at',v_expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_book_editor_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_invite public.book_share_invites%ROWTYPE;v_owner uuid;v_email text;v_confirmed timestamptz;v_book text;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to accept this invite.'; END IF;
    IF p_token IS NULL OR p_token !~ '^[a-f0-9]{48,64}$' THEN RAISE EXCEPTION 'This invite link is invalid.'; END IF;
    SELECT book_id INTO v_book FROM public.book_share_invites WHERE invite_token=p_token;
    IF NOT FOUND THEN RAISE EXCEPTION 'This invite is invalid or no longer active.'; END IF;
    -- All membership actions lock the book first, then the invite, in the same order.
    SELECT user_id INTO v_owner FROM public.books WHERE id=v_book FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This book is no longer available.'; END IF;
    SELECT * INTO v_invite FROM public.book_share_invites WHERE invite_token=p_token FOR UPDATE;
    IF v_owner IS DISTINCT FROM v_invite.owner_id THEN RAISE EXCEPTION 'This invite is no longer active.'; END IF;
    IF v_owner=v_uid THEN RAISE EXCEPTION 'You already own this book.'; END IF;
    IF v_invite.status='accepted' AND v_invite.accepted_by=v_uid AND EXISTS(
        SELECT 1 FROM public.book_editors WHERE book_id=v_book AND user_id=v_uid) THEN
        RETURN jsonb_build_object('book_id',v_book);
    END IF;
    IF v_invite.status<>'active' OR v_invite.expires_at<=clock_timestamp() THEN
        RAISE EXCEPTION 'This invite has expired or is no longer active. Ask the owner for a new link.';
    END IF;
    IF v_invite.invited_email<>'' THEN
        SELECT lower(email),email_confirmed_at INTO v_email,v_confirmed FROM auth.users WHERE id=v_uid;
        IF v_confirmed IS NULL OR v_email IS DISTINCT FROM v_invite.invited_email THEN
            RAISE EXCEPTION 'Sign in with the verified email address this invite was created for.';
        END IF;
    END IF;
    INSERT INTO public.book_editors(book_id,user_id,invited_email) VALUES(v_book,v_uid,v_invite.invited_email)
        ON CONFLICT(book_id,user_id) DO NOTHING;
    UPDATE public.book_share_invites SET status='accepted',accepted_by=v_uid WHERE id=v_invite.id;
    RETURN jsonb_build_object('book_id',v_book);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_book_collaborators(p_book_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_owner uuid;v_owner_row jsonb;v_editors jsonb;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to see this book’s collaborators.'; END IF;
    IF NOT public.is_book_owner_or_editor(p_book_id) THEN RAISE EXCEPTION 'You no longer have editor access to this book.'; END IF;
    SELECT user_id INTO v_owner FROM public.books WHERE id=p_book_id;
    SELECT jsonb_build_object('user_id',v_owner,'display_name',COALESCE(NULLIF(u.display_name,''),NULLIF(u.username,''),'Owner'),
        'role','owner','is_you',v_owner=v_uid) INTO v_owner_row
        FROM (SELECT v_owner AS id) owner LEFT JOIN public.users u ON u.id=owner.id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',e.user_id,'display_name',COALESCE(NULLIF(u.display_name,''),NULLIF(u.username,''),'Editor'),
        'role','editor','is_you',e.user_id=v_uid,'accepted_at',e.accepted_at) ORDER BY e.accepted_at),'[]'::jsonb)
        INTO v_editors FROM public.book_editors e LEFT JOIN public.users u ON u.id=e.user_id WHERE e.book_id=p_book_id;
    RETURN jsonb_build_object('owner',v_owner_row,'editors',v_editors,'is_owner',v_owner=v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_book_editor(p_book_id text,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to remove an editor.'; END IF;
    PERFORM 1 FROM public.books WHERE id=p_book_id AND user_id=v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only the book owner can remove editors.'; END IF;
    IF p_user_id IS NULL OR p_user_id=v_uid THEN RAISE EXCEPTION 'The book owner cannot be removed.'; END IF;
    DELETE FROM public.book_editors WHERE book_id=p_book_id AND user_id=p_user_id;
    UPDATE public.book_share_invites SET status='revoked',revoked_at=clock_timestamp()
        WHERE book_id=p_book_id AND accepted_by=p_user_id AND status='accepted';
    RETURN jsonb_build_object('ok',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_editable_books()
RETURNS SETOF public.books LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to load your books.'; END IF;
    RETURN QUERY SELECT b.* FROM public.books b WHERE b.user_id=auth.uid()
        OR EXISTS(SELECT 1 FROM public.book_editors e WHERE e.book_id=b.id AND e.user_id=auth.uid())
        ORDER BY b.updated DESC,b.id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_book_editor_invite(text,text),public.accept_book_editor_invite(text),
    public.list_book_collaborators(text),public.revoke_book_editor(text,uuid),public.list_editable_books() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_book_editor_invite(text,text),public.accept_book_editor_invite(text),
    public.list_book_collaborators(text),public.revoke_book_editor(text,uuid),public.list_editable_books() TO authenticated;

-- Existing cover-upload policies use this checked helper; keep their scope.
DO $$ BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
        INSERT INTO storage.buckets(id,name,public) VALUES('book-covers','book-covers',true) ON CONFLICT(id) DO UPDATE SET public=true;
        DROP POLICY IF EXISTS book_covers_select_public ON storage.objects;
        CREATE POLICY book_covers_select_public ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='book-covers');
        DROP POLICY IF EXISTS book_covers_write_editor ON storage.objects;
        CREATE POLICY book_covers_write_editor ON storage.objects FOR INSERT TO authenticated
            WITH CHECK(bucket_id='book-covers' AND public.is_book_owner_or_editor((storage.foldername(name))[1]));
        DROP POLICY IF EXISTS book_covers_update_editor ON storage.objects;
        CREATE POLICY book_covers_update_editor ON storage.objects FOR UPDATE TO authenticated
            USING(bucket_id='book-covers' AND public.is_book_owner_or_editor((storage.foldername(name))[1]))
            WITH CHECK(bucket_id='book-covers' AND public.is_book_owner_or_editor((storage.foldername(name))[1]));
        DROP POLICY IF EXISTS book_covers_delete_editor ON storage.objects;
        CREATE POLICY book_covers_delete_editor ON storage.objects FOR DELETE TO authenticated
            USING(bucket_id='book-covers' AND public.is_book_owner_or_editor((storage.foldername(name))[1]));
    END IF;
END $$;
COMMIT;
NOTIFY pgrst,'reload schema';

