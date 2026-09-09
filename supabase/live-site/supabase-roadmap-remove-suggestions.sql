-- Remove specific suggestion filings and their votes / replies / downvotes.
-- Apply on the live project. Safe to re-run.

DELETE FROM public.roadmap_votes
WHERE target_kind = 'suggestion'
  AND target_stub IN (
    SELECT stub FROM public.roadmap_suggestions
    WHERE stub IN (3, 4)
       OR lower(trim(title)) IN ('more theme slots', 'tezt', 'test ur mom')
  );

DELETE FROM public.roadmap_downvotes
WHERE target_kind = 'suggestion'
  AND target_stub IN (
    SELECT stub FROM public.roadmap_suggestions
    WHERE stub IN (3, 4)
       OR lower(trim(title)) IN ('more theme slots', 'tezt', 'test ur mom')
  );

DELETE FROM public.roadmap_replies
WHERE bug_stub IN (
  SELECT stub FROM public.roadmap_suggestions
  WHERE stub IN (3, 4)
     OR lower(trim(title)) IN ('more theme slots', 'tezt', 'test ur mom')
);

DELETE FROM public.roadmap_suggestions
WHERE stub IN (3, 4)
   OR lower(trim(title)) IN ('more theme slots', 'tezt', 'test ur mom');
