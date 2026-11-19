-- Public gallery offers: adopt, buy, and commissions.
-- Payment links point off Alysum. Safe to re-run. Run after supabase-artist-foundation.sql.

BEGIN;

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
  'When true, this artist’s public gallery shows that commissions are open. Payment stays off Alysum.';
COMMENT ON COLUMN public.users.commission_url IS
  'Off-platform commission request link (Ko-fi, VGen, or the artist’s own page).';

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
