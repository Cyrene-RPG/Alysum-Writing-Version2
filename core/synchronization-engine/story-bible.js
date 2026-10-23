import { defaultEntryTypes, validateEntry, validateTemplate, extractWikiLinks } from '../encyclopedia/model.js';
function convert(row) {
    if (Array.isArray(row)) return row.map(convert);
    if (!row || typeof row !== 'object') return row;
    // JSON values and template definitions belong to the domain, not the SQL mapper.
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), ['fields', 'custom_fields', 'sections', 'aliases', 'tags', 'options'].includes(key) ? value : convert(value)]));
}
export function createStoryBibleApi(client, { userId = null } = {}) {
    async function checkSession() {
        if (!userId) return;
        const { data, error } = await client.auth.getSession();
        if (error || data.session?.user?.id !== userId) throw new Error("Your account changed. Reopen Story Bible before continuing.");
    }
    async function rpc(name, args) {
        await checkSession();
        const { data, error } = await client.rpc(name, args);
        await checkSession();
        if (error) throw error;
        return convert(data);
    }
    async function list(table, bibleId, extra = {}) {
        await checkSession();
        let request = client.from(table).select('*').eq('bible_id', bibleId);
        for (const [key, value] of Object.entries(extra)) request = request.eq(key, value);
        const { data, error } = await request;
        if (error) throw error;
        await checkSession();
        return convert(data || []);
    }
    return {
        async openBible(bibleId) {
            await checkSession();
            const { data, error } = await client.from('story_bibles').select('*').eq('id', bibleId).single();
            if (error) throw error;
            const role = await rpc('get_story_bible_role', { p_bible_id: bibleId });
            if (!role) throw new Error('You do not have access to this Story Bible.');
            return { ...convert(data), role };
        },
        async readSavedManuscript(bookId) {
            await checkSession();
            const { data, error } = await client.from('books').select('sections,updated').eq('id', bookId).single();
            if (error) throw error;
            await checkSession();
            return convert(data);
        },
        async openBook(bookId, create = false) {
            return rpc('open_story_bible', { p_book_id: bookId, p_create: create, p_templates: defaultEntryTypes() });
        },
        async load(bibleId) {
            const tables = ['story_bible_entries', 'story_bible_entry_types', 'story_bible_connections', 'story_bible_canon_facts', 'story_bible_mentions', 'story_bible_members'];
            const rows = await Promise.all(tables.map(table => list(table, bibleId)));
            return Object.fromEntries(['entries', 'types', 'connections', 'facts', 'mentions', 'members'].map((key, index) => [key, rows[index]]));
        },
        async saveEntry(entry, template) {
            const clean = validateEntry(entry);
            return rpc('save_story_bible_entry', { p_bible_id: clean.bibleId, p_entry_id: clean.id || null, p_revision: clean.revision || 0,
                p_data: { title: clean.title, type_id: clean.typeId, aliases: clean.aliases, tags: clean.tags, fields: clean.fields || {}, custom_fields: clean.customFields || [], sections: clean.sections || {}, portrait_path: clean.portraitPath || null, archived: Boolean(clean.archivedAt) },
                p_links: extractWikiLinks(clean.sections, clean.fields, [...(template?.fields || []), ...(clean.customFields || [])]) });
        },
        saveType(bibleId, template) { return rpc('save_story_bible_type', { p_bible_id: bibleId, p_type_id: template.id || null, p_revision: template.revision || 0, p_data: validateTemplate(template) }); },
        connect(bibleId, sourceId, targetId, label, reverseLabel = '') { return rpc('connect_story_bible_entries', { p_bible_id: bibleId, p_source: sourceId, p_target: targetId, p_label: label, p_reverse: reverseLabel }); },
        removeConnection(bibleId, id) { return rpc('remove_story_bible_connection', { p_bible_id: bibleId, p_id: id }); },
        addFact(bibleId, entryId, fact) { return rpc('add_story_bible_fact', { p_bible_id: bibleId, p_entry_id: entryId, p_data: fact }); },
        indexMentions(bibleId, bookId, chapterId, mentions, expectedUpdated) { return rpc('replace_story_bible_mentions', { p_bible_id: bibleId, p_book_id: bookId, p_chapter_id: chapterId, p_mentions: mentions, p_expected_updated: expectedUpdated }); },
        listVersions(bibleId, entryId) { return list('story_bible_entry_versions', bibleId, { entry_id: entryId }); },
        setMember(bibleId, email, role) { return rpc('set_story_bible_member', { p_bible_id: bibleId, p_email: email, p_role: role }); },
        async uploadPortrait(bibleId, file) {
            await checkSession();
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPEG, PNG, or WebP image smaller than 5 MB.');
            const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
            const path = `${bibleId}/${crypto.randomUUID()}.${extension}`;
            const { error } = await client.storage.from('story-bible-portraits').upload(path, file, { contentType: file.type, upsert: false });
            if (error) throw error;
            return path;
        },
        async portraitUrl(path) {
            await checkSession();
            if (!path) return '';
            const { data, error } = await client.storage.from('story-bible-portraits').createSignedUrl(path, 300);
            if (error) throw error;
            return data.signedUrl;
        },
    };
}
