CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
INSERT INTO auth.users VALUES('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
