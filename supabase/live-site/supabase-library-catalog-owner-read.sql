-- Already applied to the live project on 2026-10-01. Safe to re-run in Supabase → SQL Editor.
--
-- library_catalog must read public.library as its owner (not as the visitor), or logged-out
-- visitors get "permission denied for table library" and the homepage + Library page show nothing.
-- The view still strips all chapter text (see supabase-library-ai-protection.sql), and anon still
-- cannot select public.library directly, so the scraping protection is unchanged.
--
-- Supabase's Security Advisor flags this view as "Security Definer View". That is expected here:
-- do NOT apply its suggested fix (security_invoker = true), or the public library breaks again.

ALTER VIEW public.library_catalog SET (security_invoker = false);
GRANT SELECT ON public.library_catalog TO anon, authenticated;
