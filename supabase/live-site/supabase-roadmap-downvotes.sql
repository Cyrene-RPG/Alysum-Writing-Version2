-- Downvotes on features and bugs. Safe to re-run.
-- Do not run remake SQL against this project.

CREATE TABLE IF NOT EXISTS public.roadmap_downvotes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('bug', 'suggestion')),
  target_stub integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_kind, target_stub)
);

ALTER TABLE public.roadmap_downvotes DROP CONSTRAINT IF EXISTS roadmap_downvotes_target_kind_check;
ALTER TABLE public.roadmap_downvotes
  ADD CONSTRAINT roadmap_downvotes_target_kind_check
  CHECK (target_kind IN ('bug', 'suggestion'));

ALTER TABLE public.roadmap_downvotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roadmap_downvotes_select" ON public.roadmap_downvotes;
CREATE POLICY "roadmap_downvotes_select" ON public.roadmap_downvotes
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "roadmap_downvotes_insert_own" ON public.roadmap_downvotes;
CREATE POLICY "roadmap_downvotes_insert_own" ON public.roadmap_downvotes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "roadmap_downvotes_delete_own" ON public.roadmap_downvotes;
CREATE POLICY "roadmap_downvotes_delete_own" ON public.roadmap_downvotes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
