SELECT public.assert_collaboration(current_database()='collaboration_test','disposable DB required');
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
SELECT public.assert_collaboration((SELECT count(*)=1 FROM public.books),'owner reads without RLS recursion');
SELECT public.assert_collaboration((SELECT count(*)=1 FROM public.book_editors),'owner can read existing membership');
SELECT public.assert_collaboration(public.list_book_collaborators('shared')->>'is_owner'='true','owner permissions');
SELECT public.assert_collaboration(NOT (public.list_book_collaborators('shared')::text LIKE '%@example%'),'roster does not disclose email addresses');
SELECT (public.create_book_editor_invite('shared','INVITED@example.test')->>'token') AS email_token \gset
SELECT (public.create_book_editor_invite('shared','')->>'token') AS open_token \gset
SELECT (public.create_book_editor_invite('shared','')->>'token') AS expires_token \gset
SELECT (public.create_book_editor_invite('shared','')->>'token') AS race_token \gset
DO $$ BEGIN
 BEGIN INSERT INTO public.book_share_invites(book_id,owner_id) VALUES('private',auth.uid());RAISE EXCEPTION 'Raw invite insert allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN INSERT INTO public.book_editors(book_id,user_id) VALUES('private',auth.uid());RAISE EXCEPTION 'Raw membership insert allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
SELECT public.assert_collaboration((SELECT count(*)=1 FROM public.books),'existing editor reads without recursion');
SELECT public.assert_collaboration((SELECT count(*)=1 FROM public.list_editable_books()),'shared book appears in editable books');
UPDATE public.books SET title='Editor title',sections='{"body":[{"id":"one","content":"Editor text"}]}' WHERE id='shared';
INSERT INTO storage.objects(bucket_id,name) VALUES('book-covers','shared/cover.png');
DO $$ BEGIN
 BEGIN UPDATE storage.objects SET bucket_id='other' WHERE name='shared/cover.png';RAISE EXCEPTION 'Cover escaped bucket';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('book-covers','private/cover.png');RAISE EXCEPTION 'Editor wrote unrelated cover';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT public.assert_collaboration((SELECT title='Editor title' FROM public.books WHERE id='shared'),'editor text/title update');
DO $$ BEGIN
 BEGIN UPDATE public.books SET user_id=auth.uid() WHERE id='shared';RAISE EXCEPTION 'Owner changed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%owner%transfer%' THEN RAISE; END IF;END;
 BEGIN UPDATE public.books SET is_published=true WHERE id='shared';RAISE EXCEPTION 'Editor changed publishing';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%publishing%' THEN RAISE; END IF;END;
 BEGIN PERFORM public.create_book_editor_invite('shared','');RAISE EXCEPTION 'Editor created invite';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Only the book owner%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.revoke_book_editor('shared','10000000-0000-0000-0000-000000000002');RAISE EXCEPTION 'Editor revoked member';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Only the book owner%' THEN RAISE;END IF;END;
END $$;
DELETE FROM public.books WHERE id='shared';
SELECT public.assert_collaboration((SELECT count(*)=1 FROM public.books),'editor cannot delete book');
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
SELECT public.assert_collaboration((SELECT count(*)=1 FROM public.books),'outsider only reads own book');
DO $$ BEGIN
 BEGIN PERFORM public.list_book_collaborators('shared');RAISE EXCEPTION 'Outsider read roster';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%no longer have editor access%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.accept_book_editor_invite(repeat('f',48));RAISE EXCEPTION 'Forged invite accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%no longer active%' THEN RAISE;END IF;END;
END $$;
-- Store psql variables for exception tests without interpolating SQL function bodies.
SELECT set_config('test.email_token',:'email_token',false);
DO $$ BEGIN
 BEGIN PERFORM public.accept_book_editor_invite(current_setting('test.email_token'));RAISE EXCEPTION 'Wrong email accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%verified email%' THEN RAISE;END IF;END;
END $$;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
DO $$ BEGIN
 BEGIN PERFORM public.accept_book_editor_invite(current_setting('test.email_token'));RAISE EXCEPTION 'Unverified email accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%verified email%' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now() WHERE id='10000000-0000-0000-0000-000000000002';
UPDATE public.book_share_invites SET expires_at=now()-interval '1 second' WHERE invite_token=:'expires_token';
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
SELECT public.assert_collaboration(public.accept_book_editor_invite(:'email_token')->>'book_id'='shared','verified intended account joins');
SELECT public.assert_collaboration(public.accept_book_editor_invite(:'email_token')->>'book_id'='shared','same-account acceptance retry is idempotent');
SELECT set_config('test.expires_token',:'expires_token',false);
DO $$ BEGIN
 BEGIN PERFORM public.accept_book_editor_invite(current_setting('test.expires_token'));RAISE EXCEPTION 'Expired token accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%expired%' THEN RAISE;END IF;END;
END $$;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
SELECT public.assert_collaboration(public.accept_book_editor_invite(:'open_token')->>'book_id'='shared','open link accepts one signed-in account');
SELECT set_config('test.open_token',:'open_token',false);
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
DO $$ BEGIN
 BEGIN PERFORM public.accept_book_editor_invite(current_setting('test.open_token'));RAISE EXCEPTION 'Consumed link granted another account';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%no longer active%' THEN RAISE;END IF;END;
END $$;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
SELECT public.revoke_book_editor('shared','10000000-0000-0000-0000-000000000002');
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
SELECT public.assert_collaboration((SELECT count(*)=0 FROM public.books),'revocation removes read access');
SELECT public.assert_collaboration((SELECT count(*)=0 FROM public.list_editable_books()),'revocation removes shared Studio entry');
DO $$ BEGIN
 BEGIN PERFORM public.accept_book_editor_invite(current_setting('test.email_token'));RAISE EXCEPTION 'Old consumed link restored revoked access';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%no longer active%' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
CREATE TEMP TABLE before_rerun AS SELECT title,sections,user_id FROM public.books WHERE id='shared';
\ir ../../../supabase/live-site/supabase-book-editors.sql
SELECT public.assert_collaboration((SELECT b.title=r.title AND b.sections=r.sections AND b.user_id=r.user_id FROM public.books b CROSS JOIN before_rerun r WHERE b.id='shared'),'rerun preserves manuscript');
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.create_book_editor_invite('shared','');RAISE EXCEPTION 'Anonymous invite creation allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.accept_book_editor_invite(repeat('a',64));RAISE EXCEPTION 'Anonymous invite acceptance allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SELECT 'All collaboration database checks passed' AS result;

