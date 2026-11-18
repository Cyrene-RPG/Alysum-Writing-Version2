-- Run after the Moderation Center chain (direct-messages / resolve-conversations as installed).
-- Allows admin permanent single-address IP blocks (expires_at NULL), same shape as permanent account bans.
-- Additive, transactional, safe to rerun. No live SQL is executed by source deployment.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.mc_ip_blocks') IS NULL OR to_regprocedure('public.mc_call(text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Run the Moderation Center SQL first.';
 END IF;
END $$;

ALTER TABLE public.mc_ip_blocks ALTER COLUMN expires_at DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.mc_network_blocked(p_address inet)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.mc_ip_blocks
  WHERE address=p_address AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())
 )
$$;
REVOKE ALL ON FUNCTION public.mc_network_blocked(inet) FROM PUBLIC,anon,authenticated;
-- Edge middleware calls this via the publishable key (PostgREST). Keep anon execute.
GRANT EXECUTE ON FUNCTION public.mc_network_blocked(inet) TO anon,authenticated;

DO $$
DECLARE src text;
BEGIN
 src:=pg_get_functiondef('public.mc_call(text,jsonb)'::regprocedure);
 src:=regexp_replace(src,'^CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 IF position('Permanent IP block added' in src)=0 THEN
  IF position('Network blocks must expire within 1 hour to 7 days.' in src)=0 THEN
   RAISE EXCEPTION 'mc_call does not include the temporary IP block path this patch expects. Re-run the Moderation Center / private-message SQL first.';
  END IF;
  src:=regexp_replace(src,
   'duration:=coalesce\(\(p_payload->>''hours''\)::integer,24\); IF duration NOT BETWEEN 1 AND 168 THEN RAISE EXCEPTION ''Network blocks must expire within 1 hour to 7 days.''; END IF;',
   $q$duration:=coalesce((p_payload->>'hours')::integer,24);
 IF duration<>0 AND duration NOT BETWEEN 1 AND 168 THEN RAISE EXCEPTION 'Choose a temporary duration (1 hour to 7 days) or a permanent block.'; END IF;$q$);
  src:=regexp_replace(src,
   'INSERT INTO public\.mc_ip_blocks\(address,reason,expires_at,created_by\) VALUES\(\(p_payload->>''address''\)::inet,txt,clock_timestamp\(\)\+make_interval\(hours=>duration\),uid\) RETURNING id INTO rid;',
   $q$INSERT INTO public.mc_ip_blocks(address,reason,expires_at,created_by) VALUES((p_payload->>'address')::inet,txt,CASE WHEN duration=0 THEN NULL ELSE clock_timestamp()+make_interval(hours=>duration) END,uid) RETURNING id INTO rid;$q$);
  src:=regexp_replace(src,
   'PERFORM public\.mc_log\(''Temporary IP block added'',rid::text,jsonb_build_object\(''expiresHours'',duration\)\);',
   $q$PERFORM public.mc_log(CASE WHEN duration=0 THEN 'Permanent IP block added' ELSE 'Temporary IP block added' END,rid::text,jsonb_build_object('expiresHours',duration,'permanent',duration=0));$q$);
  IF position('Permanent IP block added' in src)=0
     OR position('Network blocks must expire within 1 hour to 7 days.' in src)>0 THEN
   RAISE EXCEPTION 'Could not patch ip_add for permanent blocks. Re-run the Moderation Center / private-message SQL first.';
  END IF;
  EXECUTE src;
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.mc_call(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mc_call(text,jsonb) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
