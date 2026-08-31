-- Run once in Supabase → SQL Editor (safe to re-run).
-- XP + reputation + writing-XP ledger. Apply after supabase-base-schema.sql.
--
-- Contract: applications/main-site/pages/statistics-spec.html
-- Amounts:  keep in sync with core/statistics/awards.js  (that file is the human
--           source; this migration transcribes it into public.xp_config).
--
-- Writing XP model (this build): every completed sentence is checked by the
-- eligibility pipeline in core/statistics/; a pass grants xp_config.writing_sentence
-- XP as PROVISIONAL for 12h, then finalize_writing_xp_sweep() promotes it and adds
-- the word count to users.writing_durable_words (which drives the 2k/10k milestones).
-- Typed-word day totals stay in users.writing_day_totals and only drive the goal.

-- ===========================================================================
-- 1. Config: XP amounts (transcribed from core/statistics/awards.js AWARDS)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.xp_config (
  key    text PRIMARY KEY,
  amount numeric
);

INSERT INTO public.xp_config (key, amount) VALUES
  ('daily_login', 20),
  ('give_reputation', 3),
  ('chapter_comment', 3),
  ('chapter_comment_daily_cap', 24),
  ('comment_upvote', 3),
  ('comment_upvote_window_hours', 24),
  ('review_upvote_full', 15),
  ('review_upvote_aged', 5),
  ('review_upvote_full_days', 7),
  ('review_upvote_max_paying', 100),
  ('review_create', NULL),
  ('review_vote', NULL),
  ('referral_signup', NULL),
  ('writing_sentence', 2),           -- was null in awards.js; this build turns it on
  ('writing_milestone_2k', 10),
  ('writing_milestone_10k', 100),
  ('writing_milestone_2k_words', 2000),
  ('writing_milestone_10k_words', 10000),
  ('rep_level_lump_per_level', 10),
  ('xp_level_grant_rep', 1)
ON CONFLICT (key) DO UPDATE SET amount = EXCLUDED.amount;

CREATE OR REPLACE FUNCTION public.xp_award(p_key text)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT amount FROM public.xp_config WHERE key = p_key), 0);
$$;

-- ===========================================================================
-- 2. Ledgers
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.xp_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason     text NOT NULL,
  amount     numeric NOT NULL,
  ref        text NOT NULL DEFAULT '',
  kind       text NOT NULL DEFAULT 'grant' CHECK (kind IN ('grant', 'reversal')),
  reverses   uuid REFERENCES public.xp_events (id),
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS xp_events_idem_idx
  ON public.xp_events (user_id, reason, ref)
  WHERE kind = 'grant' AND ref <> '';
CREATE INDEX IF NOT EXISTS xp_events_user_created_idx
  ON public.xp_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS xp_events_user_reason_idx
  ON public.xp_events (user_id, reason);

CREATE TABLE IF NOT EXISTS public.reputation_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giver_id    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  receiver_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount      int NOT NULL CHECK (amount BETWEEN 1 AND 6),
  note        text NOT NULL DEFAULT '',
  target_type text NOT NULL,
  target_id   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reputation_events_once_idx
  ON public.reputation_events (giver_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS reputation_events_receiver_idx
  ON public.reputation_events (receiver_id, created_at DESC);

-- ===========================================================================
-- 3. Writing XP: per-sentence rows + war seal guard + grammar-check cache
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.writing_sentences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sentence_hash     text NOT NULL,
  text              text NOT NULL DEFAULT '',
  word_count        int NOT NULL DEFAULT 0,
  source            text NOT NULL DEFAULT 'solo' CHECK (source IN ('solo', 'word_wars')),
  room_id           text,
  chapter_id        text,
  state             text NOT NULL DEFAULT 'provisional' CHECK (state IN ('provisional', 'final', 'revoked')),
  xp_event_id       uuid REFERENCES public.xp_events (id),
  provisional_until timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS writing_sentences_once_idx
  ON public.writing_sentences (user_id, sentence_hash);
CREATE INDEX IF NOT EXISTS writing_sentences_sweep_idx
  ON public.writing_sentences (state, provisional_until);

CREATE TABLE IF NOT EXISTS public.war_seals (
  user_id   uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  room_id   text NOT NULL,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

-- Written by the LanguageTool proxy endpoint so grant_sentence_xp can trust a
-- 'needs_grammar' verdict. Short-lived; a nightly prune is enough (not built).
CREATE TABLE IF NOT EXISTS public.sentence_grammar (
  user_id       uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sentence_hash text NOT NULL,
  verdict       text NOT NULL,          -- 'pass' | 'reject' | 'needs_ai'
  checked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sentence_hash)
);

-- ===========================================================================
-- 4. Denormalized totals on public.users
-- ===========================================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS xp bigint NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reputation bigint NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS writing_durable_words bigint NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS xp_level int NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS border_unlock_max int NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS worn_border int NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS rep_color_unlock int NOT NULL DEFAULT 0;

-- ===========================================================================
-- 5. Level math (mirrors core/statistics/xp-levels.js + rep-levels.js)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public._xp_level_for(p_xp bigint)
RETURNS int
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  -- XP_THRESHOLDS, indices 1..31 == levels 0..30
  v_t bigint[] := ARRAY[
    0,
    100, 250, 600, 1300, 2700,
    4300, 6300, 8700, 12000, 16300,
    21000, 26200, 31900, 38100, 44900,
    52200, 60000, 68800, 79200, 91800,
    104200, 119100, 135500, 153500, 173000,
    194000, 217000, 245000, 275000, 308000
  ];
  v_level int := 0;
  i int;
BEGIN
  FOR i IN 2..31 LOOP
    IF p_xp >= v_t[i] THEN v_level := i - 1; ELSE EXIT; END IF;
  END LOOP;
  RETURN v_level;
END;
$$;

CREATE OR REPLACE FUNCTION public._rep_level_for(p_rep bigint)
RETURNS int
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_level int := 0;
  n int;
BEGIN
  FOR n IN 1..50 LOOP
    IF p_rep >= round(6.076 * n * n) THEN v_level := n; ELSE EXIT; END IF;
  END LOOP;
  RETURN v_level;
END;
$$;

-- ===========================================================================
-- 6. _apply_xp — the only writer of xp_events grants. Not client-callable.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public._apply_xp(
  p_user   uuid,
  p_reason text,
  p_ref    text,
  p_amount numeric,
  p_meta   jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id       uuid;
  v_old_xp   bigint;
  v_new_xp   bigint;
  v_old_lvl  int;
  v_new_lvl  int;
  v_lump     numeric;
  n          int;
BEGIN
  IF p_user IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.xp_events (user_id, reason, amount, ref, kind, meta)
  VALUES (p_user, p_reason, p_amount, COALESCE(p_ref, ''), 'grant', COALESCE(p_meta, '{}'::jsonb))
  ON CONFLICT (user_id, reason, ref) WHERE kind = 'grant' AND ref <> ''
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- already granted (idempotent) — return the existing row
    SELECT id INTO v_id FROM public.xp_events
      WHERE user_id = p_user AND reason = p_reason AND ref = COALESCE(p_ref, '')
        AND kind = 'grant'
      LIMIT 1;
    RETURN v_id;
  END IF;

  SELECT xp, xp_level INTO v_old_xp, v_old_lvl FROM public.users WHERE id = p_user FOR UPDATE;
  v_new_xp := COALESCE(v_old_xp, 0) + p_amount;
  v_new_lvl := public._xp_level_for(v_new_xp);

  UPDATE public.users
     SET xp = v_new_xp,
         xp_level = v_new_lvl,
         border_unlock_max = GREATEST(border_unlock_max, v_new_lvl),
         updated_at = now()
   WHERE id = p_user;

  -- +1 rep the first time each XP level is reached (spec §3)
  IF v_new_lvl > COALESCE(v_old_lvl, 0) THEN
    FOR n IN (COALESCE(v_old_lvl, 0) + 1)..v_new_lvl LOOP
      PERFORM public._apply_rep(p_user, NULL, public.xp_award('xp_level_grant_rep')::int,
                                '', 'xp_level', n::text, ('xp_level:' || n));
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;

-- Internal rep applier (used by xp-level grants above and give_reputation later)
CREATE OR REPLACE FUNCTION public._apply_rep(
  p_receiver    uuid,
  p_giver       uuid,
  p_amount      int,
  p_note        text,
  p_target_type text,
  p_target_id   text,
  p_ref         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old_rep bigint;
  v_new_rep bigint;
  v_old_lvl int;
  v_new_lvl int;
  n int;
BEGIN
  IF p_receiver IS NULL OR COALESCE(p_amount, 0) = 0 THEN RETURN; END IF;

  -- idempotency: real gives keyed by (giver, target); system grants (giver NULL)
  -- keyed by (target_type, target_id) since a NULL giver never repeats a level.
  IF p_giver IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.reputation_events
      WHERE giver_id IS NULL AND target_type = p_target_type AND target_id = p_target_id
    ) THEN RETURN; END IF;
    INSERT INTO public.reputation_events (giver_id, receiver_id, amount, note, target_type, target_id)
    VALUES (NULL, p_receiver, GREATEST(1, LEAST(6, p_amount)), COALESCE(p_note, ''), p_target_type, p_target_id);
  ELSE
    INSERT INTO public.reputation_events (giver_id, receiver_id, amount, note, target_type, target_id)
    VALUES (p_giver, p_receiver, GREATEST(1, LEAST(6, p_amount)), COALESCE(p_note, ''), p_target_type, p_target_id)
    ON CONFLICT (giver_id, target_type, target_id) DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;
  END IF;

  SELECT reputation, _rep_level_for(reputation) INTO v_old_rep, v_old_lvl
    FROM public.users WHERE id = p_receiver FOR UPDATE;
  v_new_rep := COALESCE(v_old_rep, 0) + p_amount;
  v_new_lvl := public._rep_level_for(v_new_rep);

  UPDATE public.users
     SET reputation = v_new_rep,
         rep_color_unlock = GREATEST(rep_color_unlock, ((GREATEST(v_new_lvl, 1) - 1) / 5) + 1),
         updated_at = now()
   WHERE id = p_receiver;

  -- rep-level lump XP to the receiver, once per level (spec §2)
  IF v_new_lvl > COALESCE(v_old_lvl, 0) THEN
    FOR n IN (COALESCE(v_old_lvl, 0) + 1)..v_new_lvl LOOP
      PERFORM public._apply_xp(p_receiver, 'rep_level_lump', ('rep_level:' || n),
                               n * public.xp_award('rep_level_lump_per_level'),
                               jsonb_build_object('rep_level', n));
    END LOOP;
  END IF;
END;
$$;

-- ===========================================================================
-- 7. reverse_xp_for_ref — append a negative row, never edit history
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.reverse_xp_for_ref(p_reason text, p_ref text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row  public.xp_events%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.xp_events
    WHERE user_id = v_user AND reason = p_reason AND ref = p_ref AND kind = 'grant'
    LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.xp_events WHERE reverses = v_row.id) THEN
    RETURN;  -- already reversed
  END IF;

  INSERT INTO public.xp_events (user_id, reason, amount, ref, kind, reverses, meta)
  VALUES (v_user, p_reason, -v_row.amount, p_ref, 'reversal', v_row.id, '{}'::jsonb);

  UPDATE public.users
     SET xp = xp - v_row.amount,
         xp_level = public._xp_level_for(xp - v_row.amount),
         updated_at = now()
   WHERE id = v_user;
END;
$$;

-- ===========================================================================
-- 8. Sentence structural re-check (cheap port of evaluateLayers01)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public._sentence_structural_ok(p_text text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_text  text := regexp_replace(trim(coalesce(p_text, '')), '\s+', ' ', 'g');
  v_dlg   boolean := left(v_text, 1) IN ('"', chr(8220), '''', chr(8216));
  v_core  text;
  v_words text[];
  v_toks  text[];
  v_uniq  int;
BEGIN
  IF v_text = '' THEN RETURN false; END IF;
  -- last char (after stripping trailing closing quotes) must be a terminal mark
  v_core := regexp_replace(v_text, '(["''' || chr(8221) || chr(8217) || chr(187) || '])+$', '');
  IF right(v_core, 1) NOT IN ('.', '!', '?') THEN RETURN false; END IF;
  v_words := regexp_split_to_array(lower(v_text), '[^a-z0-9'']+');
  v_toks  := ARRAY(SELECT w FROM unnest(v_words) w WHERE w <> '');
  IF cardinality(v_toks) < (CASE WHEN v_dlg THEN 1 ELSE 3 END) THEN RETURN false; END IF;
  SELECT count(DISTINCT w) INTO v_uniq FROM unnest(v_toks) w;
  IF cardinality(v_toks) > 0 AND (v_uniq::numeric / cardinality(v_toks)) < 0.4 THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

-- ===========================================================================
-- 9. grant_sentence_xp — client calls after running the pipeline
-- ===========================================================================
-- p_sentences: [{ hash, text, wordCount, source, roomId, chapterId, verdict }]
--   verdict 'pass'          → structural re-check then grant
--   verdict 'needs_grammar' → structural re-check + a passing sentence_grammar row
CREATE OR REPLACE FUNCTION public.grant_sentence_xp(p_sentences jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_amount  numeric := public.xp_award('writing_sentence');
  v_item    jsonb;
  v_hash    text;
  v_text    text;
  v_wc      int;
  v_source  text;
  v_room    text;
  v_chapter text;
  v_verdict text;
  v_ev      uuid;
  v_granted text[] := ARRAY[]::text[];
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF jsonb_typeof(p_sentences) <> 'array' THEN
    RETURN jsonb_build_object('granted', '[]'::jsonb, 'xp', 0, 'level', 0);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_sentences) AS t(value) LOOP
    v_hash    := v_item->>'hash';
    v_text    := v_item->>'text';
    v_wc      := GREATEST(0, COALESCE((v_item->>'wordCount')::int, 0));
    v_source  := CASE WHEN (v_item->>'source') = 'word_wars' THEN 'word_wars' ELSE 'solo' END;
    v_room    := NULLIF(v_item->>'roomId', '');
    v_chapter := NULLIF(v_item->>'chapterId', '');
    v_verdict := COALESCE(v_item->>'verdict', 'pass');

    CONTINUE WHEN v_hash IS NULL OR v_hash = '' OR v_text IS NULL;
    CONTINUE WHEN NOT public._sentence_structural_ok(v_text);
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.writing_sentences
      WHERE user_id = v_user AND sentence_hash = v_hash
    );

    IF v_verdict = 'needs_grammar' THEN
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM public.sentence_grammar
        WHERE user_id = v_user AND sentence_hash = v_hash
          AND verdict = 'pass' AND checked_at > now() - interval '1 day'
      );
    ELSIF v_verdict <> 'pass' THEN
      CONTINUE;
    END IF;

    v_ev := public._apply_xp(v_user, 'writing_sentence', ('sent:' || v_hash),
                             v_amount, jsonb_build_object('source', v_source, 'words', v_wc));

    INSERT INTO public.writing_sentences
      (user_id, sentence_hash, text, word_count, source, room_id, chapter_id,
       state, xp_event_id, provisional_until)
    VALUES
      (v_user, v_hash, left(v_text, 2000), v_wc, v_source, v_room, v_chapter,
       'provisional', v_ev, now() + interval '12 hours')
    ON CONFLICT (user_id, sentence_hash) DO NOTHING;

    v_granted := array_append(v_granted, v_hash);
  END LOOP;

  RETURN jsonb_build_object(
    'granted', to_jsonb(v_granted),
    'xp', (SELECT xp FROM public.users WHERE id = v_user),
    'level', (SELECT xp_level FROM public.users WHERE id = v_user)
  );
END;
$$;

-- ===========================================================================
-- 10. revoke_sentences — sentence deleted / rewritten inside 12h
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.revoke_sentences(p_hashes text[])
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_hash text;
  v_n    int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_hashes IS NULL THEN RETURN 0; END IF;

  FOREACH v_hash IN ARRAY p_hashes LOOP
    IF EXISTS (
      SELECT 1 FROM public.writing_sentences
      WHERE user_id = v_user AND sentence_hash = v_hash AND state = 'provisional'
    ) THEN
      PERFORM public.reverse_xp_for_ref('writing_sentence', ('sent:' || v_hash));
      UPDATE public.writing_sentences
         SET state = 'revoked'
       WHERE user_id = v_user AND sentence_hash = v_hash AND state = 'provisional';
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ===========================================================================
-- 11. finalize_writing_xp_sweep — provisional → final + durable milestones
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.finalize_writing_xp_sweep()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_words bigint := 0;
  v_old   bigint;
  v_new   bigint;
  v_step2 bigint := public.xp_award('writing_milestone_2k_words');
  v_step10 bigint := public.xp_award('writing_milestone_10k_words');
  n int;
  v_promoted int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(sum(word_count), 0), count(*)
    INTO v_words, v_promoted
    FROM public.writing_sentences
   WHERE user_id = v_user AND state = 'provisional' AND provisional_until <= now();

  IF v_promoted = 0 THEN RETURN 0; END IF;

  UPDATE public.writing_sentences
     SET state = 'final'
   WHERE user_id = v_user AND state = 'provisional' AND provisional_until <= now();

  SELECT writing_durable_words INTO v_old FROM public.users WHERE id = v_user FOR UPDATE;
  v_new := COALESCE(v_old, 0) + v_words;
  UPDATE public.users SET writing_durable_words = v_new, updated_at = now() WHERE id = v_user;

  FOR n IN (floor(COALESCE(v_old, 0) / v_step2)::int + 1)..(floor(v_new / v_step2)::int) LOOP
    PERFORM public._apply_xp(v_user, 'writing_milestone_2k', ('durable_2k:' || n),
                             public.xp_award('writing_milestone_2k'), jsonb_build_object('step', n));
  END LOOP;
  FOR n IN (floor(COALESCE(v_old, 0) / v_step10)::int + 1)..(floor(v_new / v_step10)::int) LOOP
    PERFORM public._apply_xp(v_user, 'writing_milestone_10k', ('durable_10k:' || n),
                             public.xp_award('writing_milestone_10k'), jsonb_build_object('step', n));
  END LOOP;

  RETURN v_promoted;
END;
$$;

-- ===========================================================================
-- 12. claim_daily_login_xp — 20 XP once per UTC day
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.claim_daily_login_xp()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ref  text := to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD');
  v_new  boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.xp_events
    WHERE user_id = v_user AND reason = 'daily_login' AND ref = v_ref AND kind = 'grant'
  ) THEN
    PERFORM public._apply_xp(v_user, 'daily_login', v_ref, public.xp_award('daily_login'), '{}'::jsonb);
    v_new := true;
  END IF;

  RETURN jsonb_build_object(
    'granted', v_new,
    'xp', (SELECT xp FROM public.users WHERE id = v_user),
    'level', (SELECT xp_level FROM public.users WHERE id = v_user)
  );
END;
$$;

-- ===========================================================================
-- 13. set_day_words — the goal counter (not XP). Monotonic per day.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.set_day_words(p_day text, p_words int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cur  jsonb;
  v_have int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_day !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Bad day key'; END IF;

  SELECT COALESCE(writing_day_totals, '{}'::jsonb) INTO v_cur FROM public.users WHERE id = v_user FOR UPDATE;
  v_cur := v_cur - '__manuscript';  -- drop the retired sub-bucket if still present
  v_have := COALESCE((v_cur->>p_day)::int, 0);

  UPDATE public.users
     SET writing_day_totals = v_cur || jsonb_build_object(p_day, GREATEST(v_have, GREATEST(0, COALESCE(p_words, 0)))),
         updated_at = now()
   WHERE id = v_user;

  RETURN (SELECT writing_day_totals FROM public.users WHERE id = v_user);
END;
$$;

-- ===========================================================================
-- 14. set_worn_border — cosmetic; only an unlocked level
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.set_worn_border(p_level int)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_max  int;
  v_want int := GREATEST(0, COALESCE(p_level, 0));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT border_unlock_max INTO v_max FROM public.users WHERE id = v_user;
  IF v_want > COALESCE(v_max, 0) THEN RAISE EXCEPTION 'Border not unlocked'; END IF;
  UPDATE public.users SET worn_border = v_want, updated_at = now() WHERE id = v_user;
  RETURN v_want;
END;
$$;

-- ===========================================================================
-- 15. One-time: flatten writing_day_totals (drop the __manuscript sub-bucket)
-- ===========================================================================
UPDATE public.users u
SET writing_day_totals = (
  SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
  FROM (
    SELECT key AS k, max(value::text::int) AS v
    FROM (
      SELECT key, value FROM jsonb_each(u.writing_day_totals) WHERE key ~ '^\d{4}-\d{2}-\d{2}$'
      UNION ALL
      SELECT key, value FROM jsonb_each(COALESCE(u.writing_day_totals->'__manuscript', '{}'::jsonb))
        WHERE key ~ '^\d{4}-\d{2}-\d{2}$'
    ) merged
    WHERE value::text ~ '^\d+$'
    GROUP BY key
  ) g
)
WHERE u.writing_day_totals ? '__manuscript';

-- Backfill denormalized levels for anyone with existing xp/reputation (0 for all today)
UPDATE public.users
   SET xp_level = public._xp_level_for(xp),
       border_unlock_max = GREATEST(border_unlock_max, public._xp_level_for(xp)),
       rep_color_unlock = GREATEST(rep_color_unlock, CASE WHEN reputation > 0
         THEN ((GREATEST(public._rep_level_for(reputation), 1) - 1) / 5) + 1 ELSE 0 END)
 WHERE xp > 0 OR reputation > 0;

-- ===========================================================================
-- 16. RLS + grants
-- ===========================================================================
ALTER TABLE public.xp_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writing_sentences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.war_seals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentence_grammar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_config        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS xp_events_select_own ON public.xp_events;
CREATE POLICY xp_events_select_own ON public.xp_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS reputation_events_select_own ON public.reputation_events;
CREATE POLICY reputation_events_select_own ON public.reputation_events
  FOR SELECT TO authenticated USING (receiver_id = auth.uid() OR giver_id = auth.uid());

DROP POLICY IF EXISTS writing_sentences_select_own ON public.writing_sentences;
CREATE POLICY writing_sentences_select_own ON public.writing_sentences
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS war_seals_select_own ON public.war_seals;
CREATE POLICY war_seals_select_own ON public.war_seals
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS xp_config_read ON public.xp_config;
CREATE POLICY xp_config_read ON public.xp_config
  FOR SELECT TO anon, authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies on the ledgers: writes are RPC-only.
GRANT SELECT ON public.xp_events, public.reputation_events, public.writing_sentences,
               public.war_seals, public.xp_config TO authenticated;
GRANT SELECT ON public.xp_config TO anon;

REVOKE ALL ON FUNCTION public._apply_xp(uuid, text, text, numeric, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._apply_rep(uuid, uuid, int, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._sentence_structural_ok(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._xp_level_for(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rep_level_for(bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.xp_award(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.xp_award(text) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_xp_for_ref(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_xp_for_ref(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.grant_sentence_xp(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_sentence_xp(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_sentences(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_sentences(text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_writing_xp_sweep() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_writing_xp_sweep() TO authenticated;

REVOKE ALL ON FUNCTION public.claim_daily_login_xp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_login_xp() TO authenticated;

REVOKE ALL ON FUNCTION public.set_day_words(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_day_words(text, int) TO authenticated;

REVOKE ALL ON FUNCTION public.set_worn_border(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_worn_border(int) TO authenticated;
