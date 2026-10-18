-- Word Wars race mode. Run in Supabase → SQL Editor. Safe to re-run.
--
-- Adds new tables and functions only. The old word_wars_* tables and RPCs are
-- not touched; they can be dropped later once nothing uses them.
--
-- What the server enforces:
--   • First racer to target_words wins. Places follow finished_at.
--   • A racer's count can rise at most 150 words a minute, measured from the
--     start (a pause can bank up to 20 words for a quick burst after it).
--   • Once the first racer finishes, everyone else has 2 minutes.
--   • A race ends after 2 hours no matter what. A lobby nobody starts within
--     6 hours is dropped.
--   • A racer's writing is stored only while their page is public, as plain
--     text (word_war_pages). Spectators can watch it during the race; other
--     racers can read it once the race is over. Going private deletes it.
--   • The host can set a prompt, or leave it blank for free write. Racers can
--     ask for a different one while the lobby is open. Hosts pick from the
--     prompt collection (word_war_prompts) or write their own.
--
-- Race status is worked out from timestamps (word_war_race_status). Reading a
-- race never rewrites it.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.word_war_races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  host_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_words integer NOT NULL DEFAULT 250 CHECK (target_words IN (100, 250, 500, 1000)),
  is_public boolean NOT NULL DEFAULT true,
  max_racers integer NOT NULL DEFAULT 10 CHECK (max_racers BETWEEN 2 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  starts_at timestamptz,
  first_finish_at timestamptz,
  ended_at timestamptz,
  cancelled boolean NOT NULL DEFAULT false,
  rematch_id uuid REFERENCES public.word_war_races (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.word_war_racers (
  race_id uuid NOT NULL REFERENCES public.word_war_races (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Writer',
  avatar_url text,
  book_id text,
  book_title text NOT NULL DEFAULT 'Untitled',
  words integer NOT NULL DEFAULT 0 CHECK (words >= 0),
  start_words integer,
  speed_budget real NOT NULL DEFAULT 0,
  peak_wpm integer NOT NULL DEFAULT 0,
  cheers integer NOT NULL DEFAULT 0,
  finished_at timestamptz,
  reported_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (race_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.word_war_spectators (
  race_id uuid NOT NULL REFERENCES public.word_war_races (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_cheer_at timestamptz,
  PRIMARY KEY (race_id, user_id)
);

-- Prompts and shared pages. Added after the first release, so they are
-- written as ALTERs that also work on tables that already exist.
ALTER TABLE public.word_war_races ADD COLUMN IF NOT EXISTS prompt text;
ALTER TABLE public.word_war_races DROP CONSTRAINT IF EXISTS word_war_races_prompt_check;
ALTER TABLE public.word_war_races
  ADD CONSTRAINT word_war_races_prompt_check
  CHECK (prompt IS NULL OR char_length(prompt) BETWEEN 1 AND 1000);
ALTER TABLE public.word_war_racers ADD COLUMN IF NOT EXISTS is_page_public boolean NOT NULL DEFAULT true;
ALTER TABLE public.word_war_racers ADD COLUMN IF NOT EXISTS wants_new_prompt boolean NOT NULL DEFAULT false;
ALTER TABLE public.word_war_racers ADD COLUMN IF NOT EXISTS page_chapter_id text;

-- A racer's page while it is public: plain text of the chapter they are
-- writing in. Deleted as soon as they make it private.
CREATE TABLE IF NOT EXISTS public.word_war_pages (
  race_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (race_id, user_id),
  FOREIGN KEY (race_id, user_id) REFERENCES public.word_war_racers (race_id, user_id) ON DELETE CASCADE
);

-- The prompt collection hosts pick from. To add a prompt, add a row (Supabase
-- → Table editor → word_war_prompts). To retire one, set is_active to false.
-- Races keep their own copy of the text, so edits never change past races.
CREATE TABLE IF NOT EXISTS public.word_war_prompts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS word_war_prompts_body_key ON public.word_war_prompts (md5(body));

CREATE INDEX IF NOT EXISTS word_war_racers_user_idx
  ON public.word_war_racers (user_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS word_war_races_open_idx
  ON public.word_war_races (created_at DESC)
  WHERE NOT cancelled AND ended_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Helpers (internal ones are revoked from clients in section 5)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gen_word_war_race_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
BEGIN
  FOR i IN 1..6 LOOP
    v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
  END LOOP;
  RETURN v_code;
END;
$$;

-- lobby → countdown → running → finished, or cancelled. Mirrored in
-- core/community/word-war-race.js (raceStatus); keep the two in step.
CREATE OR REPLACE FUNCTION public.word_war_race_status(p_race public.word_war_races)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_race.cancelled THEN 'cancelled'
    WHEN p_race.starts_at IS NULL AND p_race.created_at < now() - interval '6 hours' THEN 'cancelled'
    WHEN p_race.starts_at IS NULL THEN 'lobby'
    WHEN now() < p_race.starts_at THEN 'countdown'
    WHEN p_race.ended_at IS NOT NULL THEN 'finished'
    WHEN p_race.first_finish_at IS NOT NULL
      AND now() >= p_race.first_finish_at + interval '2 minutes' THEN 'finished'
    WHEN now() >= p_race.starts_at + interval '2 hours' THEN 'finished'
    ELSE 'running'
  END;
$$;

CREATE OR REPLACE FUNCTION public.word_war_race_me()
RETURNS TABLE (display_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(nullif(trim(u.display_name), ''), nullif(trim(u.username), ''), 'Writer'),
    nullif(trim(u.profile_image_url), '')
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.word_war_race_book_title(p_book_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(trim(b.title), ''), 'Untitled')
  FROM public.books b
  WHERE b.id::text = nullif(trim(coalesce(p_book_id, '')), '')
    AND b.user_id = auth.uid()
  LIMIT 1;
$$;

-- Public races are visible to every signed-in user. Private ones only to their
-- racers and to people who opened them with the code.
CREATE OR REPLACE FUNCTION public.can_see_word_war_race(p_race_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.word_war_races r WHERE r.id = p_race_id AND r.is_public)
    OR EXISTS (
      SELECT 1 FROM public.word_war_racers x
      WHERE x.race_id = p_race_id AND x.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.word_war_spectators s
      WHERE s.race_id = p_race_id AND s.user_id = auth.uid()
    )
  );
$$;

-- A racer's page: always readable by its owner. Others can read it only while
-- it is public, and during the race only if they are not racing themselves
-- (spectators watch live; racers read each other's work after the race).
CREATE OR REPLACE FUNCTION public.can_read_word_war_page(p_race_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    p_user_id = auth.uid()
    OR (
      public.can_see_word_war_race(p_race_id)
      AND EXISTS (
        SELECT 1 FROM public.word_war_racers x
        WHERE x.race_id = p_race_id AND x.user_id = p_user_id AND x.is_page_public
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.word_war_races r
          WHERE r.id = p_race_id AND public.word_war_race_status(r) = 'finished'
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.word_war_racers me
          WHERE me.race_id = p_race_id AND me.user_id = auth.uid() AND me.left_at IS NULL
        )
      )
    )
  );
$$;

-- Trims a prompt; blank means free write. Raises when it is too long.
CREATE OR REPLACE FUNCTION public.word_war_race_clean_prompt(p_prompt text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_prompt text := nullif(trim(coalesce(p_prompt, '')), '');
BEGIN
  IF v_prompt IS NOT NULL AND char_length(v_prompt) > 1000 THEN
    RAISE EXCEPTION 'Keep the prompt under 1,000 characters.';
  END IF;
  RETURN v_prompt;
END;
$$;

CREATE OR REPLACE FUNCTION public.word_war_race_snapshot(p_race_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'race', to_jsonb(r) || jsonb_build_object('status', public.word_war_race_status(r)),
    'racers', coalesce((
      SELECT jsonb_agg(to_jsonb(x) - 'speed_budget' ORDER BY x.joined_at)
      FROM public.word_war_racers x
      WHERE x.race_id = r.id
    ), '[]'::jsonb),
    'server_now', clock_timestamp()
  )
  FROM public.word_war_races r
  WHERE r.id = p_race_id;
$$;

CREATE OR REPLACE FUNCTION public.word_war_race_find(p_race_id uuid, p_code text)
RETURNS public.word_war_races
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(trim(coalesce(p_code, '')));
  v_race public.word_war_races%ROWTYPE;
BEGIN
  IF v_code <> '' THEN
    SELECT * INTO v_race FROM public.word_war_races WHERE code = v_code;
    IF v_race.id IS NULL THEN
      RAISE EXCEPTION 'No race with that code.';
    END IF;
  ELSE
    SELECT * INTO v_race FROM public.word_war_races WHERE id = p_race_id;
    IF v_race.id IS NULL OR NOT public.can_see_word_war_race(v_race.id) THEN
      RAISE EXCEPTION 'Race not found. If it is private, ask for its code.';
    END IF;
  END IF;
  RETURN v_race;
END;
$$;

-- Takes one racer out of a race. In a lobby the host role passes on (or the
-- lobby closes when empty). In a race that is under way, the race ends once
-- nobody is left still writing.
CREATE OR REPLACE FUNCTION public.word_war_race_drop(p_race_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_race public.word_war_races%ROWTYPE;
  v_status text;
  v_next uuid;
BEGIN
  SELECT * INTO v_race FROM public.word_war_races WHERE id = p_race_id FOR UPDATE;
  IF v_race.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.word_war_racers
  SET left_at = now()
  WHERE race_id = p_race_id AND user_id = p_user_id AND left_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_status := public.word_war_race_status(v_race);

  IF v_status = 'lobby' THEN
    IF v_race.host_id = p_user_id THEN
      SELECT x.user_id INTO v_next
      FROM public.word_war_racers x
      WHERE x.race_id = p_race_id AND x.left_at IS NULL
      ORDER BY x.last_seen_at DESC
      LIMIT 1;

      IF v_next IS NULL THEN
        UPDATE public.word_war_races SET cancelled = true WHERE id = p_race_id;
      ELSE
        UPDATE public.word_war_races SET host_id = v_next WHERE id = p_race_id;
      END IF;
    END IF;
  ELSIF v_status IN ('countdown', 'running') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.word_war_racers x
      WHERE x.race_id = p_race_id AND x.left_at IS NULL AND x.finished_at IS NULL
    ) THEN
      UPDATE public.word_war_races SET ended_at = coalesce(ended_at, now()) WHERE id = p_race_id;
    END IF;
  END IF;
END;
$$;

-- A writer races in one race at a time.
CREATE OR REPLACE FUNCTION public.word_war_race_leave_others(p_keep_race_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_race_id uuid;
BEGIN
  FOR v_race_id IN
    SELECT x.race_id
    FROM public.word_war_racers x
    JOIN public.word_war_races r ON r.id = x.race_id
    WHERE x.user_id = p_user_id
      AND x.left_at IS NULL
      AND (p_keep_race_id IS NULL OR x.race_id <> p_keep_race_id)
      AND public.word_war_race_status(r) IN ('lobby', 'countdown', 'running')
  LOOP
    PERFORM public.word_war_race_drop(v_race_id, p_user_id);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------

-- Earlier versions without a prompt; replaced below (an overload would make
-- calls ambiguous).
DROP FUNCTION IF EXISTS public.create_word_war_race(integer, boolean, text);

CREATE OR REPLACE FUNCTION public.create_word_war_race(
  p_target_words integer DEFAULT 250,
  p_is_public boolean DEFAULT true,
  p_book_id text DEFAULT NULL,
  p_prompt text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target integer := coalesce(p_target_words, 250);
  v_book_id text := nullif(trim(coalesce(p_book_id, '')), '');
  v_prompt text := public.word_war_race_clean_prompt(p_prompt);
  v_title text;
  v_name text;
  v_avatar text;
  v_race_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to race.';
  END IF;
  IF v_target NOT IN (100, 250, 500, 1000) THEN
    RAISE EXCEPTION 'Pick 100, 250, 500 or 1,000 words.';
  END IF;
  IF v_book_id IS NULL THEN
    RAISE EXCEPTION 'Pick a book to race in.';
  END IF;
  v_title := public.word_war_race_book_title(v_book_id);
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'That book was not found.';
  END IF;

  SELECT m.display_name, m.avatar_url INTO v_name, v_avatar FROM public.word_war_race_me() m;

  PERFORM public.word_war_race_leave_others(NULL, v_uid);

  LOOP
    BEGIN
      INSERT INTO public.word_war_races (code, host_id, target_words, is_public, prompt)
      VALUES (public.gen_word_war_race_code(), v_uid, v_target, coalesce(p_is_public, true), v_prompt)
      RETURNING id INTO v_race_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  INSERT INTO public.word_war_racers (race_id, user_id, display_name, avatar_url, book_id, book_title)
  VALUES (v_race_id, v_uid, coalesce(v_name, 'Writer'), v_avatar, v_book_id, v_title);

  RETURN public.word_war_race_snapshot(v_race_id);
END;
$$;

DROP FUNCTION IF EXISTS public.update_word_war_race(uuid, integer, boolean);

-- Host only, while the lobby is open. p_set_prompt = true sets the prompt to
-- p_prompt (blank = free write) and clears everyone's request for a new one.
CREATE OR REPLACE FUNCTION public.update_word_war_race(
  p_race_id uuid,
  p_target_words integer DEFAULT NULL,
  p_is_public boolean DEFAULT NULL,
  p_prompt text DEFAULT NULL,
  p_set_prompt boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_race public.word_war_races%ROWTYPE;
  v_prompt text := public.word_war_race_clean_prompt(p_prompt);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to race.';
  END IF;
  SELECT * INTO v_race FROM public.word_war_races WHERE id = p_race_id FOR UPDATE;
  IF v_race.id IS NULL OR v_race.host_id <> v_uid THEN
    RAISE EXCEPTION 'Only the host can change the race.';
  END IF;
  IF public.word_war_race_status(v_race) <> 'lobby' THEN
    RAISE EXCEPTION 'The race has already started.';
  END IF;
  IF p_target_words IS NOT NULL AND p_target_words NOT IN (100, 250, 500, 1000) THEN
    RAISE EXCEPTION 'Pick 100, 250, 500 or 1,000 words.';
  END IF;

  UPDATE public.word_war_races
  SET target_words = coalesce(p_target_words, target_words),
      is_public = coalesce(p_is_public, is_public),
      prompt = CASE WHEN coalesce(p_set_prompt, false) THEN v_prompt ELSE prompt END
  WHERE id = p_race_id;

  IF coalesce(p_set_prompt, false) THEN
    UPDATE public.word_war_racers SET wants_new_prompt = false WHERE race_id = p_race_id;
  END IF;

  RETURN public.word_war_race_snapshot(p_race_id);
END;
$$;

-- Join by id (public races) or by code (any race). Joining again while the
-- lobby is open just changes your book.
CREATE OR REPLACE FUNCTION public.join_word_war_race(
  p_race_id uuid DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_book_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_book_id text := nullif(trim(coalesce(p_book_id, '')), '');
  v_race public.word_war_races%ROWTYPE;
  v_me public.word_war_racers%ROWTYPE;
  v_status text;
  v_title text;
  v_name text;
  v_avatar text;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to race.';
  END IF;

  v_race := public.word_war_race_find(p_race_id, p_code);
  SELECT * INTO v_race FROM public.word_war_races WHERE id = v_race.id FOR UPDATE;
  v_status := public.word_war_race_status(v_race);

  SELECT * INTO v_me FROM public.word_war_racers WHERE race_id = v_race.id AND user_id = v_uid;

  IF v_me.user_id IS NOT NULL AND v_me.left_at IS NULL THEN
    IF v_status = 'lobby' AND v_book_id IS NOT NULL THEN
      v_title := public.word_war_race_book_title(v_book_id);
      IF v_title IS NULL THEN
        RAISE EXCEPTION 'That book was not found.';
      END IF;
      UPDATE public.word_war_racers
      SET book_id = v_book_id, book_title = v_title, last_seen_at = now()
      WHERE race_id = v_race.id AND user_id = v_uid;
    END IF;
    RETURN public.word_war_race_snapshot(v_race.id);
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'That race was called off.';
  END IF;
  IF v_status <> 'lobby' THEN
    RAISE EXCEPTION 'That race has already started. You can still watch it.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.word_war_racers x
    WHERE x.race_id = v_race.id
      AND x.user_id = v_race.host_id
      AND x.left_at IS NULL
      AND x.last_seen_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'That race''s host has gone quiet. Try another race.';
  END IF;
  IF v_book_id IS NULL THEN
    RAISE EXCEPTION 'Pick a book to race in.';
  END IF;
  v_title := public.word_war_race_book_title(v_book_id);
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'That book was not found.';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.word_war_racers x
  WHERE x.race_id = v_race.id AND x.left_at IS NULL;
  IF v_count >= v_race.max_racers THEN
    RAISE EXCEPTION 'That race is full.';
  END IF;

  PERFORM public.word_war_race_leave_others(v_race.id, v_uid);

  SELECT m.display_name, m.avatar_url INTO v_name, v_avatar FROM public.word_war_race_me() m;

  INSERT INTO public.word_war_racers (race_id, user_id, display_name, avatar_url, book_id, book_title)
  VALUES (v_race.id, v_uid, coalesce(v_name, 'Writer'), v_avatar, v_book_id, v_title)
  ON CONFLICT (race_id, user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      book_id = EXCLUDED.book_id,
      book_title = EXCLUDED.book_title,
      words = 0,
      start_words = NULL,
      speed_budget = 0,
      peak_wpm = 0,
      finished_at = NULL,
      reported_at = NULL,
      wants_new_prompt = false,
      page_chapter_id = NULL,
      joined_at = now(),
      last_seen_at = now(),
      left_at = NULL;

  RETURN public.word_war_race_snapshot(v_race.id);
END;
$$;

-- Watching a private race needs its code once; after that the race is visible
-- to you by id.
CREATE OR REPLACE FUNCTION public.watch_word_war_race(
  p_race_id uuid DEFAULT NULL,
  p_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_race public.word_war_races%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to watch.';
  END IF;
  v_race := public.word_war_race_find(p_race_id, p_code);
  IF public.word_war_race_status(v_race) = 'cancelled' THEN
    RAISE EXCEPTION 'That race was called off.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.word_war_racers x WHERE x.race_id = v_race.id AND x.user_id = v_uid
  ) THEN
    INSERT INTO public.word_war_spectators (race_id, user_id)
    VALUES (v_race.id, v_uid)
    ON CONFLICT (race_id, user_id) DO NOTHING;
  END IF;
  RETURN public.word_war_race_snapshot(v_race.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_word_war_race(p_race_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_see_word_war_race(p_race_id) THEN
    RAISE EXCEPTION 'Race not found. If it is private, ask for its code.';
  END IF;
  RETURN public.word_war_race_snapshot(p_race_id);
END;
$$;

-- Public races you can join or watch, plus your own race if you are in one.
-- A lobby whose host has not checked in for a minute is left off the list.
CREATE OR REPLACE FUNCTION public.list_word_war_races(p_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent AS (
    SELECT
      r.*,
      public.word_war_race_status(r) AS status,
      EXISTS (
        SELECT 1 FROM public.word_war_racers x
        WHERE x.race_id = r.id AND x.user_id = auth.uid() AND x.left_at IS NULL
      ) AS is_mine,
      EXISTS (
        SELECT 1 FROM public.word_war_racers x
        WHERE x.race_id = r.id
          AND x.user_id = r.host_id
          AND x.left_at IS NULL
          AND x.last_seen_at > now() - interval '60 seconds'
      ) AS host_here
    FROM public.word_war_races r
    WHERE auth.uid() IS NOT NULL
      AND r.created_at > now() - interval '1 day'
      AND NOT r.cancelled
      AND r.ended_at IS NULL
  ),
  shown AS (
    SELECT *
    FROM recent
    WHERE status IN ('lobby', 'countdown', 'running')
      AND (is_mine OR (is_public AND (status <> 'lobby' OR host_here)))
    ORDER BY
      CASE WHEN is_mine THEN 0 WHEN status = 'lobby' THEN 1 ELSE 2 END,
      created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 30), 50))
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'prompt', s.prompt,
    'target_words', s.target_words,
    'is_public', s.is_public,
    'max_racers', s.max_racers,
    'created_at', s.created_at,
    'starts_at', s.starts_at,
    'status', s.status,
    'is_mine', s.is_mine,
    'racer_count', (
      SELECT count(*) FROM public.word_war_racers x
      WHERE x.race_id = s.id AND x.left_at IS NULL
    ),
    'host_name', (
      SELECT x.display_name FROM public.word_war_racers x
      WHERE x.race_id = s.id AND x.user_id = s.host_id
    )
  ) ORDER BY CASE WHEN s.is_mine THEN 0 WHEN s.status = 'lobby' THEN 1 ELSE 2 END, s.created_at DESC), '[]'::jsonb)
  FROM shown s;
$$;

-- Host only. Racers who stopped checking in are dropped, then the start is set
-- 5 seconds ahead so every screen counts down to the same moment.
CREATE OR REPLACE FUNCTION public.start_word_war_race(p_race_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_race public.word_war_races%ROWTYPE;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to race.';
  END IF;
  SELECT * INTO v_race FROM public.word_war_races WHERE id = p_race_id FOR UPDATE;
  IF v_race.id IS NULL OR v_race.host_id <> v_uid THEN
    RAISE EXCEPTION 'Only the host can start the race.';
  END IF;
  IF public.word_war_race_status(v_race) <> 'lobby' THEN
    RAISE EXCEPTION 'The race has already started.';
  END IF;

  UPDATE public.word_war_racers
  SET left_at = now()
  WHERE race_id = p_race_id
    AND left_at IS NULL
    AND user_id <> v_uid
    AND last_seen_at < now() - interval '60 seconds';

  SELECT count(*)::integer INTO v_count
  FROM public.word_war_racers x
  WHERE x.race_id = p_race_id AND x.left_at IS NULL;
  IF v_count < 2 THEN
    RAISE EXCEPTION 'You need at least one other writer to start.';
  END IF;

  UPDATE public.word_war_racers
  SET words = 0,
      start_words = NULL,
      speed_budget = 0,
      peak_wpm = 0,
      finished_at = NULL,
      reported_at = NULL,
      wants_new_prompt = false,
      page_chapter_id = NULL
  WHERE race_id = p_race_id AND left_at IS NULL;

  DELETE FROM public.word_war_pages WHERE race_id = p_race_id;

  UPDATE public.word_war_races
  SET starts_at = now() + interval '5 seconds'
  WHERE id = p_race_id;

  RETURN public.word_war_race_snapshot(p_race_id);
END;
$$;

-- The racer sends their own count (words gained since the start, minus pasted
-- words). The server lets it rise at most 150 words a minute, records the
-- finish, and ends the race when nobody is left writing. With p_words NULL this
-- is just a check-in.
DROP FUNCTION IF EXISTS public.report_word_war_progress(uuid, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.report_word_war_progress(
  p_race_id uuid,
  p_words integer DEFAULT NULL,
  p_start_words integer DEFAULT NULL,
  p_peak_wpm integer DEFAULT NULL,
  p_chapter_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_race public.word_war_races%ROWTYPE;
  v_me public.word_war_racers%ROWTYPE;
  v_status text;
  v_budget real;
  v_words integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to race.';
  END IF;
  SELECT * INTO v_race FROM public.word_war_races WHERE id = p_race_id FOR UPDATE;
  IF v_race.id IS NULL THEN
    RAISE EXCEPTION 'Race not found.';
  END IF;
  SELECT * INTO v_me FROM public.word_war_racers WHERE race_id = p_race_id AND user_id = v_uid;
  IF v_me.user_id IS NULL OR v_me.left_at IS NOT NULL THEN
    RAISE EXCEPTION 'You are not in this race.';
  END IF;
  v_status := public.word_war_race_status(v_race);

  -- Which chapter they write in, so a reloaded page reopens it.
  IF nullif(trim(coalesce(p_chapter_id, '')), '') IS NOT NULL
     AND v_me.page_chapter_id IS DISTINCT FROM left(p_chapter_id, 128) THEN
    UPDATE public.word_war_racers
    SET page_chapter_id = left(p_chapter_id, 128)
    WHERE race_id = p_race_id AND user_id = v_uid
    RETURNING * INTO v_me;
  END IF;

  IF p_start_words IS NOT NULL AND v_me.start_words IS NULL AND v_status IN ('countdown', 'running') THEN
    UPDATE public.word_war_racers
    SET start_words = greatest(0, p_start_words)
    WHERE race_id = p_race_id AND user_id = v_uid
    RETURNING * INTO v_me;
  END IF;

  IF p_words IS NULL OR v_status <> 'running' OR v_me.finished_at IS NOT NULL THEN
    -- Check-in only. Skip the write when the last one was recent.
    IF v_me.last_seen_at < v_now - interval '5 seconds' THEN
      UPDATE public.word_war_racers
      SET last_seen_at = v_now
      WHERE race_id = p_race_id AND user_id = v_uid
      RETURNING * INTO v_me;
    END IF;
    RETURN jsonb_build_object(
      'words', v_me.words,
      'start_words', v_me.start_words,
      'finished_at', v_me.finished_at,
      'status', v_status
    );
  END IF;

  v_budget := least(
    20,
    v_me.speed_budget
      + 2.5 * greatest(0, extract(epoch FROM v_now - coalesce(v_me.reported_at, v_race.starts_at)))
  );
  v_words := least(greatest(0, p_words), v_race.target_words);
  IF v_words > v_me.words THEN
    v_words := v_me.words + least(v_words - v_me.words, floor(v_budget)::integer);
    v_budget := v_budget - (v_words - v_me.words);
  END IF;

  UPDATE public.word_war_racers
  SET words = v_words,
      speed_budget = v_budget,
      reported_at = v_now,
      last_seen_at = v_now,
      peak_wpm = greatest(peak_wpm, least(greatest(coalesce(p_peak_wpm, 0), 0), 150)),
      finished_at = CASE WHEN v_words >= v_race.target_words THEN v_now END
  WHERE race_id = p_race_id AND user_id = v_uid
  RETURNING * INTO v_me;

  IF v_me.finished_at IS NOT NULL THEN
    UPDATE public.word_war_races
    SET first_finish_at = coalesce(first_finish_at, v_now)
    WHERE id = p_race_id;

    IF NOT EXISTS (
      SELECT 1 FROM public.word_war_racers x
      WHERE x.race_id = p_race_id AND x.left_at IS NULL AND x.finished_at IS NULL
    ) THEN
      UPDATE public.word_war_races SET ended_at = coalesce(ended_at, v_now) WHERE id = p_race_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'words', v_me.words,
    'start_words', v_me.start_words,
    'finished_at', v_me.finished_at,
    'status', v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_word_war_race(p_race_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to race.';
  END IF;
  PERFORM public.word_war_race_drop(p_race_id, auth.uid());
  RETURN jsonb_build_object('left', true);
END;
$$;

-- Cheers arrive in batches: { "<racer user id>": count, ... }. One batch per
-- person every 2 seconds, at most 40 cheers a batch, never for yourself.
CREATE OR REPLACE FUNCTION public.cheer_word_war_racers(p_race_id uuid, p_cheers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_race public.word_war_races%ROWTYPE;
  v_item record;
  v_count integer;
  v_left integer := 40;
  v_total integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to cheer.';
  END IF;
  IF NOT public.can_see_word_war_race(p_race_id) THEN
    RAISE EXCEPTION 'Race not found.';
  END IF;
  SELECT * INTO v_race FROM public.word_war_races WHERE id = p_race_id;
  IF public.word_war_race_status(v_race) NOT IN ('countdown', 'running', 'finished') THEN
    RETURN jsonb_build_object('accepted', 0);
  END IF;

  INSERT INTO public.word_war_spectators AS s (race_id, user_id, last_cheer_at)
  VALUES (p_race_id, v_uid, now())
  ON CONFLICT (race_id, user_id) DO UPDATE
  SET last_cheer_at = now()
  WHERE s.last_cheer_at IS NULL OR s.last_cheer_at < now() - interval '2 seconds';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('accepted', 0);
  END IF;

  FOR v_item IN SELECT key, value FROM jsonb_each_text(coalesce(p_cheers, '{}'::jsonb)) LOOP
    EXIT WHEN v_left <= 0;
    CONTINUE WHEN v_item.key = v_uid::text OR v_item.value !~ '^[0-9]{1,4}$';
    v_count := least(v_item.value::integer, v_left);
    CONTINUE WHEN v_count <= 0;
    UPDATE public.word_war_racers
    SET cheers = cheers + v_count
    WHERE race_id = p_race_id AND user_id::text = v_item.key;
    IF FOUND THEN
      v_left := v_left - v_count;
      v_total := v_total + v_count;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('accepted', v_total);
END;
$$;

-- Any racer from a finished race can open a rematch with the same settings.
-- Later callers join that rematch while its lobby is open.
CREATE OR REPLACE FUNCTION public.rematch_word_war_race(p_race_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_race public.word_war_races%ROWTYPE;
  v_me public.word_war_racers%ROWTYPE;
  v_next public.word_war_races%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to race.';
  END IF;
  SELECT * INTO v_race FROM public.word_war_races WHERE id = p_race_id FOR UPDATE;
  IF v_race.id IS NULL THEN
    RAISE EXCEPTION 'Race not found.';
  END IF;
  SELECT * INTO v_me FROM public.word_war_racers WHERE race_id = p_race_id AND user_id = v_uid;
  IF v_me.user_id IS NULL THEN
    RAISE EXCEPTION 'Only racers from this race can start a rematch.';
  END IF;
  IF public.word_war_race_status(v_race) <> 'finished' THEN
    RAISE EXCEPTION 'This race is still going.';
  END IF;

  IF v_race.rematch_id IS NOT NULL THEN
    SELECT * INTO v_next FROM public.word_war_races WHERE id = v_race.rematch_id;
    IF v_next.id IS NOT NULL THEN
      IF public.word_war_race_status(v_next) = 'lobby' THEN
        RETURN public.join_word_war_race(NULL, v_next.code, v_me.book_id);
      END IF;
      IF public.word_war_race_status(v_next) IN ('countdown', 'running') THEN
        RAISE EXCEPTION 'The rematch has already started. You can still watch it.';
      END IF;
    END IF;
  END IF;

  v_snapshot := public.create_word_war_race(v_race.target_words, v_race.is_public, v_me.book_id, v_race.prompt);
  UPDATE public.word_war_races
  SET rematch_id = (v_snapshot -> 'race' ->> 'id')::uuid
  WHERE id = p_race_id;
  RETURN v_snapshot;
END;
$$;

-- A racer (not the host) asks for a different prompt while the lobby is open.
-- The host sees who asked; changing the prompt clears every request.
CREATE OR REPLACE FUNCTION public.ask_word_war_prompt_change(p_race_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_race public.word_war_races%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to race.';
  END IF;
  SELECT * INTO v_race FROM public.word_war_races WHERE id = p_race_id;
  IF v_race.id IS NULL THEN
    RAISE EXCEPTION 'Race not found.';
  END IF;
  IF public.word_war_race_status(v_race) <> 'lobby' THEN
    RAISE EXCEPTION 'The race has already started.';
  END IF;
  IF v_race.host_id = v_uid THEN
    RAISE EXCEPTION 'You''re the host, so you can change the prompt yourself.';
  END IF;

  UPDATE public.word_war_racers
  SET wants_new_prompt = true, last_seen_at = now()
  WHERE race_id = p_race_id AND user_id = v_uid AND left_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join the race to ask for a different prompt.';
  END IF;

  RETURN public.word_war_race_snapshot(p_race_id);
END;
$$;

-- Public pages can be watched by spectators during the race and read by
-- everyone after it. Making a page private deletes what was shared.
CREATE OR REPLACE FUNCTION public.set_word_war_page_visibility(p_race_id uuid, p_is_public boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_public boolean := coalesce(p_is_public, true);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to race.';
  END IF;
  UPDATE public.word_war_racers
  SET is_page_public = v_public
  WHERE race_id = p_race_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not in this race.';
  END IF;
  IF NOT v_public THEN
    DELETE FROM public.word_war_pages WHERE race_id = p_race_id AND user_id = v_uid;
  END IF;
  RETURN jsonb_build_object('is_page_public', v_public);
END;
$$;

-- Shares the plain text of the chapter the racer is writing in. Only while
-- their page is public, from the countdown onward. Capped at 30,000 characters.
CREATE OR REPLACE FUNCTION public.save_word_war_page(
  p_race_id uuid,
  p_title text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_chapter_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_race public.word_war_races%ROWTYPE;
  v_me public.word_war_racers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to race.';
  END IF;
  SELECT * INTO v_race FROM public.word_war_races WHERE id = p_race_id;
  IF v_race.id IS NULL THEN
    RAISE EXCEPTION 'Race not found.';
  END IF;
  SELECT * INTO v_me FROM public.word_war_racers WHERE race_id = p_race_id AND user_id = v_uid;
  IF v_me.user_id IS NULL THEN
    RAISE EXCEPTION 'You are not in this race.';
  END IF;
  IF public.word_war_race_status(v_race) NOT IN ('countdown', 'running', 'finished') THEN
    RAISE EXCEPTION 'Pages open when the race starts.';
  END IF;
  IF NOT v_me.is_page_public THEN
    RAISE EXCEPTION 'Your page is private.';
  END IF;

  INSERT INTO public.word_war_pages (race_id, user_id, title, body, updated_at)
  VALUES (p_race_id, v_uid, left(coalesce(p_title, ''), 200), left(coalesce(p_body, ''), 30000), now())
  ON CONFLICT (race_id, user_id) DO UPDATE
  SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at;

  IF nullif(trim(coalesce(p_chapter_id, '')), '') IS NOT NULL THEN
    UPDATE public.word_war_racers
    SET page_chapter_id = left(p_chapter_id, 128)
    WHERE race_id = p_race_id AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('saved', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Row level security. All writes go through the functions above.
-- ---------------------------------------------------------------------------

ALTER TABLE public.word_war_races ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_war_racers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_war_spectators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_war_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS word_war_races_select ON public.word_war_races;
CREATE POLICY word_war_races_select ON public.word_war_races
  FOR SELECT TO authenticated
  USING (public.can_see_word_war_race(id));

DROP POLICY IF EXISTS word_war_racers_select ON public.word_war_racers;
CREATE POLICY word_war_racers_select ON public.word_war_racers
  FOR SELECT TO authenticated
  USING (public.can_see_word_war_race(race_id));

DROP POLICY IF EXISTS word_war_spectators_select ON public.word_war_spectators;
CREATE POLICY word_war_spectators_select ON public.word_war_spectators
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS word_war_pages_select ON public.word_war_pages;
CREATE POLICY word_war_pages_select ON public.word_war_pages
  FOR SELECT TO authenticated
  USING (public.can_read_word_war_page(race_id, user_id));

REVOKE ALL ON public.word_war_races, public.word_war_racers, public.word_war_spectators, public.word_war_pages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.word_war_races, public.word_war_racers, public.word_war_spectators, public.word_war_pages
  FROM authenticated;
GRANT SELECT ON public.word_war_races, public.word_war_racers, public.word_war_spectators, public.word_war_pages TO authenticated;

-- Signed-in users read the active prompts. Nobody writes them from the site.
ALTER TABLE public.word_war_prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS word_war_prompts_select ON public.word_war_prompts;
CREATE POLICY word_war_prompts_select ON public.word_war_prompts
  FOR SELECT TO authenticated
  USING (is_active);
REVOKE ALL ON public.word_war_prompts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.word_war_prompts FROM authenticated;
GRANT SELECT ON public.word_war_prompts TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Function access
-- ---------------------------------------------------------------------------

-- Internal: never callable from the browser.
REVOKE ALL ON FUNCTION public.word_war_race_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.word_war_race_find(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.word_war_race_drop(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.word_war_race_leave_others(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.word_war_race_me() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.word_war_race_book_title(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gen_word_war_race_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.word_war_race_clean_prompt(text) FROM PUBLIC, anon, authenticated;

-- Used by the row level security policies, so signed-in users need it.
REVOKE ALL ON FUNCTION public.can_see_word_war_race(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_word_war_race(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.word_war_race_status(public.word_war_races) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.word_war_race_status(public.word_war_races) TO authenticated;
REVOKE ALL ON FUNCTION public.can_read_word_war_page(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_word_war_page(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_word_war_race(integer, boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_word_war_race(uuid, integer, boolean, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_word_war_race(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.watch_word_war_race(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_word_war_race(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_word_war_races(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_word_war_race(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_word_war_progress(uuid, integer, integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_word_war_race(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cheer_word_war_racers(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rematch_word_war_race(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ask_word_war_prompt_change(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_word_war_page_visibility(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_word_war_page(uuid, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_word_war_race(integer, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_word_war_race(uuid, integer, boolean, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_word_war_race(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.watch_word_war_race(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_word_war_race(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_word_war_races(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_word_war_race(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_word_war_progress(uuid, integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_word_war_race(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cheer_word_war_racers(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rematch_word_war_race(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ask_word_war_prompt_change(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_word_war_page_visibility(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_word_war_page(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Live updates: race and racer rows stream to everyone who can see them.
--    Pages are left out on purpose: they can be long, so readers fetch the one
--    page they have open when its writer signals a change.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.word_war_races;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.word_war_racers;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Prompt collection: the Alysum Discord daily prompts, in order. Re-running
--    adds any that are missing and never duplicates. Line breaks are kept.
-- ---------------------------------------------------------------------------

INSERT INTO public.word_war_prompts (body)
VALUES
  ($p$"You were never meant to survive."$p$),
  ($p$"You remind me of someone I couldn’t save."$p$),
  ($p$“Do you know the hell I have been through? What I gave sacrificed for you? What I have done? It was all for you but you are still too damn weak."$p$),
  ($p$"I think I'm fighting a war that will never end, the thing is.... I don't think anyone else can see it."$p$),
  ($p$"I've lost everything, what more could you want from me?"$p$),
  ($p$"Monster! Fight me!"$p$),
  ($p$"I know you replay that day over and over in your head, telling yourself that if you had been just a couple minutes earlier, that tragedy would have never happened."$p$),
  ($p$"Come on, (your oc's name), show me the person everyone says you are! Show me why people shake in their boots when they see you! Show me the MONSTER!"$p$),
  ($p$"You had everything you ever wanted, and you threw it all away for them?!"$p$),
  ($p$"That's Captain to you, punk."$p$),
  ($p$"Say that again, I dare you."$p$),
  ($p$"Life is but a minor speck on the grand tapestry of eternity. What makes a miserable wretch like yourself think that they can challenge me?"$p$),
  ($p$"Kindness is a facade. I learned that the hard way."$p$),
  ($p$"When the truth and the lies start to feel the same, blurring together, how would you know what's true and what's foul?"$p$),
  ($p$"After everything you have been through, how can you still smile?"$p$),
  ($p$"What do you think you're doing? I didn't give you permission to die yet."$p$),
  ($p$"I swear to all your false deities and to the void of entropy and death, that I will send you and your world to the Abyss."$p$),
  ($p$"Someone once told me that protecting what was yours was the second most important thing you could do."$p$),
  ($p$"My dear, sweet, innocent child, I can give you whatever your heart is searching for," The purple-eyed woman said as she extended her hand. "However, it will come at a price, so think carefully before you accept."$p$),
  ($p$Your character is at a restaurant with their (SO/Best Friend/Boyfriend/Girlfriend/etc) and someone comes up to them and calls them by a different name, what happens?$p$),
  ($p$"Everyone has a price for turning traitor, name yours and I will do whatever I can to make it happen."$p$),
  ($p$Write a scene that would make the reader immediately hear: record scratch “Yep. That’s me. You’re probably wondering how I got here.”$p$),
  ($p$“Don’t say my name like that. You lost the right to make it sound like you still know me.”$p$),
  ($p$"Oh my gods! What happened to you?"$p$),
  ($p$"I hope you don't honestly believe I'm just going to let you leave."$p$),
  ($p$"I wish you were here to see it."$p$),
  ($p$"You will pay for what you've done!" He screamed
"What could you possibly do? I've already lost everything that matters, and I care not for my own life."$p$),
  ($p$"Everything is supposed to have a silver lining, or so I was told." (He/she/they) mused tilting (his/her/their) head back to gaze at the sky. "Might be difficult to see it with your death, but I shall not let it be in vain."$p$),
  ($p$"How can you possibly stay with him? He's murdered thousands!"
"I love him because he loves me. I know that if it came to me or the world he'd burn it down in a second. Not you. This world is more precious to you than I could ever hope to be."$p$),
  ($p$"I can't help but feel like we've missed something."
"Where's (oc)?"
"Dagnabit! We forgot them back at the (castle/bar/airport/etc)!"
"How do we keep forgetting them?"$p$),
  ($p$Your OC is in a horrible situation, in a horrible time, but with the right person. What do they do and how do things unfold?
Examples of a horrible situation:
- Someone just got shot/stabbed/etc
- All the computers at work broke
- The OC's friends leaked out chats way out of context to the internet and twisted it
Examples of a horrible time:
- The bus didn't come despite saying so on the app, and it's 2AM in the middle of nowhere
- The ER was loaded and could barely get through the list
- The stock market broke$p$),
  ($p$"You know what I hate most about you?" "What is it this time?" "Your face." "And why is that?" "I want to punch it every time I see it! It was perfectly proportioned to be infuriating!"$p$)
ON CONFLICT ((md5(body))) DO NOTHING;

NOTIFY pgrst, 'reload schema';
