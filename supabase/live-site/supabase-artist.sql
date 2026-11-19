-- Artist tables, focus, image bucket, and public-gallery columns.
-- Additive. Safe to re-run on the live project.
-- Does not alter books or existing rows except adding nullable/default artist columns.
-- Gallery columns commit before storage setup, so a storage-policy error cannot roll them back.
-- The last result grid should show commission_columns_ready and character_offer_columns_ready as true.

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

-- Public gallery: adopt, buy, and commissions. Payment links stay off Alysum.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS commission_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commission_summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS commission_prices text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS commission_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS commission_slots integer;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_commission_summary_len;
ALTER TABLE public.users
  ADD CONSTRAINT users_commission_summary_len CHECK (char_length(commission_summary) <= 2000);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_commission_prices_len;
ALTER TABLE public.users
  ADD CONSTRAINT users_commission_prices_len CHECK (char_length(commission_prices) <= 500);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_commission_url_len;
ALTER TABLE public.users
  ADD CONSTRAINT users_commission_url_len CHECK (char_length(commission_url) <= 500);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_commission_slots_range;
ALTER TABLE public.users
  ADD CONSTRAINT users_commission_slots_range
  CHECK (commission_slots IS NULL OR (commission_slots >= 0 AND commission_slots <= 99));

COMMENT ON COLUMN public.users.commission_open IS
  'When true, this artist public gallery shows that commissions are open. Payment stays off Alysum.';
COMMENT ON COLUMN public.users.commission_url IS
  'Off-platform commission request link (Ko-fi, VGen, or the artist own page).';

ALTER TABLE public.artist_characters
  ADD COLUMN IF NOT EXISTS offer_kind text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS offer_status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS price_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS checkout_url text NOT NULL DEFAULT '';

ALTER TABLE public.artist_characters DROP CONSTRAINT IF EXISTS artist_characters_offer_kind_check;
ALTER TABLE public.artist_characters
  ADD CONSTRAINT artist_characters_offer_kind_check
  CHECK (offer_kind IN ('none', 'adopt', 'buy'));

ALTER TABLE public.artist_characters DROP CONSTRAINT IF EXISTS artist_characters_offer_status_check;
ALTER TABLE public.artist_characters
  ADD CONSTRAINT artist_characters_offer_status_check
  CHECK (offer_status IN ('available', 'pending', 'closed'));

ALTER TABLE public.artist_characters DROP CONSTRAINT IF EXISTS artist_characters_price_label_len;
ALTER TABLE public.artist_characters
  ADD CONSTRAINT artist_characters_price_label_len CHECK (char_length(price_label) <= 80);

ALTER TABLE public.artist_characters DROP CONSTRAINT IF EXISTS artist_characters_checkout_url_len;
ALTER TABLE public.artist_characters
  ADD CONSTRAINT artist_characters_checkout_url_len CHECK (char_length(checkout_url) <= 500);

COMMENT ON COLUMN public.artist_characters.offer_kind IS
  'none | adopt | buy — opt-in listing on the artist public gallery.';
COMMENT ON COLUMN public.artist_characters.checkout_url IS
  'Off-platform payment link. Alysum does not charge the buyer.';

ALTER TABLE public.artist_artworks
  ADD COLUMN IF NOT EXISTS offer_kind text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS offer_status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS price_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS checkout_url text NOT NULL DEFAULT '';

ALTER TABLE public.artist_artworks DROP CONSTRAINT IF EXISTS artist_artworks_offer_kind_check;
ALTER TABLE public.artist_artworks
  ADD CONSTRAINT artist_artworks_offer_kind_check
  CHECK (offer_kind IN ('none', 'buy'));

ALTER TABLE public.artist_artworks DROP CONSTRAINT IF EXISTS artist_artworks_offer_status_check;
ALTER TABLE public.artist_artworks
  ADD CONSTRAINT artist_artworks_offer_status_check
  CHECK (offer_status IN ('available', 'pending', 'closed'));

ALTER TABLE public.artist_artworks DROP CONSTRAINT IF EXISTS artist_artworks_price_label_len;
ALTER TABLE public.artist_artworks
  ADD CONSTRAINT artist_artworks_price_label_len CHECK (char_length(price_label) <= 80);

ALTER TABLE public.artist_artworks DROP CONSTRAINT IF EXISTS artist_artworks_checkout_url_len;
ALTER TABLE public.artist_artworks
  ADD CONSTRAINT artist_artworks_checkout_url_len CHECK (char_length(checkout_url) <= 500);

COMMENT ON COLUMN public.artist_artworks.offer_kind IS
  'none | buy — a protected public image listed for sale. Adoptables stay on the character.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Storage is its own step. A permissions error here must not undo the columns above.
DO $artist_media$
BEGIN
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
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'artist-media bucket was not changed (%). Create a public bucket named artist-media in Storage if image upload fails.', SQLERRM;
END
$artist_media$;

DO $artist_media_policies$
BEGIN
  BEGIN
    DROP POLICY IF EXISTS artist_media_public_read ON storage.objects;
    CREATE POLICY artist_media_public_read ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'artist-media');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'artist-media read policy was not changed (%).', SQLERRM;
  END;

  BEGIN
    DROP POLICY IF EXISTS artist_media_insert_own ON storage.objects;
    CREATE POLICY artist_media_insert_own ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'artist-media'
        AND (storage.foldername(name))[1] = (auth.uid())::text
      );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'artist-media insert policy was not changed (%).', SQLERRM;
  END;

  BEGIN
    DROP POLICY IF EXISTS artist_media_delete_own ON storage.objects;
    CREATE POLICY artist_media_delete_own ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'artist-media'
        AND (storage.foldername(name))[1] = (auth.uid())::text
      );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'artist-media delete policy was not changed (%).', SQLERRM;
  END;
END
$artist_media_policies$;

SELECT
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name IN (
        'commission_open',
        'commission_summary',
        'commission_prices',
        'commission_url',
        'commission_slots'
      )
  ) = 5 AS commission_columns_ready,
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'artist_characters'
      AND column_name IN ('offer_kind', 'offer_status', 'price_label', 'checkout_url')
  ) = 4 AS character_offer_columns_ready;
