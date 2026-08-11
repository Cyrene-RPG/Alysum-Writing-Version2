-- Author tip / support links for public author pages.
-- Safe to re-run. Depends on public.users (supabase-base-schema.sql).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS support_links jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS support_links_updated_at timestamptz;

COMMENT ON COLUMN public.users.support_links IS
  'Public tip/support URLs shown on author.html (paypal, kofi, cashapp, patreon, website, social, other).';
COMMENT ON COLUMN public.users.support_links_updated_at IS
  'When the author last saved their support links.';
