-- DISPOSABLE DATABASE ONLY. Never run this on the live Supabase project.
DO $$ BEGIN
    IF current_database() <> 'notifications_test' THEN
        RAISE EXCEPTION 'This test requires the disposable notifications_test database.';
    END IF;
END $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE TABLE public.users(
    id uuid PRIMARY KEY REFERENCES auth.users(id),
    username text, display_name text, account_type text
);
CREATE TABLE public.library(id text PRIMARY KEY, user_id uuid REFERENCES auth.users(id), data jsonb);
CREATE TABLE public.library_book_moderation(book_id text PRIMARY KEY, visibility text);
CREATE TABLE public.moderation_staff(user_id uuid PRIMARY KEY REFERENCES auth.users(id), role text);
CREATE TABLE public.notifications(
    id text PRIMARY KEY, user_id uuid REFERENCES auth.users(id),
    read boolean DEFAULT false, data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_notifications_own ON public.notifications FOR ALL TO authenticated
    USING(user_id = auth.uid()) WITH CHECK(user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
CREATE PUBLICATION supabase_realtime;
INSERT INTO auth.users(id) SELECT ('10000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(1,6) n;
INSERT INTO public.users(id,username,display_name,account_type)
    SELECT id, CASE WHEN right(id::text,1)='3' THEN 'ReaderOne' ELSE 'User' END,
        CASE WHEN right(id::text,1)='3' THEN 'Reader <One>' ELSE 'Public name' END,
        CASE WHEN right(id::text,1) IN ('1','2','6') THEN 'author' ELSE 'reader' END FROM auth.users;
INSERT INTO public.moderation_staff VALUES ('10000000-0000-0000-0000-000000000001','admin');
INSERT INTO public.notifications(id,user_id,data)
    VALUES ('legacy-beta-message','10000000-0000-0000-0000-000000000002','{"kind":"beta-share"}');

CREATE FUNCTION public.test_inbox_assert(p_ok boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', p_message; END IF;
END;
$$;
