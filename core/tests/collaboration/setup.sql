-- DISPOSABLE collaboration_test database only.
DO $$ BEGIN IF current_database()<>'collaboration_test' THEN RAISE EXCEPTION 'Disposable collaboration_test required'; END IF; END $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon,authenticated;
GRANT SELECT ON storage.objects TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
CREATE TABLE public.users(id uuid PRIMARY KEY,username text,display_name text,email text);
CREATE TABLE public.books(
 id text PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),title text NOT NULL DEFAULT 'Book',
 created bigint DEFAULT 1,updated bigint DEFAULT 1,words int DEFAULT 0,sections jsonb DEFAULT '{}',
 is_published boolean DEFAULT false,library_type text,media_format text DEFAULT 'novel',
 published_chapter_ids jsonb DEFAULT '[]',publish_meta jsonb DEFAULT '{}',draft_parent_id text,draft_label text
);
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY books_select_own ON public.books FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY books_update_own ON public.books FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY books_insert_own ON public.books FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY books_delete_own ON public.books FOR DELETE TO authenticated USING(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.books TO authenticated;
INSERT INTO auth.users SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
    CASE n WHEN 2 THEN 'invited@example.test' ELSE 'user'||n||'@example.test' END,
    CASE n WHEN 2 THEN NULL ELSE now() END FROM generate_series(1,5)n;
INSERT INTO public.users SELECT id,'user'||right(id::text,1),'User '||right(id::text,1),email FROM auth.users;
INSERT INTO public.books(id,user_id,title,sections) VALUES
 ('shared','10000000-0000-0000-0000-000000000001','Original manuscript','{"body":[{"id":"one","content":"Original text"}]}'),
 ('private','10000000-0000-0000-0000-000000000003','Private manuscript','{}');
CREATE TABLE public.book_editors(book_id text,user_id uuid REFERENCES auth.users(id),invited_email text DEFAULT '',accepted_at timestamptz DEFAULT now(),PRIMARY KEY(book_id,user_id));
INSERT INTO public.book_editors VALUES('shared','10000000-0000-0000-0000-000000000004','',now());
CREATE TABLE public.book_share_invites(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),book_id text,owner_id uuid REFERENCES auth.users(id),invited_email text DEFAULT '',
 invite_token text UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),status text DEFAULT 'active',created_at timestamptz DEFAULT now(),revoked_at timestamptz);
-- Legacy forged invite must not become usable after the fix.
INSERT INTO public.book_share_invites(book_id,owner_id,invite_token) VALUES
 ('shared','10000000-0000-0000-0000-000000000003',repeat('f',48));
CREATE FUNCTION public.assert_collaboration(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',message; END IF; END $$;

