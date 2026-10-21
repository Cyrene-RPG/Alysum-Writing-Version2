-- Disposable notifications_test only.
SELECT public.test_inbox_assert(current_database()='notifications_test','disposable database required');
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_image_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
UPDATE public.users SET email='PRIVATE-EMAIL@example.invalid';
DELETE FROM public.author_follows;
DELETE FROM public.book_subscriptions;
INSERT INTO public.author_follows(follower_id,author_id) VALUES
('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000006');
INSERT INTO public.library(id,user_id,data) VALUES
('connections-visible','10000000-0000-0000-0000-000000000001','{"title":"Visible book","isPublished":true}'),
('connections-hidden','10000000-0000-0000-0000-000000000001','{"title":"PRIVATE HIDDEN TITLE","isPublished":true}'),
('connections-draft','10000000-0000-0000-0000-000000000001','{"title":"PRIVATE DRAFT TITLE","isPublished":false}'),
('connections-other','10000000-0000-0000-0000-000000000001','{"title":"Other reader book","isPublished":true}');
INSERT INTO public.library_book_moderation VALUES('connections-hidden','hidden');
INSERT INTO public.book_subscriptions(subscriber_id,book_id) VALUES
('10000000-0000-0000-0000-000000000003','connections-visible'),
('10000000-0000-0000-0000-000000000003','connections-hidden'),
('10000000-0000-0000-0000-000000000003','connections-draft'),
('10000000-0000-0000-0000-000000000004','connections-other');
