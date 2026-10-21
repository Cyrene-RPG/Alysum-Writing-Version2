-- Fixture only. Never run against the live site.
DO $$ BEGIN IF current_database()<>'audiobook_test' THEN RAISE EXCEPTION 'Disposable audiobook_test required'; END IF; END $$;
CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
CREATE TABLE public.books(id text PRIMARY KEY,user_id uuid REFERENCES auth.users(id),title text);
INSERT INTO auth.users VALUES('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
INSERT INTO public.books VALUES('written','10000000-0000-0000-0000-000000000001','Written book'),('other','10000000-0000-0000-0000-000000000002','Other book');
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;
CREATE FUNCTION public.assert_audio(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',message; END IF;
END $$;
