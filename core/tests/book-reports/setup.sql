\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
CREATE TABLE public.users(id uuid PRIMARY KEY,username text,display_name text);
CREATE TABLE public.moderation_staff(user_id uuid PRIMARY KEY REFERENCES auth.users(id),role text NOT NULL);
REVOKE ALL ON public.moderation_staff FROM PUBLIC,anon,authenticated;
CREATE TABLE public.library(id text PRIMARY KEY,data jsonb);
CREATE TABLE public.unrelated_data(id text PRIMARY KEY);
INSERT INTO public.unrelated_data VALUES('preserve-me');
CREATE FUNCTION public.get_published_book(p_book_id text) RETURNS TABLE(id text,user_id uuid,data jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT l.id,NULL::uuid,l.data FROM public.library l WHERE l.id=p_book_id AND coalesce(l.data->>'isPublished','true')='true' AND coalesce(l.data->>'hidden','false')='false'
$$;
INSERT INTO auth.users SELECT ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,6)i;
INSERT INTO public.users SELECT id,'sample-'||right(id::text,1),'Sample '||right(id::text,1) FROM auth.users;
INSERT INTO public.moderation_staff VALUES('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','moderator');
INSERT INTO public.library SELECT 'book-'||i,jsonb_build_object('title','Book '||i,'author','Sample Author','chapters',jsonb_build_array(jsonb_build_object('id','chapter-one','title','One'))) FROM generate_series(1,30)i;
INSERT INTO public.library VALUES('hidden','{"hidden":true}'),('draft','{"isPublished":false}');
CREATE FUNCTION public.report_test_assert(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',message; END IF; END $$;
CREATE FUNCTION public.report_expect_error(query text,pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN IF SQLERRM ~ pattern THEN RETURN; ELSE RAISE; END IF; END;
 RAISE EXCEPTION 'Expected error matching % from %',pattern,query;
END $$;
