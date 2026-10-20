-- DISPOSABLE notifications_test database, after the existing inbox tests.
INSERT INTO public.library(id,user_id,data) VALUES
('subscription-old','10000000-0000-0000-0000-000000000002',
'{"title":"Existing book","isPublished":true,"publishedChapterIds":["c1"],"chapters":[{"id":"c1","title":"Old chapter","wordCount":600},{"id":"scheduled","title":"Not yet","wordCount":600}]}');
