-- Author biography for public profile pages and reader end-of-book sections.
-- Safe to re-run.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio_updated_at timestamptz;

COMMENT ON COLUMN public.users.bio IS 'Public author biography shown on author.html and at the end of published books.';
COMMENT ON COLUMN public.users.bio_updated_at IS 'When the author last saved their biography.';
