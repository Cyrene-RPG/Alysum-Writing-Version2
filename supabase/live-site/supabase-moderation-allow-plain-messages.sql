-- Removes the official-message placeholder gate that can reject ordinary staff
-- notes such as "Thank you in advance!". Safe to rerun. No tables change.
DO $$
DECLARE src text;
BEGIN
 IF to_regprocedure('public.mc_call(text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Run the Moderation Center SQL first.';
 END IF;
 src:=pg_get_functiondef('public.mc_call(text,jsonb)'::regprocedure);
 src:=regexp_replace(src,'^CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 src:=regexp_replace(src,'IF txt ~ ''[^'']+'' THEN RAISE EXCEPTION ''Replace message template placeholders before sending\.''; END IF;','','g');
 EXECUTE src;
END $$;
NOTIFY pgrst,'reload schema';
