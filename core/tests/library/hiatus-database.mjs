import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const migration = await readFile(new URL('../../../supabase/live-site/supabase-book-hiatus.sql', import.meta.url), 'utf8');
const author = '00000000-0000-0000-0000-000000000001';
const reader = '00000000-0000-0000-0000-000000000002';

test('30-day reminders, deduplication, author activity, privacy, completion and hiatus', async () => {
    const db = new PGlite();
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
            CREATE TABLE auth.users(id uuid PRIMARY KEY);
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
            GRANT USAGE ON SCHEMA auth TO anon,authenticated;
            GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
            CREATE TABLE public.books(id text PRIMARY KEY,user_id uuid,created bigint,updated bigint,publish_meta jsonb DEFAULT '{}');
            CREATE TABLE public.library(id text PRIMARY KEY,user_id uuid,data jsonb);
            CREATE TABLE public.library_book_moderation(book_id text PRIMARY KEY,visibility text);
            CREATE FUNCTION public.mc_visible(text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT NOT EXISTS(SELECT 1 FROM public.library_book_moderation WHERE book_id=$1 AND visibility IN ('hidden','removed'))$$;
            CREATE TABLE public.inbox_notifications(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,recipient_id uuid,kind text CONSTRAINT inbox_notifications_kind_check CHECK(kind IN ('follower','moderation_message','chapter_comment')),book_id text REFERENCES public.library(id) ON DELETE SET NULL,title text,message text,source_key text,UNIQUE(recipient_id,source_key));
            INSERT INTO auth.users VALUES('${author}'),('${reader}');`);
        for (const [id, days, data, meta] of [
            ['stale', 31, {}, {}], ['recent', 29, {}, {}], ['boundary', 30, {}, {}],
            ['complete', 45, { serializationStatus: 'complete' }, {}],
            ['meta-complete', 45, {}, { complete: true }],
            ['unpublished', 45, { isPublished: false }, {}], ['hidden', 45, {}, {}],
        ]) {
            await db.query(`INSERT INTO public.books VALUES($1,$2,0,(extract(epoch FROM now()-make_interval(days=>$3))*1000)::bigint,$4)`, [id, author, days, meta]);
            await db.query('INSERT INTO public.library VALUES($1,$2,$3)', [id, author, { title: id, ...data }]);
        }
        await db.exec("INSERT INTO public.library_book_moderation VALUES('hidden','hidden')");
        await db.exec(migration);
        await db.exec(migration);
        // A fixed transaction snapshot makes the strict >30-day boundary deterministic.
        await db.exec('BEGIN');
        await db.exec("UPDATE public.book_inactivity SET last_author_update=now()-interval '30 days' WHERE book_id='boundary'");
        const deliver = async () => Number((await db.query('SELECT public.deliver_book_inactivity_notifications() AS n')).rows[0].n);
        assert.equal(await deliver(), 1);
        assert.equal(await deliver(), 0);
        await db.exec('COMMIT');
        const alerts = (await db.query('SELECT * FROM public.inbox_notifications')).rows;
        assert.equal(alerts.length, 1);
        assert.equal(alerts[0].book_id, 'stale');
        assert.equal(alerts[0].recipient_id, author);
        assert.match(alerts[0].message, /30 days.*hiatus/);
        const savedDate = (await db.query("SELECT last_author_update FROM public.book_inactivity WHERE book_id='stale'")).rows[0].last_author_update;
        async function identity(id, role = 'authenticated') {
            await db.exec('RESET ROLE');
            await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
            await db.exec(`SET ROLE ${role}`);
        }
        await identity(reader);
        await assert.rejects(db.query("SELECT public.set_book_hiatus('stale',true)"), /Only the author/);
        await assert.rejects(db.exec('SELECT public.deliver_book_inactivity_notifications()'), /permission denied/);
        await assert.rejects(db.exec('SELECT * FROM public.book_inactivity'), /permission denied/);
        assert.equal((await db.query('SELECT * FROM public.get_book_inactivity_notification_target($1)', [alerts[0].id])).rows.length, 0);
        await identity(author);
        assert.equal((await db.query('SELECT * FROM public.get_book_inactivity_notification_target($1)', [alerts[0].id])).rows[0].book_id, 'stale');
        const paused = (await db.query("SELECT public.set_book_hiatus('stale',true) AS s")).rows[0].s;
        assert.equal(paused.isOnHiatus, true);
        assert.equal(Date.parse(paused.lastAuthorUpdate), new Date(savedDate).getTime());
        await assert.rejects(db.query("SELECT public.set_book_hiatus('complete',true)"), /Completed books/);
        await identity('', 'anon');
        const publicStatus = (await db.query("SELECT public.get_book_hiatus('stale') AS s")).rows[0].s;
        assert.equal(publicStatus.isOnHiatus, true);
        assert.equal(publicStatus.canManage, false);
        for (const id of ['hidden', 'unpublished']) assert.equal((await db.query('SELECT public.get_book_hiatus($1) AS s', [id])).rows[0].s, null);
        await db.exec('RESET ROLE');
        // Reader counters must never change author activity.
        await db.exec("UPDATE public.library SET data=data||'{\"readers\":42}' WHERE id='stale'");
        assert.equal(new Date((await db.query("SELECT last_author_update FROM public.book_inactivity WHERE book_id='stale'")).rows[0].last_author_update).getTime(), new Date(savedDate).getTime());
        await identity(author);
        assert.equal((await db.query("SELECT public.set_book_hiatus('stale',false) AS s")).rows[0].s.isOnHiatus, false);
        await db.exec('RESET ROLE');
        // Authenticated author edits reset inactivity; the next inactive period gets a new reminder.
        await db.exec("UPDATE public.books SET updated=updated+1 WHERE id='stale'");
        const fresh = (await db.query("SELECT last_author_update FROM public.book_inactivity WHERE book_id='stale'")).rows[0].last_author_update;
        assert.ok(new Date(fresh) > new Date(savedDate));
        // Put the other boundary fixture back in the recent window.
        await db.exec("UPDATE public.book_inactivity SET last_author_update=now() WHERE book_id='boundary'");
        assert.equal(await deliver(), 0);
        await db.exec("UPDATE public.book_inactivity SET last_author_update=now()-interval '32 days' WHERE book_id='stale'");
        assert.equal(await deliver(), 1);
        await identity(author);
        await db.query("SELECT public.set_book_hiatus('stale',true)");
        await db.exec('RESET ROLE');
        await db.exec("UPDATE public.book_inactivity SET last_author_update=now()-interval '34 days' WHERE book_id='stale'");
        assert.equal(await deliver(), 0);
        // Completed books suppress an old hiatus notice without changing author activity.
        await db.exec("UPDATE public.books SET publish_meta='{\"complete\":true}' WHERE id='stale'");
        assert.equal((await db.query("SELECT public.get_book_hiatus('stale') AS s")).rows[0].s.isOnHiatus, false);
        await db.exec(migration);
        assert.equal((await db.query('SELECT count(*) AS n FROM public.inbox_notifications')).rows[0].n, 2);
        // Library publication is tracked, including newly listed manuscripts.
        await db.query("INSERT INTO public.books VALUES('new',$1,0,0,'{}')", [author]);
        await db.query("INSERT INTO public.library VALUES('new',$1,'{}')", [author]);
        assert.equal((await db.query("SELECT count(*) AS n FROM public.book_inactivity WHERE book_id='new'")).rows[0].n, 1);
        await db.exec("DELETE FROM public.library WHERE id='stale'");
        assert.equal((await db.query("SELECT count(*) AS n FROM public.book_inactivity WHERE book_id='stale'")).rows[0].n, 0);
    } finally { await db.close(); }
});
