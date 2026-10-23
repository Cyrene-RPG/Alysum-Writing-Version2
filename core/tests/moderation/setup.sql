\set ON_ERROR_STOP on
\ir ../book-reports/setup.sql
ALTER TABLE auth.users ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon,authenticated;
INSERT INTO auth.sessions SELECT ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,now() FROM generate_series(1,6)i;
ALTER TABLE public.library ADD COLUMN user_id uuid REFERENCES auth.users(id);
UPDATE public.library SET user_id='00000000-0000-0000-0000-000000000003';
UPDATE public.library SET user_id='00000000-0000-0000-0000-000000000001' WHERE id='book-3';
CREATE FUNCTION public.library_catalog_rows() RETURNS TABLE(id text,user_id uuid,data jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT id,user_id,data FROM public.library $$;
CREATE VIEW public.library_catalog WITH(security_invoker=true) AS SELECT * FROM public.library_catalog_rows();
CREATE TABLE public.books(id text PRIMARY KEY,user_id uuid REFERENCES auth.users(id),data jsonb NOT NULL DEFAULT '{}');
CREATE TABLE public.comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),text text);
CREATE TABLE public.announcements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),author_id uuid REFERENCES auth.users(id),status text NOT NULL DEFAULT 'draft',body text);
CREATE TABLE public.inbox_notifications(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,recipient_id uuid REFERENCES auth.users(id),kind text NOT NULL CHECK(kind IN ('follower')),title text,message text,source_key text,created_at timestamptz DEFAULT now(),read_at timestamptz,UNIQUE(recipient_id,source_key));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.books,public.comments,public.announcements TO authenticated;
GRANT SELECT ON public.library_catalog TO anon,authenticated;
\ir ../../../supabase/live-site/supabase-book-reports-v2.sql
