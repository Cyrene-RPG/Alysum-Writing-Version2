-- Run once in Supabase → SQL Editor.
-- 1) Ensures last_login exists (required for streak tracking)
-- 2) Everyone gets streak >= 3
-- 3) Pheonixstreem gets streak 11
-- 4) last_login = today so the app won't reset counts on next visit

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login text;

-- Minimum streak for all users (keeps higher values unchanged)
UPDATE public.users
SET streak = GREATEST(COALESCE(streak, 0), 3)
WHERE COALESCE(streak, 0) < 3;

-- Your account
UPDATE public.users
SET streak = 11
WHERE lower(username) = lower('Pheonixstreem');

-- Mark everyone as logged in today (YYYY-MM-DD, matches app localDayKey format)
UPDATE public.users
SET last_login = to_char(CURRENT_DATE, 'YYYY-MM-DD')
WHERE last_login IS DISTINCT FROM to_char(CURRENT_DATE, 'YYYY-MM-DD');

-- Optional: verify
SELECT username, streak, last_login
FROM public.users
ORDER BY streak DESC, lower(username);
