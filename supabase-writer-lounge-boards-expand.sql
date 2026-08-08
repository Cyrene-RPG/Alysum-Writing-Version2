-- Run once in Supabase → SQL Editor (safe to re-run).
-- Adds General Chat + expanded genre forums to Writer's Lounge.
-- Also included in supabase-writer-lounge.sql seed block.

INSERT INTO public.lounge_boards (category_id, slug, title, description, sort_order, is_locked)
SELECT c.id, v.slug, v.title, v.description, v.sort_order, v.is_locked
FROM (
  VALUES
    ('community', 'general-chat', 'General Chat', 'Anything goes — life updates, writing-adjacent rambles, and off-topic banter.', 5, false),
    ('genre', 'sci-fi', 'Sci-Fi', 'Space opera, cyberpunk, near-future, and astrophysics headaches.', 30, false),
    ('genre', 'mystery-thriller', 'Mystery & Thriller', 'Clues, red herrings, and the art of the reveal.', 40, false),
    ('genre', 'horror', 'Horror', 'Dread, gore levels, and things that go bump in the draft.', 50, false),
    ('genre', 'literary-fiction', 'Literary Fiction', 'Character study, prose experiments, and quiet devastation.', 60, false),
    ('genre', 'historical-fiction', 'Historical Fiction', 'Period research, anachronisms, and corset logistics.', 70, false),
    ('genre', 'young-adult', 'Young Adult', 'Teen voices, coming-of-age beats, and age-appropriate stakes.', 80, false),
    ('genre', 'contemporary', 'Contemporary', 'Present-day settings, real-world themes, and kitchen-sink drama.', 90, false),
    ('genre', 'fanfiction', 'Fanfiction', 'Transformative works, AU brainstorming, and canon debates.', 100, false)
) AS v(category_slug, slug, title, description, sort_order, is_locked)
JOIN public.lounge_categories c ON c.slug = v.category_slug
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_locked = EXCLUDED.is_locked;
