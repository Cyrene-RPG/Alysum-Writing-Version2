-- TEST BRANCH: optional grouping for independent book/draft records.
-- Apply only to a test database while evaluating this feature.
-- Existing manuscripts, sections, save paths and RLS policies are unchanged.
BEGIN;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS draft_parent_id text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS draft_label text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.books'::regclass AND conname = 'books_draft_parent_fk') THEN
    ALTER TABLE public.books ADD CONSTRAINT books_draft_parent_fk FOREIGN KEY (draft_parent_id) REFERENCES public.books(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.books'::regclass AND conname = 'books_draft_label_length') THEN
    ALTER TABLE public.books ADD CONSTRAINT books_draft_label_length CHECK (draft_label IS NULL OR char_length(btrim(draft_label)) BETWEEN 1 AND 80);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS books_draft_parent_idx ON public.books(draft_parent_id) WHERE draft_parent_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.validate_draft_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE parent public.books;
BEGIN
  IF NEW.draft_parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.id = NEW.draft_parent_id THEN RAISE EXCEPTION 'A draft cannot be its own parent'; END IF;
  IF EXISTS (SELECT 1 FROM public.books WHERE draft_parent_id = NEW.id) THEN
    RAISE EXCEPTION 'An original book with drafts cannot become a child draft';
  END IF;
  SELECT * INTO parent FROM public.books WHERE id = NEW.draft_parent_id;
  IF NOT FOUND OR parent.user_id <> NEW.user_id OR parent.draft_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Choose an original book owned by the same writer';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS books_validate_draft_parent ON public.books;
CREATE TRIGGER books_validate_draft_parent BEFORE INSERT OR UPDATE OF draft_parent_id, user_id ON public.books FOR EACH ROW EXECUTE FUNCTION public.validate_draft_parent();
NOTIFY pgrst, 'reload schema';
COMMIT;
