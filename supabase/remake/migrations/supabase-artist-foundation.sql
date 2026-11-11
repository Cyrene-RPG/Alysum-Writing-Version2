-- Artist foundation (remake / staging only — do NOT run on live production).
-- Characters, provenance (3a), artist focus onboarding. Transfers (3b) in a later migration.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS artist_focus text,
  ADD COLUMN IF NOT EXISTS artist_hub_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS artist_bio text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.users.artist_focus IS
  'oc_adoptables | writer_artist | both — how Artist hub is tailored.';
COMMENT ON COLUMN public.users.artist_hub_ready IS
  'True after artist focus onboarding is completed.';

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_artist_focus_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_artist_focus_check
  CHECK (
    artist_focus IS NULL
    OR artist_focus IN ('oc_adoptables', 'writer_artist', 'both')
  );

CREATE TABLE IF NOT EXISTS public.artist_characters (
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  id text NOT NULL,
  slug text NOT NULL,
  display_name text NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 120),
  kind text NOT NULL DEFAULT 'oc'
    CHECK (kind IN ('oc', 'adoptable', 'cast', 'sona')),
  creator_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  trade_policy text NOT NULL DEFAULT 'none'
  CHECK (trade_policy IN ('none', 'gift', 'trade', 'resell')),
  terms_text text NOT NULL DEFAULT '' CHECK (char_length(terms_text) <= 8000),
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  summary text NOT NULL DEFAULT '',
  portrait_url text NOT NULL DEFAULT '',
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  folder_id text,
  sort_key integer NOT NULL DEFAULT 0,
  provenance_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, slug)
);

CREATE INDEX IF NOT EXISTS artist_characters_owner_updated_idx
  ON public.artist_characters (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.artist_artworks (
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  id text NOT NULL,
  character_id text,
  storage_path text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 2000),
  public_url text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  protection_declared text
    CHECK (
      protection_declared IS NULL
      OR protection_declared IN ('glaze', 'nightshade', 'both')
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, character_id)
    REFERENCES public.artist_characters (owner_id, id)
    ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.artist_artwork_public_ok()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.visibility = 'public' AND NEW.protection_declared IS NULL THEN
    RAISE EXCEPTION 'Public artworks must declare Glaze and/or Nightshade protection.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artist_artwork_public_guard ON public.artist_artworks;
CREATE TRIGGER artist_artwork_public_guard
  BEFORE INSERT OR UPDATE ON public.artist_artworks
  FOR EACH ROW
  EXECUTE FUNCTION public.artist_artwork_public_ok();

ALTER TABLE public.artist_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_artworks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS artist_characters_own ON public.artist_characters;
CREATE POLICY artist_characters_own ON public.artist_characters
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS artist_characters_public_read ON public.artist_characters;
CREATE POLICY artist_characters_public_read ON public.artist_characters
  FOR SELECT TO anon, authenticated
  USING (visibility = 'public');

DROP POLICY IF EXISTS artist_artworks_own ON public.artist_artworks;
CREATE POLICY artist_artworks_own ON public.artist_artworks
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS artist_artworks_public_read ON public.artist_artworks;
CREATE POLICY artist_artworks_public_read ON public.artist_artworks
  FOR SELECT TO anon, authenticated
  USING (visibility = 'public');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_characters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_artworks TO authenticated;
GRANT SELECT ON public.artist_characters TO anon;
GRANT SELECT ON public.artist_artworks TO anon;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'artist-media',
  'artist-media',
  true,
  12582912,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 12582912;

DROP POLICY IF EXISTS artist_media_public_read ON storage.objects;
CREATE POLICY artist_media_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'artist-media');

DROP POLICY IF EXISTS artist_media_insert_own ON storage.objects;
CREATE POLICY artist_media_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'artist-media'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS artist_media_delete_own ON storage.objects;
CREATE POLICY artist_media_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'artist-media'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

COMMIT;
