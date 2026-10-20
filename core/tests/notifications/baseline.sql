-- Existing activity before activation must not produce new inbox entries.
INSERT INTO public.author_follows(follower_id,author_id)
    VALUES ('10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002');
INSERT INTO public.announcements(id,author_id,scope,category,title,body,status,published_at)
    VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
        'author','announcement','Old announcement','Old post','published',now());
